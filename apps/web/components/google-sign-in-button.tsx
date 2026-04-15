"use client";

import { useState } from "react";
import { getAuthClient } from "@/lib/auth-client";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function GoogleSignInButton({
  label = "Continue with Google",
}: {
  label?: string;
}) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    setErr(null);
    setPending(true);
    try {
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : (process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000");
      const result = await getAuthClient().signIn.social({
        provider: "google",
        callbackURL: `${origin.replace(/\/$/, "")}${basePath}/`,
      });
      if (result?.error) {
        setErr(result.error.message || "Google sign-in failed");
        setPending(false);
        return;
      }
      const redirectUrl = (result as { data?: { url?: string } } | undefined)?.data?.url;
      if (redirectUrl) {
        window.location.assign(redirectUrl);
        return;
      }
      // Fallback in case the SDK doesn't auto-redirect in this browser context.
      const fallback = `${origin.replace(/\/$/, "")}${basePath}/api/auth/sign-in/social?provider=google&callbackURL=${encodeURIComponent(`${origin.replace(/\/$/, "")}${basePath}/`)}`;
      window.location.assign(fallback);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Google sign-in failed");
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
      >
        <GoogleGlyph className="h-5 w-5" aria-hidden />
        {pending ? "Redirecting…" : label}
      </button>
      {err ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
