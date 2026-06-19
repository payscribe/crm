import type { CrmModule, UserPermission } from "@/lib/types/permissions";
import type { StaffUser } from "@/lib/types/users";

export function hasModulePermission(
  user: StaffUser,
  permissions: UserPermission[],
  module: CrmModule,
  action: keyof Pick<
    UserPermission,
    "can_view" | "can_create" | "can_edit" | "can_delete" | "can_assign"
  >
) {
  if (user.is_super_admin) {
    return true;
  }

  return permissions.some(
    (permission) => permission.module === module && permission[action]
  );
}
