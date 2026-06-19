import Link from "next/link";
import { requestPasswordReset } from "@/app/login/actions";

type ForgotPasswordPageProps = {
  searchParams?: {
    error?: string;
    success?: string;
  };
};

export default function ForgotPasswordPage({
  searchParams
}: ForgotPasswordPageProps) {
  return (
    <main className="flex min-h-screen bg-white text-payscribe-black">
      <section className="hidden min-h-screen flex-1 bg-payscribe-blue px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide">
            Payscribe CRM
          </p>
          <h1 className="mt-6 max-w-xl text-5xl font-semibold tracking-normal">
            Reset staff access securely.
          </h1>
        </div>
        <p className="max-w-md text-sm leading-6 text-white/80">
          Password reset links are sent only to registered staff email
          addresses.
        </p>
      </section>

      <section className="flex min-h-screen w-full items-center justify-center px-6 py-10 lg:w-[480px]">
        <div className="w-full max-w-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-payscribe-blue lg:hidden">
            Payscribe CRM
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal">
            Reset password
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Enter the staff email address. Supabase will send a secure reset
            link.
          </p>

          {searchParams?.error ? (
            <div className="mt-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {searchParams.error}
            </div>
          ) : null}

          {searchParams?.success ? (
            <div className="mt-6 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {searchParams.success}
            </div>
          ) : null}

          <form action={requestPasswordReset} className="mt-8 space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Email
              </span>
              <input
                required
                name="email"
                type="email"
                autoComplete="email"
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-3 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded bg-payscribe-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#254f93] focus:outline-none focus:ring-2 focus:ring-payscribe-blue/30"
            >
              Send Reset Link
            </button>
          </form>

          <Link
            href="/login"
            className="mt-5 inline-flex text-sm font-semibold text-payscribe-blue hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
