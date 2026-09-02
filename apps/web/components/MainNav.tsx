"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const ITEMS = [
  { href: "/", label: "Cards" },
  { href: "/expenses", label: "Expenses" },
  { href: "/transactions", label: "History" },
];

export function MainNav() {
  const pathname = usePathname() ?? "/";
  // usePathname includes the base path; strip it so comparisons stay simple.
  const route =
    basePath && pathname.startsWith(basePath)
      ? pathname.slice(basePath.length) || "/"
      : pathname;

  return (
    <nav className="mx-auto flex max-w-lg gap-1 px-2" aria-label="Main">
      {ITEMS.map((item) => {
        // "/" must match exactly, or it would highlight on every route.
        const active =
          item.href === "/" ? route === "/" : route.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={`${basePath}${item.href}`}
            aria-current={active ? "page" : undefined}
            className={`flex-1 border-b-2 px-3 py-2 text-center text-sm font-medium transition-colors ${
              active
                ? "border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
