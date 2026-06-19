export type CrmModule =
  | "Leads"
  | "Businesses"
  | "Tickets"
  | "Partners"
  | "Product Log"
  | "Referrals"
  | "Reports"
  | "Settings";

export type PermissionAction =
  | "can_view"
  | "can_create"
  | "can_edit"
  | "can_delete"
  | "can_assign";

export type UserPermission = {
  permission_id: number;
  user_id: string;
  module: CrmModule;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_assign: boolean;
  updated_by: string | null;
  updated_at: string;
};

export type PermissionTemplateGrid = Record<
  CrmModule,
  Record<PermissionAction, boolean>
>;

export type PermissionTemplate = {
  template_id: string;
  template_name: string;
  description: string | null;
  permissions: PermissionTemplateGrid;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const crmModules: CrmModule[] = [
  "Leads",
  "Businesses",
  "Tickets",
  "Partners",
  "Product Log",
  "Referrals",
  "Reports",
  "Settings"
];

export const permissionActions: PermissionAction[] = [
  "can_view",
  "can_create",
  "can_edit",
  "can_delete",
  "can_assign"
];
