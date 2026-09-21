"use client";

import { useEffect, useState } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function OfflineActions() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // A full navigation on purpose, not router.push: a client-side
          // transition would be handled by the service worker's RSC route and
          // could resolve straight back out of cache. This retries the network.
          window.location.replace(`${basePath}/`);
        }}
        className="mt-5 w-full rounded-lg bg-teal-600 px-4 py-3 text-base font-semibold text-white active:bg-teal-700 dark:bg-teal-500 dark:active:bg-teal-600"
      >
        Try again
      </button>
      <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
        {online
          ? "Your phone reports a connection, so this may just be slow."
          : "Your phone is offline."}
      </p>
    </>
  );
}
