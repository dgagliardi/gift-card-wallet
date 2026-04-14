"use client";

import type { WalletStats } from "@gift-card-wallet/domain";
import { getLikelyBarcodeCropArea } from "@gift-card-wallet/domain";
import { parseGiftCardOcrText } from "@gift-card-wallet/domain";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AllTx, WalletCard } from "@/app/actions/wallet";
import {
  addTransaction,
  deleteTransaction,
  getAllTransactions,
  getTransactions,
  saveCardFromForm,
  toggleArchive,
  updateCardDetails,
  updateCardImageFromForm,
} from "@/app/actions/wallet";

type Props = {
  initialCards: WalletCard[];
  initialStats: WalletStats;
};

export function WalletHome({ initialCards, initialStats }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Add card
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    brand: "",
    type: "Physical" as "Physical" | "Digital",
    initialBalance: "",
    cardNumber: "",
    pin: "",
    balanceUrl: "",
    image: null as File | null,
  });
  const [addExtracting, setAddExtracting] = useState(false);
  const [addExtractMessage, setAddExtractMessage] = useState("");

  // Transaction history (all cards)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [allTxList, setAllTxList] = useState<AllTx[]>([]);

  // Card detail
  const [detailCard, setDetailCard] = useState<WalletCard | null>(null);
  const [imgVisible, setImgVisible] = useState(false);
  const [editImage, setEditImage] = useState<File | null>(null);
  const [editForm, setEditForm] = useState({
    brand: "",
    initialBalance: "",
    cardNumber: "",
    pin: "",
    balanceUrl: "",
  });
  const [editExtracting, setEditExtracting] = useState(false);
  const [editExtractMessage, setEditExtractMessage] = useState("");
  const [txList, setTxList] = useState<
    Awaited<ReturnType<typeof getTransactions>>
  >([]);
  const [txAmount, setTxAmount] = useState("");
  const [txNote, setTxNote] = useState("");

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function extractFromImage(file: File): Promise<{
    cardNumber: string;
    pin: string;
    balance: number | null;
  }> {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      const {
        data: { text },
      } = await worker.recognize(file);
      return parseGiftCardOcrText(text);
    } finally {
      await worker.terminate();
    }
  }

  async function prepareBarcodeFocusedUpload(file: File): Promise<File> {
    const srcUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Image decode failed"));
        el.src = srcUrl;
      });

      const maxWidth = 1600;
      const scale = Math.min(1, maxWidth / img.width);
      const normalizedWidth = Math.max(1, Math.floor(img.width * scale));
      const normalizedHeight = Math.max(1, Math.floor(img.height * scale));

      const normalizedCanvas = document.createElement("canvas");
      normalizedCanvas.width = normalizedWidth;
      normalizedCanvas.height = normalizedHeight;
      const nctx = normalizedCanvas.getContext("2d");
      if (!nctx) return file;
      nctx.drawImage(img, 0, 0, normalizedWidth, normalizedHeight);

      const crop = getLikelyBarcodeCropArea(normalizedWidth, normalizedHeight);
      const barcodeCanvas = document.createElement("canvas");
      barcodeCanvas.width = crop.width;
      barcodeCanvas.height = crop.height;
      const bctx = barcodeCanvas.getContext("2d");
      if (!bctx) return file;
      bctx.drawImage(
        normalizedCanvas,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height,
      );

      const blob = await new Promise<Blob | null>((resolve) => {
        barcodeCanvas.toBlob(resolve, "image/jpeg", 0.88);
      });
      if (!blob) return file;

      const baseName = file.name.replace(/\.[^.]+$/, "");
      return new File([blob], `${baseName}_barcode.jpg`, {
        type: "image/jpeg",
      });
    } finally {
      URL.revokeObjectURL(srcUrl);
    }
  }

  function makeExtractMessage(parsed: {
    cardNumber: string;
    pin: string;
    balance: number | null;
  }): string {
    const found: string[] = [];
    if (parsed.cardNumber) found.push("card number");
    if (parsed.pin) found.push("PIN");
    if (parsed.balance !== null) found.push("balance");
    return found.length > 0
      ? `Detected: ${found.join(", ")}.`
      : "Could not detect card details from this image.";
  }

  async function openHistory() {
    const txs = await getAllTransactions();
    setAllTxList(txs);
    setHistoryOpen(true);
  }

  async function openDetail(c: WalletCard) {
    setDetailCard(c);
    setImgVisible(false);
    setEditImage(null);
    setEditExtractMessage("");
    setEditForm({
      brand: c.brand,
      initialBalance: String(c.initial),
      cardNumber: c.cardNumber,
      pin: c.pin,
      balanceUrl: c.balanceUrl,
    });
    setTxAmount("");
    setTxNote("");
    const txs = await getTransactions(c.id);
    setTxList(txs);
  }

  async function submitAdd(e: React.FormEvent) {
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
      setAddOpen(false);
      setAddExtractMessage("");
      setForm({
        brand: "",
        type: "Physical",
        initialBalance: "",
        cardNumber: "",
        pin: "",
        balanceUrl: "",
        image: null,
      });
      refresh();
    });
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!detailCard) return;
    startTransition(async () => {
      await updateCardDetails({
        cardId: detailCard.id,
        brand: editForm.brand,
        initialBalance: parseFloat(editForm.initialBalance) || 0,
        cardNumber: editForm.cardNumber,
        pin: editForm.pin,
        balanceUrl: editForm.balanceUrl,
      });
      if (editImage && detailCard.type === "Digital") {
        const fd = new FormData();
        fd.set("image", editImage);
        await updateCardImageFromForm(detailCard.id, fd);
      }
      setDetailCard(null);
      setEditExtractMessage("");
      refresh();
    });
  }

  async function submitTx(e: React.FormEvent) {
    e.preventDefault();
    if (!detailCard) return;
    const amt = parseFloat(txAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    startTransition(async () => {
      await addTransaction(detailCard.id, amt, txNote);
      setTxAmount("");
      setTxNote("");
      const txs = await getTransactions(detailCard.id);
      setTxList(txs);
      refresh();
    });
  }

  const totalAllTx = allTxList.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-6">

      {/* Stats */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400">
            Spending ({initialStats.yearLabel})
          </h2>
          <button
            type="button"
            onClick={openHistory}
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

      {/* Add card */}
      <button
        type="button"
        onClick={() => {
          setAddExtractMessage("");
          setAddOpen(true);
        }}
        disabled={pending}
        className="w-full rounded-lg bg-teal-600 py-3 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-60"
      >
        Add card
      </button>

      {/* Card list */}
      <div className="space-y-3">
        {initialCards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => openDetail(c)}
            className={`flex w-full gap-3 rounded-[10px] border border-white/10 px-[14px] py-[14px] text-left text-white shadow-lg min-h-[110px] ${
              c.type === "Digital"
                ? "bg-linear-to-br from-[#e52d27] to-[#b31217]"
                : "bg-linear-to-br from-[#0f2027] via-[#203a43] to-[#2c5364]"
            } ${c.archived ? "opacity-60 grayscale-[0.3]" : ""}`}
          >
            {c.imageUrl ? (
              <div className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-lg border border-white/20 bg-black/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.imageUrl}
                  alt=""
                  className="h-full w-full object-cover blur-sm"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-semibold text-white/90 drop-shadow">
                    Tap to view
                  </span>
                </div>
              </div>
            ) : null}
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

      {/* Add card modal */}
      {addOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400">
              New card
            </h3>
            <form onSubmit={submitAdd} className="mt-4 space-y-3">
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
                    onChange={async (e) => {
                      const originalFile = e.target.files?.[0] ?? null;
                      setForm((f) => ({ ...f, image: originalFile }));
                      setAddExtractMessage("");
                      if (!originalFile) return;
                      setAddExtracting(true);
                      try {
                        const parsed = await extractFromImage(originalFile);
                        const uploadFile =
                          await prepareBarcodeFocusedUpload(originalFile);
                        setForm((f) => ({
                          ...f,
                          image: uploadFile,
                          cardNumber: parsed.cardNumber || f.cardNumber,
                          pin: parsed.pin || f.pin,
                          initialBalance:
                            parsed.balance !== null
                              ? parsed.balance.toFixed(2)
                              : f.initialBalance,
                        }));
                        setAddExtractMessage(
                          `${makeExtractMessage(parsed)} Saved image is cropped to barcode area.`,
                        );
                      } catch {
                        setAddExtractMessage("Could not extract details from this image.");
                      } finally {
                        setAddExtracting(false);
                      }
                    }}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Stored securely on this server — only you can view it.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {addExtracting ? "Extracting details..." : addExtractMessage}
                  </p>
                </label>
              ) : null}
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Brand
                <input
                  required
                  value={form.brand}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, brand: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Initial balance
                <input
                  type="number"
                  step="0.01"
                  value={form.initialBalance}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, initialBalance: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Card number
                <input
                  value={form.cardNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cardNumber: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                PIN
                <input
                  value={form.pin}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pin: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Check balance URL
                <input
                  type="url"
                  value={form.balanceUrl}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, balanceUrl: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddExtractMessage("");
                    setAddOpen(false);
                  }}
                  className="flex-1 rounded-lg border border-slate-300 py-2 text-sm dark:border-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 rounded-lg bg-teal-600 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Transaction history modal */}
      {historyOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400">
                Transaction History
              </h3>
              <button
                type="button"
                className="text-sm text-slate-500"
                onClick={() => setHistoryOpen(false)}
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Total: <span className="font-semibold text-slate-700 dark:text-slate-300">${totalAllTx.toFixed(2)}</span> across {allTxList.length} transactions
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {allTxList.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col border-b border-slate-100 pb-2 dark:border-slate-800"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{t.cardBrand}</span>
                    <span className="font-semibold">${t.amount.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{t.date} · {t.cardType}</span>
                    {t.note ? <span className="truncate">{t.note}</span> : null}
                  </div>
                </li>
              ))}
              {allTxList.length === 0 ? (
                <li className="text-slate-500">No transactions yet.</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Card detail modal */}
      {detailCard ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex justify-between gap-2">
              <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400">
                {detailCard.brand}
              </h3>
              <button
                type="button"
                className="text-sm text-slate-500"
                onClick={() => setDetailCard(null)}
              >
                Close
              </button>
            </div>

            {/* Barcode image — tap to reveal */}
            {detailCard.imageUrl ? (
              <div className="mt-3">
                {imgVisible ? (
                  <div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={detailCard.imageUrl}
                      alt=""
                      className="max-h-[min(50vh,320px)] w-full rounded-lg object-contain bg-slate-100 dark:bg-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => setImgVisible(false)}
                      className="mt-1 w-full rounded-lg border border-slate-300 py-1.5 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-400"
                    >
                      Hide barcode
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setImgVisible(true)}
                    className="w-full rounded-lg border-2 border-dashed border-slate-300 py-4 text-sm font-medium text-slate-500 hover:border-teal-400 hover:text-teal-600 dark:border-slate-600"
                  >
                    🔒 Show barcode
                  </button>
                )}
              </div>
            ) : null}

            {/* Edit form */}
            <form onSubmit={submitEdit} className="mt-4 space-y-2">
              <label className="block text-xs font-medium">Brand</label>
              <input
                value={editForm.brand}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, brand: e.target.value }))
                }
                className="w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950"
              />
              <label className="block text-xs font-medium">
                Initial balance
              </label>
              <input
                type="number"
                step="0.01"
                value={editForm.initialBalance}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    initialBalance: e.target.value,
                  }))
                }
                className="w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950"
              />
              <label className="block text-xs font-medium">Card number</label>
              <input
                value={editForm.cardNumber}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, cardNumber: e.target.value }))
                }
                className="w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950"
              />
              <label className="block text-xs font-medium">PIN</label>
              <input
                value={editForm.pin}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, pin: e.target.value }))
                }
                className="w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950"
              />
              <label className="block text-xs font-medium">
                Check balance URL
              </label>
              <input
                type="url"
                value={editForm.balanceUrl}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, balanceUrl: e.target.value }))
                }
                className="w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950"
              />
              {detailCard.type === "Digital" ? (
                <label className="block text-xs font-medium">
                  {detailCard.imageUrl ? "Replace barcode image" : "Upload barcode image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-1 w-full text-sm"
                    onChange={async (e) => {
                      const originalFile = e.target.files?.[0] ?? null;
                      setEditImage(originalFile);
                      setEditExtractMessage("");
                      if (!originalFile) return;
                      setEditExtracting(true);
                      try {
                        const parsed = await extractFromImage(originalFile);
                        const uploadFile =
                          await prepareBarcodeFocusedUpload(originalFile);
                        setEditImage(uploadFile);
                        setEditForm((f) => ({
                          ...f,
                          cardNumber: parsed.cardNumber || f.cardNumber,
                          pin: parsed.pin || f.pin,
                          initialBalance:
                            parsed.balance !== null
                              ? parsed.balance.toFixed(2)
                              : f.initialBalance,
                        }));
                        setEditExtractMessage(
                          `${makeExtractMessage(parsed)} Saved image is cropped to barcode area.`,
                        );
                      } catch {
                        setEditExtractMessage("Could not extract details from this image.");
                      } finally {
                        setEditExtracting(false);
                      }
                    }}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {editExtracting ? "Extracting details..." : editExtractMessage}
                  </p>
                </label>
              ) : null}
              <button
                type="submit"
                disabled={pending}
                className="mt-2 w-full rounded-lg bg-teal-600 py-2 text-sm text-white disabled:opacity-60"
              >
                Save card
              </button>
            </form>

            {/* Deduct */}
            <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
              <h4 className="text-sm font-semibold">Deduct</h4>
              <form onSubmit={submitTx} className="mt-2 flex flex-wrap gap-2">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Amount"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950"
                />
                <input
                  placeholder="Note"
                  value={txNote}
                  onChange={(e) => setTxNote(e.target.value)}
                  className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded bg-amber-600 py-1.5 text-sm text-white sm:w-auto"
                >
                  Add
                </button>
              </form>
            </div>

            {/* Transaction history for this card */}
            <div className="mt-4">
              <h4 className="text-sm font-semibold">History</h4>
              <ul className="mt-2 space-y-2 text-sm">
                {txList.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-col border-b border-slate-100 pb-2 dark:border-slate-800"
                  >
                    <span>
                      {t.date} — ${t.amount.toFixed(2)} (left ${t.balance.toFixed(2)})
                    </span>
                    <span className="text-slate-500">{t.note}</span>
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() => {
                          if (!detailCard) return;
                          if (!confirm("Delete this transaction?")) return;
                          startTransition(async () => {
                            await deleteTransaction(t.id, detailCard.id);
                            const txs = await getTransactions(detailCard.id);
                            setTxList(txs);
                            refresh();
                          });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Archive toggle */}
            <button
              type="button"
              className="mt-4 w-full rounded-lg border border-slate-300 py-2 text-sm dark:border-slate-600"
              onClick={() => {
                if (!detailCard) return;
                startTransition(async () => {
                  await toggleArchive(detailCard.id, !detailCard.archived);
                  setDetailCard(null);
                  refresh();
                });
              }}
            >
              {detailCard.archived ? "Unarchive" : "Archive"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
