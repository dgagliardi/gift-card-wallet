"use client";

import type { WalletStats } from "@gift-card-wallet/domain";
import { useRouter } from "next/navigation";
import type { WalletCard } from "@/app/actions/wallet";

type Props = {
  initialCards: WalletCard[];
  initialStats: WalletStats;
};

export function WalletHomePage({ initialCards, initialStats }: Props) {
  const router = useRouter();

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
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-xs text-slate-500">Last 30 days</div>
            <div className="font-semibold">${initialStats.spentLast30}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Year to date</div>
            <div className="font-semibold">${initialStats.spentYear}</div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-slate-500">Avg purchase (30d)</div>
            <div className="font-semibold">${initialStats.avgPurchaseLast30}</div>
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

      <div className="space-y-3">
        {initialCards.map((c) => (
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
      </div>
    </div>
  );
}
