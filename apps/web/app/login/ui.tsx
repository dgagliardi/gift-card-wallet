"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { getAuthClient } from "@/lib/auth-client";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

type Props = {
  googleOAuthConfigured: boolean;
  showEmailLogin: boolean;
};

export function LoginForm({
  googleOAuthConfigured,
  showEmailLogin,
}: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    const { error } = await getAuthClient().signIn.email({ email, password });
    setPending(false);
    if (error) {
      setErr(error.message || "Could not sign in");
      return;
    }
    router.replace(`${basePath}/`);
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-6">
      {googleOAuthConfigured ? (
        <GoogleSignInButton label="Continue with Google" />
      ) : null}

      {showEmailLogin ? (
        <>
          {googleOAuthConfigured ? (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200 dark:border-slate-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-500 dark:bg-slate-900/60">
                  Or email
                </span>
              </div>
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none ring-teal-600 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 md:text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none ring-teal-600 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 md:text-sm"
              />
            </div>
            {err ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {err}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-60"
            >
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </>
      ) : googleOAuthConfigured ? null : (
        <p className="text-center text-xs text-slate-500">
          Set{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
            GOOGLE_CLIENT_ID
          </code>{" "}
          and{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
            GOOGLE_CLIENT_SECRET
          </code>{" "}
          or enable email sign-in with{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
            ENABLE_EMAIL_PASSWORD=true
          </code>
          .
        </p>
      )}
    </div>
  );
}
