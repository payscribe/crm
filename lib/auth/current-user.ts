import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserPermission } from "@/lib/types/permissions";
import type { StaffUser } from "@/lib/types/users";
import { redirect } from "next/navigation";

export async function getCurrentUserContext() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: currentUser }, { data: permissions }] = await Promise.all([
    supabase
      .from("users")
      .select("*")
      .eq("user_id", user.id)
      .single<StaffUser>(),
    supabase
      .from("permissions")
      .select("*")
      .eq("user_id", user.id)
      .returns<UserPermission[]>()
  ]);

  if (!currentUser || currentUser.status !== "Active") {
    redirect("/login");
  }

  return {
    supabase,
    authUser: user,
    currentUser,
    permissions: permissions ?? []
  };
}
