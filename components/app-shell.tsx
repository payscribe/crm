import { navigationItems } from "@/lib/constants/navigation";
import type { UserPermission } from "@/lib/types/permissions";
import type { StaffUser } from "@/lib/types/users";
import { signOut } from "@/app/login/actions";
import { AppNavigation } from "@/components/app-navigation";

type AppShellProps = {
  currentUser: StaffUser;
  permissions: UserPermission[];
  children: React.ReactNode;
};

export function AppShell({
  currentUser,
  permissions,
  children
}: AppShellProps) {
  const visibleModules = new Set(
    permissions
      .filter((permission) => permission.can_view)
      .map((permission) => permission.module)
  );

  const visibleNavigation = navigationItems.filter((item) => {
    if (item.module === "Dashboard") {
      return true;
    }

    if (currentUser.is_super_admin) {
      return true;
    }

    return visibleModules.has(item.module);
  });
  const initials = currentUser.full_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => name[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-neutral-50 text-payscribe-black">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-neutral-200 bg-white px-4 py-5 lg:flex lg:flex-col">
        <div className="px-2 pb-6">
          <p className="text-xl font-semibold text-payscribe-blue">
            Payscribe
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Internal CRM
          </p>
        </div>

        <AppNavigation items={visibleNavigation} variant="sidebar" />

        <div className="border-t border-neutral-200 px-2 pt-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-blue-50 text-sm font-semibold text-payscribe-blue">
              {initials || "PS"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-950">
                {currentUser.full_name}
              </p>
              <p className="truncate text-xs text-neutral-500">
                {currentUser.job_title ?? currentUser.department ?? "Staff"}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-blue-50 text-sm font-semibold text-payscribe-blue lg:hidden">
                  {initials || "PS"}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Signed in
                  </p>
                  <h1 className="truncate text-lg font-semibold text-neutral-950">
                  {currentUser.full_name}
                  </h1>
                </div>
              </div>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
                >
                  Sign out
                </button>
              </form>
            </div>

            <AppNavigation items={visibleNavigation} variant="mobile" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
