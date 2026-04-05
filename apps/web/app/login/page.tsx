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
      {/* CSS credit card logo — ported from apps/sheets/Index.html */}
      <div
        className="relative mb-6 overflow-hidden rounded-xl shadow-2xl"
        style={{
          width: 280,
          height: 175,
          background: "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)",
        }}
      >
        {/* Shine overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(45deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0) 60%)",
          }}
        />
        {/* Gold chip */}
        <div
          className="absolute rounded-sm"
          style={{
            width: 40,
            height: 30,
            top: 20,
            left: 20,
            background: "#ffd700",
          }}
        />
        {/* Card content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span style={{ fontSize: 48 }}>💳</span>
          <span
            className="font-semibold tracking-widest text-white"
            style={{ fontSize: 20, letterSpacing: 2 }}
          >
            PREPAID
          </span>
        </div>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900/60">
        <h1 className="text-xl font-semibold text-teal-600 dark:text-teal-400">
          Sign in
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Gift Card Wallet
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
