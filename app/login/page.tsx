import { signIn } from "./actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PayscribeLogo } from "@/components/payscribe-logo";

type LoginPageProps = {
  searchParams?: {
    error?: string;
    success?: string;
  };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen bg-white text-payscribe-black">
      <section className="hidden min-h-screen flex-1 bg-payscribe-blue px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <PayscribeLogo className="h-12 w-auto" />
          <h1 className="mt-8 max-w-xl text-5xl font-semibold tracking-normal">
            Operations, growth, support, and partner work in one place.
          </h1>
        </div>
        <p className="max-w-md text-sm leading-6 text-white/80">
          Internal access only. Use the account invitation sent by Payscribe.
        </p>
      </section>

      <section className="flex min-h-screen w-full items-center justify-center px-6 py-10 lg:w-[480px]">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <PayscribeLogo className="h-10 w-auto" />
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal">
            Sign in
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Enter your Payscribe staff login details.
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

          <form action={signIn} className="mt-8 space-y-5">
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

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Password
              </span>
              <input
                required
                name="password"
                type="password"
                autoComplete="current-password"
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-3 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded bg-payscribe-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#254f93] focus:outline-none focus:ring-2 focus:ring-payscribe-blue/30"
            >
              Sign in
            </button>
          </form>

          <a
            href="/forgot-password"
            className="mt-5 inline-flex text-sm font-semibold text-payscribe-blue hover:underline"
          >
            Forgot password?
          </a>
        </div>
      </section>
    </main>
  );
}
