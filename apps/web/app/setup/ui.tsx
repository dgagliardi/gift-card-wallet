"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { bootstrapFirstAdmin } from "@/app/actions/setup";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

type Props = {
  googleOAuthConfigured: boolean;
};

export function SetupForm({ googleOAuthConfigured }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    try {
      await bootstrapFirstAdmin({ name, email, password });
      router.push("/");
      router.refresh();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Setup failed");
    } finally {
      setPending(false);
    }
  }

  if (googleOAuthConfigured) {
    return (
      <div className="mt-6 space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Sign in with Google to create the first administrator account. Only the
          first sign-in becomes admin.
        </p>
        <GoogleSignInButton label="Continue with Google (first admin)" />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <p className="text-xs text-amber-800 dark:text-amber-200">
        Google OAuth is not configured (missing{" "}
        <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">
          GOOGLE_CLIENT_ID
        </code>{" "}
        /{" "}
        <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">
          GOOGLE_CLIENT_SECRET
        </code>
        ). Create the first user with email and password, or add Google keys to{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
          .env.local
        </code>
        .
      </p>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          Your name
        </label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-teal-600 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          Email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-teal-600 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          Password
        </label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-teal-600 focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
        {pending ? "Creating…" : "Create admin"}
      </button>
    </form>
  );
}
