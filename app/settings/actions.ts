"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildBusinessAutomationEvents } from "@/lib/automations/business-events";
import { buildLeadAutomationEvents } from "@/lib/automations/lead-events";
import { buildPartnerAutomationEvents } from "@/lib/automations/partner-events";
import { buildProductEventAutomationEvents } from "@/lib/automations/product-event-events";
import { buildTicketAutomationEvents } from "@/lib/automations/ticket-events";
import { defaultAutomationSettings } from "@/lib/constants/automation-settings";
import { deliverSlackEventsImmediately } from "@/lib/notifications/automation-delivery";
import type { ManagedOptionGroup } from "@/lib/settings/managed-options";
import type { AutomationSettings } from "@/lib/types/automation-settings";
import type { AutomationEvent } from "@/lib/types/automation-events";
import type { Business } from "@/lib/types/businesses";
import type { Lead } from "@/lib/types/leads";
import type { Ticket } from "@/lib/types/tickets";
import {
  crmModules,
  permissionActions,
  type PermissionTemplate,
  type PermissionTemplateGrid
} from "@/lib/types/permissions";
import type { Partner } from "@/lib/types/partners";
import type { ProductEvent } from "@/lib/types/product-events";
import type { StaffUser } from "@/lib/types/users";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function inviteStaffMember(formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const jobTitle = String(formData.get("job_title") ?? "").trim();
  const department = String(formData.get("department") ?? "").trim();
  const slackUserId = String(formData.get("slack_user_id") ?? "").trim();

  if (!fullName || !email) {
    redirect("/settings?error=Name%20and%20email%20are%20required");
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentUser } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", user.id)
    .single<StaffUser>();

  if (!currentUser?.is_super_admin || currentUser.status !== "Active") {
    redirect("/");
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      job_title: jobTitle || null,
      department: department || null,
      slack_user_id: slackUserId || null
    },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`
  });

  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/settings");
  redirect("/settings?success=Invitation%20sent");
}

function readPositiveInteger(formData: FormData, key: string) {
  const value = Number(String(formData.get(key) ?? "").trim());

  if (!Number.isInteger(value) || value < 1) {
    throw new Error("All automation limits must be whole numbers greater than zero.");
  }

  return value;
}

export async function updateAutomationSettings(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentUser } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", user.id)
    .single<StaffUser>();

  if (!currentUser?.is_super_admin || currentUser.status !== "Active") {
    redirect("/");
  }

  let kybNotSubmittedDays: number;
  let firstTransactionFirstAlertDays: number;
  let firstTransactionAtRiskDays: number;
  let inactiveFirstAlertDays: number;
  let inactiveSecondAlertDays: number;
  let inactiveChurnDays: number;
  let transactionLimitWarningPercent: number;

  try {
    kybNotSubmittedDays = readPositiveInteger(formData, "kyb_not_submitted_days");
    firstTransactionFirstAlertDays = readPositiveInteger(
      formData,
      "no_first_transaction_first_alert_days"
    );
    firstTransactionAtRiskDays = readPositiveInteger(
      formData,
      "no_first_transaction_at_risk_days"
    );
    inactiveFirstAlertDays = readPositiveInteger(
      formData,
      "inactive_first_alert_days"
    );
    inactiveSecondAlertDays = readPositiveInteger(
      formData,
      "inactive_second_alert_days"
    );
    inactiveChurnDays = readPositiveInteger(formData, "inactive_churn_days");
    transactionLimitWarningPercent = readPositiveInteger(
      formData,
      "transaction_limit_warning_percent"
    );
  } catch (error) {
    redirect(
      `/settings?error=${encodeURIComponent(error instanceof Error ? error.message : "Invalid automation settings")}`
    );
  }

  if (firstTransactionAtRiskDays < firstTransactionFirstAlertDays) {
    redirect("/settings?error=At%20Risk%20days%20must%20be%20greater%20than%20or%20equal%20to%20first%20alert%20days");
  }

  if (inactiveSecondAlertDays < inactiveFirstAlertDays) {
    redirect("/settings?error=Second%20inactive%20alert%20must%20be%20greater%20than%20or%20equal%20to%20first%20inactive%20alert");
  }

  if (inactiveChurnDays < inactiveSecondAlertDays) {
    redirect("/settings?error=Churn%20days%20must%20be%20greater%20than%20or%20equal%20to%20second%20inactive%20alert");
  }

  if (transactionLimitWarningPercent > 100) {
    redirect("/settings?error=Transaction%20limit%20warning%20percent%20cannot%20exceed%20100");
  }

  const { error } = await supabase.from("automation_settings").upsert({
    settings_id: true,
    kyb_not_submitted_days: kybNotSubmittedDays,
    no_first_transaction_first_alert_days: firstTransactionFirstAlertDays,
    no_first_transaction_at_risk_days: firstTransactionAtRiskDays,
    inactive_first_alert_days: inactiveFirstAlertDays,
    inactive_second_alert_days: inactiveSecondAlertDays,
    inactive_churn_days: inactiveChurnDays,
    transaction_limit_warning_percent: transactionLimitWarningPercent,
    updated_by: user.id
  });

  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/businesses/attention");
  redirect("/settings?success=Automation%20settings%20updated");
}

async function requireSuperAdmin() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: currentUser } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", user.id)
    .single<StaffUser>();

  if (!currentUser?.is_super_admin || currentUser.status !== "Active") {
    redirect("/");
  }

  return { supabase, user };
}

export async function updateStaffPermissions(formData: FormData) {
  const { supabase, user } = await requireSuperAdmin();
  const staffUserId = String(formData.get("user_id") ?? "").trim();

  if (!staffUserId) {
    redirect("/settings?error=Staff%20member%20is%20required");
  }

  const rows = crmModules.map((module) => ({
    user_id: staffUserId,
    module,
    can_view: formData.get(`${module}:can_view`) === "on",
    can_create: formData.get(`${module}:can_create`) === "on",
    can_edit: formData.get(`${module}:can_edit`) === "on",
    can_delete: formData.get(`${module}:can_delete`) === "on",
    can_assign: formData.get(`${module}:can_assign`) === "on",
    updated_by: user.id
  }));

  const { error } = await supabase.from("permissions").upsert(rows, {
    onConflict: "user_id,module"
  });

  if (error) {
    redirect(
      `/settings/users/${staffUserId}/permissions?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath(`/settings/users/${staffUserId}/permissions`);
  redirect(
    `/settings/users/${staffUserId}/permissions?success=Permissions%20updated`
  );
}

