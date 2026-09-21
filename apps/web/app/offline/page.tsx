import type { Metadata } from "next";
import { OfflineActions } from "./ui";

export const metadata: Metadata = { title: "Offline — Gift Card Wallet" };

// Precached by the service worker and served when a navigation finds neither
// the network nor a cached copy of the requested page. It must never depend on
// the session or the database.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="app-root-shell safe-area-page flex flex-col items-center justify-center bg-slate-50 px-4 py-16 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900/60">
        <h1 className="text-xl font-semibold text-teal-600 dark:text-teal-400">
          No connection
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          This screen hasn&apos;t been opened on this phone yet, so there&apos;s
          no saved copy to show.
        </p>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Cards you&apos;ve already viewed are still available — go back to the
          wallet and open one from the list.
        </p>
        <OfflineActions />
      </div>
    </div>
  );
}
