import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasModulePermission } from "@/lib/permissions/checks";
import type { UserPermission } from "@/lib/types/permissions";
import type { StaffUser } from "@/lib/types/users";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SearchResultItem = {
  id: string;
  title: string;
  subtitle: string | null;
};

type GlobalSearchResponse = {
  businesses: SearchResultItem[];
  leads: SearchResultItem[];
  partners: SearchResultItem[];
  tickets: SearchResultItem[];
};

const emptyResponse: GlobalSearchResponse = {
  businesses: [],
  leads: [],
  partners: [],
  tickets: []
};

const RESULT_LIMIT = 5;

function sanitizeQuery(rawQuery: string) {
  return rawQuery.replace(/[%,()]/g, "").trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = sanitizeQuery(searchParams.get("q") ?? "");

  if (query.length < 2) {
    return NextResponse.json(emptyResponse);
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: currentUser }, { data: permissions }] = await Promise.all([
    supabase.from("users").select("*").eq("user_id", user.id).single<StaffUser>(),
    supabase
      .from("permissions")
      .select("*")
      .eq("user_id", user.id)
      .returns<UserPermission[]>()
  ]);

  if (!currentUser || currentUser.status !== "Active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perms = permissions ?? [];
  const canViewLeads = hasModulePermission(currentUser, perms, "Leads", "can_view");
  const canViewBusinesses = hasModulePermission(
    currentUser,
    perms,
    "Businesses",
    "can_view"
  );
  const canViewPartners = hasModulePermission(
    currentUser,
    perms,
    "Partners",
    "can_view"
  );
  const canViewTickets = hasModulePermission(
    currentUser,
    perms,
    "Tickets",
    "can_view"
  );

  const [leadsResult, businessesResult, partnersResult, ticketsResult] =
    await Promise.all([
      canViewLeads
        ? supabase
            .from("leads")
            .select("lead_id, full_name, business_name, phone, email")
            .or(
              `lead_id.ilike.%${query}%,full_name.ilike.%${query}%,business_name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`
            )
            .limit(RESULT_LIMIT)
            .returns<
              Array<{
                lead_id: string;
                full_name: string;
                business_name: string | null;
                phone: string;
                email: string | null;
              }>
            >()
        : Promise.resolve({ data: [] }),
      canViewBusinesses
        ? supabase
            .from("businesses")
            .select("business_id, business_name, owner_name, email")
            .or(
              `business_name.ilike.%${query}%,owner_name.ilike.%${query}%,email.ilike.%${query}%,business_id.ilike.%${query}%`
            )
            .limit(RESULT_LIMIT)
            .returns<
              Array<{
                business_id: string;
                business_name: string;
                owner_name: string | null;
                email: string;
              }>
            >()
        : Promise.resolve({ data: [] }),
      canViewPartners
        ? supabase
            .from("partners")
            .select("partner_id, organisation_name, country, their_contact_name")
            .or(
              `partner_id.ilike.%${query}%,organisation_name.ilike.%${query}%,country.ilike.%${query}%,their_contact_name.ilike.%${query}%,custom_partner_type.ilike.%${query}%`
            )
            .limit(RESULT_LIMIT)
            .returns<
              Array<{
                partner_id: string;
                organisation_name: string;
                country: string | null;
                their_contact_name: string | null;
              }>
            >()
        : Promise.resolve({ data: [] }),
      canViewTickets
        ? supabase
            .from("tickets")
            .select("ticket_id, subject, reported_by, sub_category")
            .or(
              `ticket_id.ilike.%${query}%,reported_by.ilike.%${query}%,subject.ilike.%${query}%,sub_category.ilike.%${query}%,issue_description.ilike.%${query}%`
            )
            .limit(RESULT_LIMIT)
            .returns<
              Array<{
                ticket_id: string;
                subject: string;
                reported_by: string | null;
                sub_category: string | null;
              }>
            >()
        : Promise.resolve({ data: [] })
    ]);

  const response: GlobalSearchResponse = {
    leads: (leadsResult.data ?? []).map((row) => ({
      id: row.lead_id,
      title: row.full_name,
      subtitle: row.business_name ?? row.email ?? row.phone
    })),
    businesses: (businessesResult.data ?? []).map((row) => ({
      id: row.business_id,
      title: row.business_name,
      subtitle: row.owner_name ?? row.email
    })),
    partners: (partnersResult.data ?? []).map((row) => ({
      id: row.partner_id,
      title: row.organisation_name,
      subtitle: row.their_contact_name ?? row.country
    })),
    tickets: (ticketsResult.data ?? []).map((row) => ({
      id: row.ticket_id,
      title: row.subject,
      subtitle: row.sub_category ?? row.reported_by
    }))
  };

  return NextResponse.json(response);
}