export async function updateStaffProfile(formData: FormData) {
  const { supabase } = await requireSuperAdmin();
  const staffUserId = String(formData.get("user_id") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const jobTitle = String(formData.get("job_title") ?? "").trim();
  const department = String(formData.get("department") ?? "").trim();
  const slackUserId = String(formData.get("slack_user_id") ?? "").trim();

  if (!staffUserId || !fullName || !email) {
    redirect("/settings?error=Staff,%20name,%20and%20email%20are%20required");
  }

  const { error } = await supabase
    .from("users")
    .update({
      full_name: fullName,
      email,
      job_title: jobTitle || null,
      department: department || null,
      slack_user_id: slackUserId || null
    })
    .eq("user_id", staffUserId);

  if (error) {
    redirect(
      `/settings/users/${staffUserId}?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath("/settings");
  revalidatePath(`/settings/users/${staffUserId}`);
  redirect(`/settings/users/${staffUserId}?success=Profile%20updated`);
}

export async function updateStaffStatus(formData: FormData) {
  const { supabase } = await requireSuperAdmin();
  const staffUserId = String(formData.get("user_id") ?? "").trim();
  const nextStatus = String(formData.get("status") ?? "").trim();

  if (!staffUserId || !["Active", "Inactive"].includes(nextStatus)) {
    redirect("/settings?error=Valid%20staff%20status%20is%20required");
  }

  const { data: targetUser } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", staffUserId)
    .single<StaffUser>();

  if (!targetUser) {
    redirect("/settings?error=Staff%20member%20not%20found");
  }

  if (targetUser.is_super_admin && nextStatus === "Inactive") {
    redirect(
      `/settings/users/${staffUserId}?error=Super%20Admin%20accounts%20cannot%20be%20deactivated%20from%20the%20UI`
    );
  }

  const { error } = await supabase
    .from("users")
    .update({ status: nextStatus })
    .eq("user_id", staffUserId);

  if (error) {
    redirect(
      `/settings/users/${staffUserId}?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath(`/settings/users/${staffUserId}`);
  redirect(
    `/settings/users/${staffUserId}?success=Account%20${nextStatus === "Inactive" ? "deactivated" : "reactivated"}`
  );
}

function readPermissionGrid(formData: FormData): PermissionTemplateGrid {
  return Object.fromEntries(
    crmModules.map((module) => [
      module,
      Object.fromEntries(
        permissionActions.map((action) => [
          action,
          formData.get(`${module}:${action}`) === "on"
        ])
      )
    ])
  ) as PermissionTemplateGrid;
}

export async function createPermissionTemplate(formData: FormData) {
  const { supabase, user } = await requireSuperAdmin();
  const templateName = String(formData.get("template_name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!templateName) {
    redirect("/settings/templates?error=Template%20name%20is%20required");
  }

  const { error } = await supabase.from("permission_templates").insert({
    template_name: templateName,
    description: description || null,
    permissions: readPermissionGrid(formData),
    created_by: user.id
  });

  if (error) {
    redirect(`/settings/templates?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/settings/templates");
  redirect("/settings/templates?success=Template%20created");
}

export async function deletePermissionTemplate(formData: FormData) {
  const { supabase } = await requireSuperAdmin();
  const templateId = String(formData.get("template_id") ?? "").trim();

  if (!templateId) {
    redirect("/settings/templates?error=Template%20is%20required");
  }

  const { error } = await supabase
    .from("permission_templates")
    .delete()
    .eq("template_id", templateId);

  if (error) {
    redirect(`/settings/templates?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/settings/templates");
  redirect("/settings/templates?success=Template%20deleted");
}

export async function applyPermissionTemplate(formData: FormData) {
  const { supabase, user } = await requireSuperAdmin();
  const staffUserId = String(formData.get("user_id") ?? "").trim();
  const templateId = String(formData.get("template_id") ?? "").trim();

  if (!staffUserId || !templateId) {
    redirect("/settings?error=Staff%20member%20and%20template%20are%20required");
  }

  const { data: template, error: templateError } = await supabase
    .from("permission_templates")
    .select("*")
    .eq("template_id", templateId)
    .single<PermissionTemplate>();

  if (templateError || !template) {
    redirect(
      `/settings/users/${staffUserId}/permissions?error=Template%20not%20found`
    );
  }

  const rows = crmModules.map((module) => {
    const modulePermissions = template.permissions[module];

    return {
      user_id: staffUserId,
      module,
      can_view: modulePermissions?.can_view ?? false,
      can_create: modulePermissions?.can_create ?? false,
      can_edit: modulePermissions?.can_edit ?? false,
      can_delete: modulePermissions?.can_delete ?? false,
      can_assign: modulePermissions?.can_assign ?? false,
      updated_by: user.id
    };
  });

  const { error } = await supabase.from("permissions").upsert(rows, {
    onConflict: "user_id,module"
  });

  if (error) {
    redirect(
      `/settings/users/${staffUserId}/permissions?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath(`/settings/users/${staffUserId}/permissions`);
  redirect(
    `/settings/users/${staffUserId}/permissions?success=Template%20applied`
  );
}

export async function runBusinessAutomationPreview() {
  const { supabase } = await requireSuperAdmin();

  const [
    { data: businesses },
    { data: staffMembers },
    { data: automationSettings }
  ] = await Promise.all([
    supabase.from("businesses").select("*").returns<Business[]>(),
    supabase.from("users").select("*").returns<StaffUser[]>(),
    supabase
      .from("automation_settings")
      .select("*")
      .eq("settings_id", true)
      .maybeSingle<AutomationSettings>()
  ]);

  const events = buildBusinessAutomationEvents({
    businesses: businesses ?? [],
    staffMembers: staffMembers ?? [],
    settings: automationSettings ?? defaultAutomationSettings
  });

  if (events.length === 0) {
    redirect("/settings/automations?success=No%20pending%20business%20automation%20events");
  }

  const result = await deliverSlackEventsImmediately({
    supabase,
    events,
    staffMembers: staffMembers ?? []
  });

  revalidatePath("/settings/automations");
  redirect(
    `/settings/automations?success=${result.sentCount}%20business%20Slack%20notification(s)%20sent,%20${result.failedCount}%20failed`
  );
}

export async function runLeadAutomationPreview() {
  const { supabase } = await requireSuperAdmin();

  const [{ data: leads }, { data: staffMembers }] = await Promise.all([
    supabase.from("leads").select("*").returns<Lead[]>(),
    supabase.from("users").select("*").returns<StaffUser[]>()
  ]);

  const events = buildLeadAutomationEvents({
    leads: leads ?? [],
    staffMembers: staffMembers ?? []
  });

  if (events.length === 0) {
    redirect("/settings/automations?success=No%20pending%20lead%20automation%20events");
  }

  const result = await deliverSlackEventsImmediately({
    supabase,
    events,
    staffMembers: staffMembers ?? []
  });

  revalidatePath("/settings/automations");
  redirect(
    `/settings/automations?success=${result.sentCount}%20lead%20Slack%20notification(s)%20sent,%20${result.failedCount}%20failed`
  );
}

export async function runTicketAutomationPreview() {
  const { supabase } = await requireSuperAdmin();

  const [
    { data: tickets },
    { data: businesses },
    { data: staffMembers }
  ] = await Promise.all([
    supabase.from("tickets").select("*").returns<Ticket[]>(),
    supabase.from("businesses").select("*").returns<Business[]>(),
    supabase.from("users").select("*").returns<StaffUser[]>()
  ]);

  const events = buildTicketAutomationEvents({
    tickets: tickets ?? [],
    businesses: businesses ?? [],
    staffMembers: staffMembers ?? []
  });

  if (events.length === 0) {
    redirect("/settings/automations?success=No%20pending%20ticket%20automation%20events");
  }

  const result = await deliverSlackEventsImmediately({
    supabase,
    events,
    staffMembers: staffMembers ?? []
  });

  revalidatePath("/settings/automations");
  redirect(
    `/settings/automations?success=${result.sentCount}%20ticket%20Slack%20notification(s)%20sent,%20${result.failedCount}%20failed`
  );
}

export async function runProductEventAutomationPreview() {
  const { supabase } = await requireSuperAdmin();

  const [{ data: productEvents }, { data: staffMembers }] = await Promise.all([
    supabase.from("product_events").select("*").returns<ProductEvent[]>(),
    supabase.from("users").select("*").returns<StaffUser[]>()
  ]);

  const events = buildProductEventAutomationEvents({
    productEvents: productEvents ?? [],
    staffMembers: staffMembers ?? []
  });

  if (events.length === 0) {
    redirect("/settings/automations?success=No%20pending%20product%20automation%20events");
  }

  const result = await deliverSlackEventsImmediately({
    supabase,
    events,
    staffMembers: staffMembers ?? []
  });

  revalidatePath("/settings/automations");
  redirect(
    `/settings/automations?success=${result.sentCount}%20product%20Slack%20notification(s)%20sent,%20${result.failedCount}%20failed`
  );
}

export async function runPartnerAutomationPreview() {
  const { supabase } = await requireSuperAdmin();

  const [{ data: partners }, { data: staffMembers }] = await Promise.all([
    supabase.from("partners").select("*").returns<Partner[]>(),
    supabase.from("users").select("*").returns<StaffUser[]>()
  ]);

  const events = buildPartnerAutomationEvents({
    partners: partners ?? [],
    staffMembers: staffMembers ?? []
  });

  if (events.length === 0) {
    redirect("/settings/automations?success=No%20pending%20partner%20automation%20events");
  }

  const result = await deliverSlackEventsImmediately({
    supabase,
    events,
    staffMembers: staffMembers ?? []
  });

  revalidatePath("/settings/automations");
  redirect(
    `/settings/automations?success=${result.sentCount}%20partner%20Slack%20notification(s)%20sent,%20${result.failedCount}%20failed`
  );
}

export async function sendPendingSlackAutomationEvents() {
  const { supabase } = await requireSuperAdmin();
  const [{ data: pendingEvents }, { data: staffMembers }] = await Promise.all([
    supabase
      .from("automation_events")
      .select("*")
      .eq("status", "Pending")
      .in("target_channel", [
        "slack_dm",
        "crm_tickets",
        "crm_leads",
        "crm_general"
      ])
      .order("created_at", { ascending: true })
      .limit(25)
      .returns<AutomationEvent[]>(),
    supabase.from("users").select("*").returns<StaffUser[]>()
  ]);

  const result = await deliverSlackEventsImmediately({
    supabase,
    events: pendingEvents ?? [],
    staffMembers: staffMembers ?? []
  });

  revalidatePath("/settings/automations");
  redirect(
    `/settings/automations?success=${result.sentCount}%20Slack%20events%20sent,%20${result.failedCount}%20failed`
  );
}

export async function retryFailedSlackAutomationEvents() {
  const { supabase } = await requireSuperAdmin();

  const { error } = await supabase
    .from("automation_events")
    .update({
      status: "Pending",
      processed_at: null,
      error_message: null
    })
    .eq("status", "Failed")
    .in("target_channel", [
      "slack_dm",
      "crm_tickets",
      "crm_leads",
      "crm_general"
    ]);

  if (error) {
    redirect(`/settings/automations?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/settings/automations");
  redirect("/settings/automations?success=Failed%20Slack%20events%20queued%20for%20retry");
}

const managedOptionGroups: ManagedOptionGroup[] = [
  "lead_product_interest",
  "ticket_sub_category",
  "product_area"
];

function readManagedOptionGroup(formData: FormData) {
  const optionGroup = String(formData.get("option_group") ?? "").trim();

  if (!managedOptionGroups.includes(optionGroup as ManagedOptionGroup)) {
    redirect("/settings/options?error=Invalid%20option%20group");
  }

  return optionGroup as ManagedOptionGroup;
}

function readManagedOptionFields(formData: FormData) {
  const optionGroup = readManagedOptionGroup(formData);
  const label = String(formData.get("label") ?? "").trim();
  const parentLabel = String(formData.get("parent_label") ?? "").trim();
  const sortOrderValue = String(formData.get("sort_order") ?? "").trim();
  const sortOrder = sortOrderValue ? Number(sortOrderValue) : 0;

  if (!label) {
    redirect("/settings/options?error=Option%20name%20is%20required");
  }

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    redirect("/settings/options?error=Sort%20order%20must%20be%20a%20whole%20number");
  }

  if (optionGroup === "ticket_sub_category" && !parentLabel) {
    redirect("/settings/options?error=Ticket%20sub%20categories%20must%20have%20a%20category");
  }

  return {
    optionGroup,
    label,
    parentLabel: optionGroup === "ticket_sub_category" ? parentLabel : null,
    sortOrder
  };
}

export async function createManagedOption(formData: FormData) {
  const { supabase } = await requireSuperAdmin();
  const values = readManagedOptionFields(formData);

  const { error } = await supabase.from("crm_options").insert({
    option_group: values.optionGroup,
    label: values.label,
    parent_label: values.parentLabel,
    sort_order: values.sortOrder,
    is_active: true
  });

  if (error) {
    redirect(`/settings/options?error=${encodeURIComponent(error.message)}`);
  }

  revalidateManagedOptionPaths();
  redirect("/settings/options?success=Option%20added");
}

export async function updateManagedOption(formData: FormData) {
  const { supabase } = await requireSuperAdmin();
  const optionId = String(formData.get("option_id") ?? "").trim();
  const values = readManagedOptionFields(formData);

  if (!optionId) {
    redirect("/settings/options?error=Option%20is%20required");
  }

  const { error } = await supabase
    .from("crm_options")
    .update({
      label: values.label,
      parent_label: values.parentLabel,
      sort_order: values.sortOrder
    })
    .eq("option_id", optionId);

  if (error) {
    redirect(`/settings/options?error=${encodeURIComponent(error.message)}`);
  }

  revalidateManagedOptionPaths();
  redirect("/settings/options?success=Option%20updated");
}

export async function toggleManagedOptionStatus(formData: FormData) {
  const { supabase } = await requireSuperAdmin();
  const optionId = String(formData.get("option_id") ?? "").trim();
  const nextStatus = String(formData.get("is_active") ?? "") === "true";

  if (!optionId) {
    redirect("/settings/options?error=Option%20is%20required");
  }

  const { error } = await supabase
    .from("crm_options")
    .update({ is_active: nextStatus })
    .eq("option_id", optionId);

  if (error) {
    redirect(`/settings/options?error=${encodeURIComponent(error.message)}`);
  }

  revalidateManagedOptionPaths();
  redirect(
    `/settings/options?success=${nextStatus ? "Option%20activated" : "Option%20deactivated"}`
  );
}

function revalidateManagedOptionPaths() {
  revalidatePath("/settings");
  revalidatePath("/settings/options");
  revalidatePath("/leads");
  revalidatePath("/tickets");
  revalidatePath("/product-log");
  revalidatePath("/reports");
}
