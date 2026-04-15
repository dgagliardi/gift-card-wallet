"use client";

import { getLikelyBarcodeCropArea, parseGiftCardOcrText, parseReceiptOcrText } from "@gift-card-wallet/domain";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { WalletCard, WalletTx } from "@/app/actions/wallet";
import {
  addTransaction,
  deleteTransaction,
  getTransactions,
  toggleArchive,
  updateCardDetails,
  updateCardImageFromForm,
} from "@/app/actions/wallet";
import { extractReceiptTextWithGoogleVision } from "@/app/actions/receipt-vision";

type CropTuning = {
  yPct: number;
  heightPct: number;
  sidePadPct: number;
};

const DEFAULT_CROP: CropTuning = {
  yPct: 55,
  heightPct: 33,
  sidePadPct: 8,
};

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseReceiptDateInputValue(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mdy = t.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!mdy) return null;
  const mm = Number(mdy[1]);
  const dd = Number(mdy[2]);
  let yy = Number(mdy[3]);
  if (!Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(yy)) return null;
  if (yy < 100) yy += yy >= 70 ? 1900 : 2000;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function CardDetailPage({
  initialCard,
  initialTx,
}: {
  initialCard: WalletCard;
  initialTx: WalletTx[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [card, setCard] = useState(initialCard);
  const [txList, setTxList] = useState(initialTx);
  const [imgVisible, setImgVisible] = useState(false);
  const [editImage, setEditImage] = useState<File | null>(null);
  const [editOriginalImage, setEditOriginalImage] = useState<File | null>(null);
  const [editCrop, setEditCrop] = useState<CropTuning>(DEFAULT_CROP);
  const [editCropPreviewUrl, setEditCropPreviewUrl] = useState("");
  const [editExtracting, setEditExtracting] = useState(false);
  const [editExtractMessage, setEditExtractMessage] = useState("");
  const [receiptScanning, setReceiptScanning] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState("");
  const [lastReceiptSignature, setLastReceiptSignature] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txNote, setTxNote] = useState("");
  const [txDate, setTxDate] = useState(() => toDateInputValue(new Date()));
  const [editForm, setEditForm] = useState({
    brand: initialCard.brand,
    initialBalance: String(initialCard.initial),
    cardNumber: initialCard.cardNumber,
    pin: initialCard.pin,
    balanceUrl: initialCard.balanceUrl,
  });

  useEffect(() => {
    if (!(editImage instanceof File)) {
      setEditCropPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(editImage);
    setEditCropPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [editImage]);

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

  async function prepareImageForReceiptOcr(file: File): Promise<File> {
    if (!file.type.startsWith("image/")) return file;
    const srcUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("decode"));
        el.src = srcUrl;
      });
      const maxW = 2400;
      if (img.width <= maxW) return file;
      const scale = maxW / img.width;
      const w = Math.max(1, Math.floor(img.width * scale));
      const h = Math.max(1, Math.floor(img.height * scale));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.93));
      if (!blob) return file;
      return new File([blob], "receipt_ocr.jpg", { type: "image/jpeg" });
    } catch {
      return file;
    } finally {
      URL.revokeObjectURL(srcUrl);
    }
  }

  function buildCropArea(
    width: number,
    height: number,
    tuning?: CropTuning,
  ): { x: number; y: number; width: number; height: number } {
    if (!tuning) return getLikelyBarcodeCropArea(width, height);
    const sidePad = Math.floor(width * (tuning.sidePadPct / 100));
    const x = Math.max(0, Math.min(sidePad, width - 1));
    const cropWidth = Math.max(1, width - x * 2);
    const y = Math.max(0, Math.min(Math.floor(height * (tuning.yPct / 100)), height - 1));
    const cropHeight = Math.max(
      1,
      Math.min(Math.floor(height * (tuning.heightPct / 100)), height - y),
    );
    return { x, y, width: cropWidth, height: cropHeight };
  }

  async function prepareBarcodeFocusedUpload(file: File, tuning?: CropTuning): Promise<File> {
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
      const crop = buildCropArea(normalizedWidth, normalizedHeight, tuning);
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
      return new File([blob], `${baseName}_barcode.jpg`, { type: "image/jpeg" });
    } finally {
      URL.revokeObjectURL(srcUrl);
    }
  }

  async function applyEditImageSelection(originalFile: File, crop: CropTuning) {
    setEditExtracting(true);
    try {
      const parsed = parseGiftCardOcrText(await extractTextFromImage(originalFile));
      const uploadFile = await prepareBarcodeFocusedUpload(originalFile, crop);
      setEditImage(uploadFile);
      setEditForm((f) => ({
        ...f,
        cardNumber: parsed.cardNumber || f.cardNumber,
        pin: parsed.pin || f.pin,
        initialBalance: parsed.balance !== null ? parsed.balance.toFixed(2) : f.initialBalance,
      }));
      setEditExtractMessage("Detected card details. Saved image is cropped to barcode area.");
    } catch {
      setEditExtractMessage("Could not extract details from this image.");
    } finally {
      setEditExtracting(false);
    }
  }

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await updateCardDetails({
        cardId: card.id,
        brand: editForm.brand,
        initialBalance: parseFloat(editForm.initialBalance) || 0,
        cardNumber: editForm.cardNumber,
        pin: editForm.pin,
        balanceUrl: editForm.balanceUrl,
      });
      if (editImage && card.type === "Digital") {
        const fd = new FormData();
        fd.set("image", editImage);
        await updateCardImageFromForm(card.id, fd);
      }
      refresh();
    });
  }

  async function submitTx(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(txAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    startTransition(async () => {
      await addTransaction(card.id, amt, txNote, txDate);
      setTxAmount("");
      setTxNote("");
      setTxList(await getTransactions(card.id));
      setCard((c) => ({ ...c, current: Math.max(0, c.current - amt) }));
      refresh();
    });
  }

  async function autoCreateTransactionFromReceipt(file: File) {
    setReceiptScanning(true);
    setReceiptMessage("");
    try {
      const prepared = await prepareImageForReceiptOcr(file);
      const rawText = await extractTextFromImage(prepared);
      let parsed = parseReceiptOcrText(rawText);
      let usedVision = false;
      let visionError = "";
      const looksCostco = /(COSTCO|WHOLESALE)/i.test(rawText);
      const needsVision = rawText.trim().length < 12 || parsed.amount === null || parsed.amount <= 0;
      const shouldTryVision = needsVision || looksCostco;
      if (shouldTryVision) {
        const fd = new FormData();
        fd.set("image", prepared);
        const vision = await extractReceiptTextWithGoogleVision(fd);
        if (vision.ok) {
          const parsedVision = parseReceiptOcrText(vision.text);
          if (parsedVision.amount !== null && parsedVision.amount > 0) {
            const localAmount = parsed.amount ?? 0;
            const visionAmount = parsedVision.amount;
            const disagreeLarge = Math.abs(localAmount - visionAmount) >= 10;
            if (
              parsed.amount === null ||
              parsed.amount <= 0 ||
              (looksCostco && disagreeLarge) ||
              (!looksCostco && parsedVision.summary.length > parsed.summary.length)
            ) {
              parsed = parsedVision;
              usedVision = true;
            }
          } else if (parsed.amount === null || parsed.amount <= 0) {
            parsed = parsedVision;
            usedVision = true;
          }
        } else {
          visionError = vision.error;
        }
      }
      if (parsed.amount === null || parsed.amount <= 0) {
        const hint =
          rawText.trim().length < 12 && !usedVision
            ? "Could not read receipt text. Try brighter light, hold steady, or move closer."
            : "Could not find a purchase amount. Check photo focus; totals near the bottom work best.";
        const detail = visionError ? ` Cloud OCR: ${visionError.slice(0, 180)}` : "";
        setReceiptMessage(`${hint}${detail}`);
        return;
      }
      let finalAmount = parsed.amount;
      if (
        parsed.remainingBalance !== null &&
        Number.isFinite(card.current) &&
        card.current > parsed.remainingBalance
      ) {
        const implied = Number((card.current - parsed.remainingBalance).toFixed(2));
        const sumMatches = Math.abs(parsed.remainingBalance + parsed.amount - card.current) <= 1.5;
        if (implied > 0 && implied <= card.current && sumMatches) {
          finalAmount = implied;
        }
      }
      const signature = [card.id, finalAmount.toFixed(2), parsed.merchant, parsed.dateText].join("|");
      if (signature === lastReceiptSignature) {
        setReceiptMessage("Duplicate receipt scan ignored.");
        return;
      }
      const noteBits = [usedVision ? "[OCR receipt Vision]" : "[OCR receipt]"];
      if (parsed.merchant) noteBits.push(parsed.merchant);
      if (parsed.dateText) noteBits.push(parsed.dateText);
      if (parsed.summary) noteBits.push(parsed.summary);
      if (parsed.amount !== finalAmount) {
        noteBits.push(
          `reconciled amount ${finalAmount.toFixed(2)} (OCR total ${parsed.amount.toFixed(2)})`,
        );
      }
      const parsedDate = parseReceiptDateInputValue(parsed.dateText);
      await addTransaction(
        card.id,
        finalAmount,
        noteBits.join(" | ").slice(0, 500),
        parsedDate ?? txDate,
      );
      setLastReceiptSignature(signature);
      setReceiptMessage(`Receipt added: $${finalAmount.toFixed(2)}`);
      setCard((c) => ({ ...c, current: Math.max(0, c.current - finalAmount) }));
      setTxList(await getTransactions(card.id));
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setReceiptMessage(msg ? `Receipt scan failed: ${msg.slice(0, 160)}` : "Receipt scan failed.");
    } finally {
      setReceiptScanning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">{card.brand}</h2>
        <button
          type="button"
          className="text-sm font-medium text-teal-600 dark:text-teal-400"
          onClick={() => router.push("/")}
        >
          Back to Home
        </button>
      </div>

      {card.imageUrl ? (
        <div>
          {imgVisible ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.imageUrl}
                alt=""
                className="max-h-[min(55vh,360px)] w-full rounded-lg object-contain bg-slate-100 dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={() => setImgVisible(false)}
                className="mt-2 w-full rounded-lg border border-slate-300 py-1.5 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-400"
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
              Show barcode
            </button>
          )}
        </div>
      ) : null}

      <form onSubmit={submitEdit} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40">
        <h3 className="text-sm font-semibold">Card details</h3>
        <input value={editForm.brand} onChange={(e) => setEditForm((f) => ({ ...f, brand: e.target.value }))} className="w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950" />
        <input type="number" step="0.01" value={editForm.initialBalance} onChange={(e) => setEditForm((f) => ({ ...f, initialBalance: e.target.value }))} className="w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950" />
        <input value={editForm.cardNumber} onChange={(e) => setEditForm((f) => ({ ...f, cardNumber: e.target.value }))} placeholder="Card number" className="w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950" />
        <input value={editForm.pin} onChange={(e) => setEditForm((f) => ({ ...f, pin: e.target.value }))} placeholder="PIN" className="w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950" />
        <input type="url" value={editForm.balanceUrl} onChange={(e) => setEditForm((f) => ({ ...f, balanceUrl: e.target.value }))} placeholder="Check balance URL" className="w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950" />
        {card.type === "Digital" ? (
          <label className="block text-xs font-medium">
            {card.imageUrl ? "Replace barcode image" : "Upload barcode image"}
            <input
              type="file"
              accept="image/*"
              className="mt-1 w-full text-sm"
              onChange={async (e) => {
                const originalFile = e.target.files?.[0] ?? null;
                setEditOriginalImage(originalFile);
                setEditImage(originalFile);
                setEditExtractMessage("");
                if (!originalFile) return;
                await applyEditImageSelection(originalFile, editCrop);
              }}
            />
            <p className="mt-1 text-xs text-slate-500">{editExtracting ? "Extracting details..." : editExtractMessage}</p>
            {editOriginalImage ? (
              <div className="mt-2 space-y-1">
                <label className="block text-[11px] text-slate-500">
                  Vertical position ({editCrop.yPct}%)
                  <input type="range" min={35} max={75} value={editCrop.yPct} onChange={async (ev) => { const next = { ...editCrop, yPct: Number(ev.target.value) }; setEditCrop(next); if (editOriginalImage) setEditImage(await prepareBarcodeFocusedUpload(editOriginalImage, next)); }} className="w-full" />
                </label>
                <label className="block text-[11px] text-slate-500">
                  Crop height ({editCrop.heightPct}%)
                  <input type="range" min={18} max={50} value={editCrop.heightPct} onChange={async (ev) => { const next = { ...editCrop, heightPct: Number(ev.target.value) }; setEditCrop(next); if (editOriginalImage) setEditImage(await prepareBarcodeFocusedUpload(editOriginalImage, next)); }} className="w-full" />
                </label>
                <label className="block text-[11px] text-slate-500">
                  Side padding ({editCrop.sidePadPct}%)
                  <input type="range" min={0} max={20} value={editCrop.sidePadPct} onChange={async (ev) => { const next = { ...editCrop, sidePadPct: Number(ev.target.value) }; setEditCrop(next); if (editOriginalImage) setEditImage(await prepareBarcodeFocusedUpload(editOriginalImage, next)); }} className="w-full" />
                </label>
                {editCropPreviewUrl ? (
                  <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="mb-1 text-[11px] text-slate-500">Saved barcode preview</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={editCropPreviewUrl} alt="" className="max-h-28 w-full rounded object-contain bg-white dark:bg-slate-950" />
                  </div>
                ) : null}
              </div>
            ) : null}
          </label>
        ) : null}
        <button type="submit" disabled={pending} className="w-full rounded-lg bg-teal-600 py-2 text-sm text-white disabled:opacity-60">Save card</button>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40">
        <h3 className="text-sm font-semibold">Deduct</h3>
        <label className="mt-2 block cursor-pointer rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-600 hover:border-teal-400 hover:text-teal-600 dark:border-slate-600 dark:text-slate-400">
          {receiptScanning ? "Scanning receipt..." : "Scan receipt (auto add transaction)"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={receiptScanning || pending}
            onChange={async (e) => {
              const file = e.target.files?.[0] ?? null;
              e.currentTarget.value = "";
              if (!file) return;
              await autoCreateTransactionFromReceipt(file);
            }}
          />
        </label>
        {receiptMessage ? <p className="mt-1 text-xs text-slate-500">{receiptMessage}</p> : null}
        <form onSubmit={submitTx} className="mt-2 flex flex-wrap gap-2">
          <input
            type="date"
            value={txDate}
            onChange={(e) => setTxDate(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950"
          />
          <input type="number" step="0.01" placeholder="Amount" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950" />
          <input placeholder="Note" value={txNote} onChange={(e) => setTxNote(e.target.value)} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-950" />
          <button type="submit" disabled={pending} className="w-full rounded bg-amber-600 py-1.5 text-sm text-white sm:w-auto">Add</button>
        </form>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40">
        <h3 className="text-sm font-semibold">History</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {txList.map((t) => (
            <li key={t.id} className="flex flex-col border-b border-slate-100 pb-2 dark:border-slate-800">
              <span>{t.date} — ${t.amount.toFixed(2)} (left ${t.balance.toFixed(2)})</span>
              <span className="text-slate-500">{t.note}</span>
              <button
                type="button"
                className="mt-1 text-left text-xs text-red-600"
                onClick={() => {
                  if (!confirm("Delete this transaction?")) return;
                  startTransition(async () => {
                    await deleteTransaction(t.id, card.id);
                    setTxList(await getTransactions(card.id));
                    refresh();
                  });
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        className="w-full rounded-lg border border-slate-300 py-2 text-sm dark:border-slate-600"
        onClick={() => {
          startTransition(async () => {
            await toggleArchive(card.id, !card.archived);
            router.push("/");
            refresh();
          });
        }}
      >
        {card.archived ? "Unarchive" : "Archive"}
      </button>
    </div>
  );
}
