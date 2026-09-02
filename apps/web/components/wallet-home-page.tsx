"use client";

import type { WalletStats } from "@gift-card-wallet/domain";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { WalletCard } from "@/app/actions/wallet";

type Props = {
  initialCards: WalletCard[];
  initialStats: WalletStats;
};

export function WalletHomePage({ initialCards, initialStats }: Props) {
  const router = useRouter();
  const [view, setView] = useState<"active" | "archived">("active");
  const activeCards = useMemo(
    () => initialCards.filter((card) => !card.archived),
    [initialCards],
  );
  const archivedCards = useMemo(
    () => initialCards.filter((card) => card.archived),
    [initialCards],
  );
  const visibleCards = view === "active" ? activeCards : archivedCards;
  const hasArchived = archivedCards.length > 0;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400">
            Spending ({initialStats.yearLabel})
          </h2>
          <button
            type="button"
            onClick={() => router.push("/transactions")}
            className="text-xs font-medium text-teal-600 hover:text-teal-500 dark:text-teal-400"
          >
            Transaction History →
          </button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-xs text-slate-500">Gas YTD</div>
            <div className="font-semibold">
              ${initialStats.spentYearGas.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Merchandise YTD</div>
            <div className="font-semibold">
              ${initialStats.spentYearMerchandise.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total YTD</div>
            <div className="font-semibold">
              ${initialStats.spentYear.toFixed(2)}
            </div>
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={() => router.push("/add-card")}
        className="w-full rounded-lg bg-teal-600 py-3 text-sm font-medium text-white hover:bg-teal-500"
      >
        Add card
      </button>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Gift cards
          </h2>
          {hasArchived ? (
            <div
              className="grid grid-cols-2 rounded-lg border border-slate-200 bg-white p-1 text-xs font-medium shadow-sm dark:border-slate-800 dark:bg-slate-900/60"
              role="tablist"
              aria-label="Gift card list"
            >
              <button
                type="button"
                role="tab"
                aria-selected={view === "active"}
                onClick={() => setView("active")}
                className={`rounded-md px-3 py-1.5 ${
                  view === "active"
                    ? "bg-teal-600 text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                Active {activeCards.length}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "archived"}
                onClick={() => setView("archived")}
                className={`rounded-md px-3 py-1.5 ${
                  view === "archived"
                    ? "bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-950"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                Archived {archivedCards.length}
              </button>
            </div>
          ) : null}
        </div>

        {visibleCards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => router.push(`/card/${c.id}`)}
            className={`flex w-full gap-3 rounded-[10px] border border-white/10 px-[14px] py-[14px] text-left text-white shadow-lg min-h-[110px] ${
              c.type === "Digital"
                ? "bg-linear-to-br from-[#e52d27] to-[#b31217]"
                : "bg-linear-to-br from-[#0f2027] via-[#203a43] to-[#2c5364]"
            } ${c.archived ? "opacity-60 grayscale-[0.3]" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2">
                <span className="truncate text-lg font-extrabold uppercase tracking-wide">
                  {c.brand}
                </span>
                <span className="shrink-0 text-xs font-bold uppercase opacity-80">
                  {c.type}
                </span>
              </div>
              <div className="mt-2 font-mono text-sm">
                {c.cardNumber ? `•••• ${c.cardNumber.slice(-4)}` : "—"}
              </div>
              <div className="mt-2 text-lg font-bold">
                ${c.current.toFixed(2)}{" "}
                <span className="text-sm font-normal opacity-80">
                  / ${c.initial.toFixed(2)}
                </span>
              </div>
            </div>
          </button>
        ))}
        {visibleCards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
            {view === "active"
              ? "No active cards. Add a card or switch to archived."
              : "No archived cards."}
          </div>
        ) : null}
      </section>
    </div>
  );
}
