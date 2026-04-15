import Link from "next/link";
import { getAllTransactions } from "@/app/actions/wallet";

export default async function TransactionsPage() {
  const tx = await getAllTransactions();
  const total = tx.reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">
          Transaction History
        </h2>
        <Link
          href="/"
          className="text-sm font-medium text-teal-600 hover:text-teal-500 dark:text-teal-400"
        >
          Home
        </Link>
      </div>
      <p className="text-sm text-slate-500">
        Total:{" "}
        <span className="font-semibold text-slate-700 dark:text-slate-300">
          ${total.toFixed(2)}
        </span>{" "}
        across {tx.length} transactions
      </p>
      <ul className="space-y-2 text-sm">
        {tx.map((t) => (
          <li
            key={t.id}
            className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{t.cardBrand}</span>
              <span className="font-semibold">${t.amount.toFixed(2)}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {t.date} · {t.cardType}
            </div>
            {t.note ? <div className="mt-1 text-xs text-slate-500">{t.note}</div> : null}
          </li>
        ))}
        {tx.length === 0 ? (
          <li className="rounded-lg border border-slate-200 bg-white p-3 text-slate-500 dark:border-slate-800 dark:bg-slate-900/40">
            No transactions yet.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
