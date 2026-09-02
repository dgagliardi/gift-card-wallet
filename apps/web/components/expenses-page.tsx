"use client";

import type { CategoryTotals, ExpenseSummary } from "@gift-card-wallet/domain";
import { useState } from "react";

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString(undefined, {
    month: "short",
  });
}

/** Adjustments are a memo already netted into gas/merchandise, never an addend. */
function AdjustmentCell({ totals }: { totals: CategoryTotals }) {
  return (
    <td className="px-2 py-2 text-right text-slate-400 dark:text-slate-500">
      {totals.adjustments > 0 ? `(${money(totals.adjustments)})` : "—"}
    </td>
  );
}

function TotalsRow({
  label,
  totals,
  muted = false,
}: {
  label: string;
  totals: CategoryTotals;
  muted?: boolean;
}) {
  return (
    <tr
      className={`border-t border-slate-100 dark:border-slate-800 ${
        muted ? "text-slate-400 dark:text-slate-600" : ""
      }`}
    >
      <th scope="row" className="px-2 py-2 text-left font-medium">
        {label}
      </th>
      <td className="px-2 py-2 text-right">{money(totals.gas)}</td>
      <td className="px-2 py-2 text-right">{money(totals.merchandise)}</td>
      <AdjustmentCell totals={totals} />
      <td className="px-2 py-2 text-right font-semibold">{money(totals.total)}</td>
    </tr>
  );
}

function TableHead({ first }: { first: string }) {
  return (
    <thead>
      <tr className="text-xs uppercase tracking-wide text-slate-500">
        <th scope="col" className="px-2 py-2 text-left font-medium">
          {first}
        </th>
        <th scope="col" className="px-2 py-2 text-right font-medium">
          Gas
        </th>
        <th scope="col" className="px-2 py-2 text-right font-medium">
          Merch
        </th>
        <th scope="col" className="px-2 py-2 text-right font-medium">
          Adj
        </th>
        <th scope="col" className="px-2 py-2 text-right font-medium">
          Total
        </th>
      </tr>
    </thead>
  );
}

function Panel({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {title}
      </h3>
      <div className="mt-2 overflow-x-auto">{children}</div>
    </section>
  );
}

export function ExpensesPage({ summary }: { summary: ExpenseSummary }) {
  const [year, setYear] = useState(
    () => summary.years[0]?.year ?? new Date().getFullYear(),
  );

  if (summary.years.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">
          Expenses
        </h2>
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
          No transactions yet. Spending will appear here once you record one.
        </div>
      </div>
    );
  }

  const months = summary.months.filter((m) => m.year === year);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">
        Expenses
      </h2>

      <Panel title="Year over year">
        <table className="w-full min-w-[22rem] text-sm">
          <TableHead first="Year" />
          <tbody>
            {summary.years.map((y) => (
              <TotalsRow key={y.year} label={String(y.year)} totals={y.totals} />
            ))}
          </tbody>
        </table>
      </Panel>

      {summary.years.length > 1 ? (
        <div
          className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs font-medium shadow-sm dark:border-slate-800 dark:bg-slate-900/60"
          role="tablist"
          aria-label="Year"
        >
          {summary.years.map((y) => (
            <button
              key={y.year}
              type="button"
              role="tab"
              aria-selected={y.year === year}
              onClick={() => setYear(y.year)}
              className={`rounded-md px-3 py-1.5 ${
                y.year === year
                  ? "bg-teal-600 text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {y.year}
            </button>
          ))}
        </div>
      ) : null}

      <Panel title={`${year} by month`}>
        <table className="w-full min-w-[22rem] text-sm">
          <TableHead first="Month" />
          <tbody>
            {months.map((m) => (
              <TotalsRow
                key={`${m.year}-${m.month}`}
                label={monthName(m.month)}
                totals={m.totals}
                muted={m.totals.total === 0 && m.totals.adjustments === 0}
              />
            ))}
          </tbody>
        </table>
      </Panel>

      <p className="text-xs text-slate-500">
        Adj is the total of adjustments (negative amounts) in the period, shown
        for reference. It is already subtracted from Gas and Merch, so it is not
        added into Total.
      </p>
    </div>
  );
}
