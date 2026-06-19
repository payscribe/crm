import type { SupabaseClient } from "@supabase/supabase-js";
import { leadProductInterests } from "@/lib/constants/leads";
import { productAreas } from "@/lib/constants/product-events";
import {
  ticketCategories,
  ticketSubCategoriesByCategory
} from "@/lib/constants/tickets";
import type { TicketCategory } from "@/lib/types/tickets";

export type ManagedOptionGroup =
  | "lead_product_interest"
  | "ticket_sub_category"
  | "product_area";

export type ManagedOption = {
  option_id: string;
  option_group: ManagedOptionGroup;
  label: string;
  parent_label: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const fallbackByGroup: Record<ManagedOptionGroup, ManagedOption[]> = {
  lead_product_interest: leadProductInterests.map((label, index) =>
    fallbackOption("lead_product_interest", label, null, index + 1)
  ),
  product_area: productAreas.map((label, index) =>
    fallbackOption("product_area", label, null, index + 1)
  ),
  ticket_sub_category: ticketCategories.flatMap((category) =>
    ticketSubCategoriesByCategory[category].map((label, index) =>
      fallbackOption("ticket_sub_category", label, category, index + 1)
    )
  )
};

function fallbackOption(
  optionGroup: ManagedOptionGroup,
  label: string,
  parentLabel: string | null,
  sortOrder: number
): ManagedOption {
  return {
    option_id: `${optionGroup}:${parentLabel ?? "root"}:${label}`,
    option_group: optionGroup,
    label,
    parent_label: parentLabel,
    sort_order: sortOrder,
    is_active: true,
    created_at: "",
    updated_at: ""
  };
}

function uniqueLabels(options: ManagedOption[]) {
  return Array.from(new Set(options.map((option) => option.label)));
}

export function mergeHistoricalLabels(
  activeLabels: string[],
  historicalLabels: Array<string | null | undefined>
) {
  return Array.from(
    new Set([
      ...activeLabels,
      ...historicalLabels.filter((label): label is string => Boolean(label))
    ])
  );
}

export async function getManagedOptions(
  supabase: SupabaseClient,
  optionGroup: ManagedOptionGroup,
  { activeOnly = true }: { activeOnly?: boolean } = {}
) {
  let query = supabase
    .from("crm_options")
    .select("*")
    .eq("option_group", optionGroup)
    .order("parent_label", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query.returns<ManagedOption[]>();

  if (error) {
    return fallbackByGroup[optionGroup].filter(
      (option) => !activeOnly || option.is_active
    );
  }

  return data ?? [];
}

export async function getLeadProductInterestOptions(supabase: SupabaseClient) {
  return uniqueLabels(await getManagedOptions(supabase, "lead_product_interest"));
}

export async function getProductAreaOptions(supabase: SupabaseClient) {
  return uniqueLabels(await getManagedOptions(supabase, "product_area"));
}

export async function getTicketSubCategoryOptionsByCategory(
  supabase: SupabaseClient
) {
  const options = await getManagedOptions(supabase, "ticket_sub_category");

  return ticketCategories.reduce(
    (groups, category) => {
      const labels = options
        .filter((option) => option.parent_label === category)
        .map((option) => option.label);
      groups[category] =
        labels.length > 0 ? labels : ticketSubCategoriesByCategory[category];
      return groups;
    },
    {} as Record<TicketCategory, string[]>
  );
}

export async function isActiveManagedOption(
  supabase: SupabaseClient,
  optionGroup: ManagedOptionGroup,
  label: string,
  parentLabel?: string | null
) {
  const options = await getManagedOptions(supabase, optionGroup);

  return options.some(
    (option) =>
      option.label === label &&
      (parentLabel === undefined || option.parent_label === parentLabel)
  );
}

export async function getHistoricalAwareLeadProductOptions(
  supabase: SupabaseClient,
  historicalLabels: string[]
) {
  const activeLabels = await getLeadProductInterestOptions(supabase);

  return {
    activeLabels,
    labels: mergeHistoricalLabels(activeLabels, historicalLabels)
  };
}

export async function getHistoricalAwareProductAreaOptions(
  supabase: SupabaseClient,
  historicalLabels: string[]
) {
  const activeLabels = await getProductAreaOptions(supabase);

  return {
    activeLabels,
    labels: mergeHistoricalLabels(activeLabels, historicalLabels)
  };
}

export async function getHistoricalAwareTicketSubCategoryOptionsByCategory(
  supabase: SupabaseClient,
  historicalCategory: TicketCategory,
  historicalSubCategory: string | null
) {
  const activeOptionsByCategory =
    await getTicketSubCategoryOptionsByCategory(supabase);

  return {
    activeOptionsByCategory,
    optionsByCategory: {
      ...activeOptionsByCategory,
      [historicalCategory]: mergeHistoricalLabels(
        activeOptionsByCategory[historicalCategory] ?? [],
        [historicalSubCategory]
      )
    }
  };
}
