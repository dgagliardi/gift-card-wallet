export function AppFooter() {
  const v = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
  return (
    <footer className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-500">
      Gift Card Wallet v{v}
    </footer>
  );
}
