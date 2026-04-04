"use client";

import { useRouter } from "next/navigation";
import { getAuthClient } from "@/lib/auth-client";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    try {
      await getAuthClient().signOut();
    } catch {
      // ignore
    }
    router.push(`${basePath}/login`);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      Sign out
    </button>
  );
}
