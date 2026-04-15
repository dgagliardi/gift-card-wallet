"use client";

import { parseGiftCardOcrText } from "@gift-card-wallet/domain";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCardFromForm } from "@/app/actions/wallet";

export function AddCardPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    brand: "",
    type: "Physical" as "Physical" | "Digital",
    initialBalance: "",
    cardNumber: "",
    pin: "",
    balanceUrl: "",
    image: null as File | null,
  });
  const [extracting, setExtracting] = useState(false);
  const [extractMessage, setExtractMessage] = useState("");

  async function extractTextFromImage(file: File): Promise<string> {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      const {
        data: { text },
      } = await worker.recognize(file);
      return text;
    } finally {
      await worker.terminate();
    }
  }

  async function onImageSelected(file: File | null) {
    setForm((f) => ({ ...f, image: file }));
    if (!file) return;
    setExtracting(true);
    setExtractMessage("");
    try {
      const parsed = parseGiftCardOcrText(await extractTextFromImage(file));
      setForm((f) => ({
        ...f,
        image: file,
        cardNumber: parsed.cardNumber || f.cardNumber,
        pin: parsed.pin || f.pin,
        initialBalance: parsed.balance !== null ? parsed.balance.toFixed(2) : f.initialBalance,
      }));
      setExtractMessage("Detected card details from image.");
    } catch {
      setExtractMessage("Could not extract details from this image.");
    } finally {
      setExtracting(false);
    }
  }

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("brand", form.brand);
    fd.set("type", form.type);
    fd.set("initialBalance", form.initialBalance || "0");
    fd.set("cardNumber", form.cardNumber);
    fd.set("pin", form.pin);
    fd.set("balanceUrl", form.balanceUrl);
    if (form.image) fd.set("image", form.image);
    startTransition(async () => {
      await saveCardFromForm(fd);
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">Add card</h2>
        <button
          type="button"
          className="text-sm font-medium text-teal-600 hover:text-teal-500 dark:text-teal-400"
          onClick={() => router.push("/")}
        >
          Home
        </button>
      </div>

      <form
        onSubmit={submitAdd}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40"
      >
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          Type
          <select
            value={form.type}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                type: e.target.value as "Physical" | "Digital",
              }))
            }
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="Physical">Physical</option>
            <option value="Digital">Digital</option>
          </select>
        </label>

        {form.type === "Digital" ? (
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
            Barcode / card image
            <input
              type="file"
              accept="image/*"
              className="mt-1 w-full text-sm"
              onChange={async (e) => onImageSelected(e.target.files?.[0] ?? null)}
            />
            <p className="mt-1 text-xs text-slate-500">
              {extracting ? "Extracting details..." : extractMessage}
            </p>
          </label>
        ) : null}

        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          Brand
          <input
            required
            value={form.brand}
            onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          Initial balance
          <input
            type="number"
            step="0.01"
            value={form.initialBalance}
            onChange={(e) => setForm((f) => ({ ...f, initialBalance: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          Card number
          <input
            value={form.cardNumber}
            onChange={(e) => setForm((f) => ({ ...f, cardNumber: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          PIN
          <input
            value={form.pin}
            onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          Check balance URL
          <input
            type="url"
            value={form.balanceUrl}
            onChange={(e) => setForm((f) => ({ ...f, balanceUrl: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-teal-600 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Save card
        </button>
      </form>
    </div>
  );
}
