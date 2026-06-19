import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updatePassword } from "@/app/login/actions";
import Link from "next/link";

type UpdatePasswordPageProps = {
  searchParams?: {
    error?: string;
  };
};

export default async function UpdatePasswordPage({
  searchParams
}: UpdatePasswordPageProps) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen bg-white text-payscribe-black">
      <section className="hidden min-h-screen flex-1 bg-payscribe-blue px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide">
            Payscribe CRM
          </p>
          <h1 className="mt-6 max-w-xl text-5xl font-semibold tracking-normal">
            Choose a new password.
          </h1>
        </div>
        <p className="max-w-md text-sm leading-6 text-white/80">
          This page only works from a valid reset email link.
        </p>
      </section>

      <section className="flex min-h-screen w-full items-center justify-center px-6 py-10 lg:w-[480px]">
        <div className="w-full max-w-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-payscribe-blue lg:hidden">
            Payscribe CRM
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal">
            New password
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Set a new password for {user?.email ?? "your staff account"}.
          </p>

          {searchParams?.error ? (
            <div className="mt-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {searchParams.error}
            </div>
          ) : null}

          {!user ? (
            <div className="mt-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This reset link has expired or is invalid. Request a new reset
              link to continue.
            </div>
          ) : null}

          <form action={updatePassword} className="mt-8 space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                New password
              </span>
              <input
                required
                disabled={!user}
                name="password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-3 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Confirm password
              </span>
              <input
                required
                disabled={!user}
                name="confirm_password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-3 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500"
              />
            </label>

            <button
              type="submit"
              disabled={!user}
              className="w-full rounded bg-payscribe-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#254f93] focus:outline-none focus:ring-2 focus:ring-payscribe-blue/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Update Password
            </button>
          </form>

          <Link
            href="/forgot-password"
            className="mt-5 inline-flex text-sm font-semibold text-payscribe-blue hover:underline"
          >
            Request another reset link
          </Link>
        </div>
      </section>
    </main>
  );
}
