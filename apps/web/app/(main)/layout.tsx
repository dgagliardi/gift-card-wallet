import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getSession } from "@/lib/session";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-clip bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
          <Link
            href={`${basePath}/`}
            className="text-lg font-semibold tracking-tight text-teal-600 dark:text-teal-400"
          >
            Gift Card Wallet
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <span className="hidden max-w-[10rem] truncate text-sm text-slate-600 dark:text-slate-400 sm:inline">
              {session.user.name}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-6 pb-28">{children}</main>
    </div>
  );
}
