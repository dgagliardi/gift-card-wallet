"use client";

import type { TransactionCategory } from "@gift-card-wallet/domain";

const OPTIONS: { value: TransactionCategory; label: string }[] = [
  { value: "gas", label: "Gas" },
  { value: "merchandise", label: "Merchandise" },
];

export function CategoryToggle({
  value,
  onChange,
  size = "md",
  disabled = false,
}: {
  value: TransactionCategory;
  onChange: (next: TransactionCategory) => void;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const pad = size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-sm";
  return (
    <div
      className="inline-grid grid-cols-2 rounded-lg border border-slate-300 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-950"
      role="group"
      aria-label="Transaction category"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md font-medium transition-colors disabled:opacity-60 ${pad} ${
            value === o.value
              ? "bg-teal-600 text-white"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
