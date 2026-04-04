import { redirect } from "next/navigation";
import { getUserCount } from "@/app/actions/setup";
import { emailPasswordEnabled, hasGoogleOAuth } from "@/lib/auth-config";
import { getSession } from "@/lib/session";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LoginForm } from "./ui";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");

  const n = await getUserCount();
  if (n === 0) redirect("/setup");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-16 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900/60">
        <h1 className="text-xl font-semibold text-teal-600 dark:text-teal-400">
          Sign in
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Gift Card Wallet (VPS)
        </p>
        <LoginForm
          googleOAuthConfigured={hasGoogleOAuth()}
          showEmailLogin={emailPasswordEnabled()}
        />
        <p className="mt-4 text-center text-xs text-slate-500">
          First time? Complete setup if this is a new install.
        </p>
      </div>
    </div>
  );
}
