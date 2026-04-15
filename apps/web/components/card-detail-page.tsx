"use client";

import { parseGiftCardOcrText, parseReceiptOcrText } from "@gift-card-wallet/domain";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
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

type GestureCrop = { scale: number; x: number; y: number };
type SourceDims = { w: number; h: number };

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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function touchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
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
  const [editOriginalImage, setEditOriginalImage] = useState<File | null>(null);
  const [editCropPreviewUrl, setEditCropPreviewUrl] = useState("");
  const [sourceDims, setSourceDims] = useState<SourceDims | null>(null);
  const [gestureCrop, setGestureCrop] = useState<GestureCrop>({ scale: 1.4, x: 0, y: 0 });
  const cropRef = useRef<HTMLDivElement | null>(null);
  const [cropViewport, setCropViewport] = useState({ w: 320, h: 150 });
  const touchRef = useRef<{
    mode: "none" | "pan" | "pinch";
    startX: number;
    startY: number;
    startCropX: number;
    startCropY: number;
    startScale: number;
    startDistance: number;
    startMidX: number;
    startMidY: number;
  }>({
    mode: "none",
    startX: 0,
    startY: 0,
    startCropX: 0,
    startCropY: 0,
    startScale: 1.4,
    startDistance: 0,
    startMidX: 0,
    startMidY: 0,
  });
  const [editExtracting, setEditExtracting] = useState(false);
  const [editExtractMessage, setEditExtractMessage] = useState("");
  const [receiptScanning, setReceiptScanning] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState("");
  const [lastReceiptSignature, setLastReceiptSignature] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txNote, setTxNote] = useState("");
  const [txDate, setTxDate] = useState(() => toDateInputValue(new Date()));
  const [barcodeZoom, setBarcodeZoom] = useState(1.6);
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [isSavingBarcodeImage, setIsSavingBarcodeImage] = useState(false);
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [activityMessage, setActivityMessage] = useState("");
  const [editForm, setEditForm] = useState({
    brand: initialCard.brand,
    initialBalance: String(initialCard.initial),
    cardNumber: initialCard.cardNumber,
    pin: initialCard.pin,
    balanceUrl: initialCard.balanceUrl,
  });

  useEffect(() => {
    if (!(editOriginalImage instanceof File)) {
      setEditCropPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(editOriginalImage);
    setEditCropPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [editOriginalImage]);

  useEffect(() => {
    const el = cropRef.current;
    if (!el) return;
    const update = () => {
      setCropViewport({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!activityMessage) return;
    const timer = setTimeout(() => setActivityMessage(""), 3500);
    return () => clearTimeout(timer);
  }, [activityMessage]);

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

  function clampGesture(next: GestureCrop): GestureCrop {
    if (!sourceDims) return next;
    const fit = Math.min(cropViewport.w / sourceDims.w, cropViewport.h / sourceDims.h);
    const shownW = sourceDims.w * fit * next.scale;
    const shownH = sourceDims.h * fit * next.scale;
    const maxX = Math.max(0, (shownW - cropViewport.w) / 2);
    const maxY = Math.max(0, (shownH - cropViewport.h) / 2);
    return {
      scale: clamp(next.scale, 1, 10),
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY),
    };
  }

  async function handleEditImageSelection(originalFile: File) {
    setEditExtracting(true);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const u = URL.createObjectURL(originalFile);
        const el = new Image();
        el.onload = () => {
          URL.revokeObjectURL(u);
          resolve(el);
        };
        el.onerror = () => {
          URL.revokeObjectURL(u);
          reject(new Error("Image decode failed"));
        };
        el.src = u;
      });
      setSourceDims({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
      setGestureCrop({ scale: 1.4, x: 0, y: 0 });
      const parsed = parseGiftCardOcrText(await extractTextFromImage(originalFile));
      setEditForm((f) => ({
        ...f,
        cardNumber: parsed.cardNumber || f.cardNumber,
        pin: parsed.pin || f.pin,
        initialBalance: parsed.balance !== null ? parsed.balance.toFixed(2) : f.initialBalance,
      }));
      setEditExtractMessage("Use drag/pinch to frame barcode. Saved on Save card.");
    } catch {
      setEditExtractMessage("Could not extract details from this image.");
    } finally {
      setEditExtracting(false);
    }
  }

  async function buildGestureCroppedUpload(file: File): Promise<File> {
    if (!sourceDims || cropViewport.w < 10 || cropViewport.h < 10) return file;
    const srcUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Image decode failed"));
        el.src = srcUrl;
      });

      const outW = 1600;
      const outH = 500;
      const c = document.createElement("canvas");
      c.width = outW;
      c.height = outH;
      const ctx = c.getContext("2d");
      if (!ctx) return file;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outW, outH);

      const fit = Math.min(cropViewport.w / sourceDims.w, cropViewport.h / sourceDims.h);
      const shownW = sourceDims.w * fit * gestureCrop.scale;
      const shownH = sourceDims.h * fit * gestureCrop.scale;
      const scaleX = outW / cropViewport.w;
      const scaleY = outH / cropViewport.h;

      const drawW = shownW * scaleX;
      const drawH = shownH * scaleY;
      const drawX = (outW - drawW) / 2 + gestureCrop.x * scaleX;
      const drawY = (outH - drawH) / 2 + gestureCrop.y * scaleY;

      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) return file;
      const baseName = file.name.replace(/\.[^.]+$/, "");
      return new File([blob], `${baseName}_barcode.jpg`, { type: "image/jpeg" });
    } finally {
      URL.revokeObjectURL(srcUrl);
    }
  }

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    setActivityMessage("");
    setIsSavingCard(true);
    startTransition(async () => {
      try {
        await updateCardDetails({
          cardId: card.id,
          brand: editForm.brand,
          initialBalance: parseFloat(editForm.initialBalance) || 0,
          cardNumber: editForm.cardNumber,
          pin: editForm.pin,
          balanceUrl: editForm.balanceUrl,
        });
        if (editOriginalImage && card.type === "Digital") {
          setIsSavingBarcodeImage(true);
          const fd = new FormData();
          fd.set("image", await buildGestureCroppedUpload(editOriginalImage));
          await updateCardImageFromForm(card.id, fd);
          setEditOriginalImage(null);
        }
        setCard((prev) => ({
          ...prev,
          brand: editForm.brand,
          initial: parseFloat(editForm.initialBalance) || 0,
          cardNumber: editForm.cardNumber,
          pin: editForm.pin,
          balanceUrl: editForm.balanceUrl,
        }));
        setActivityMessage("Card saved");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setActivityMessage(msg ? `Save failed: ${msg.slice(0, 120)}` : "Save failed");
      } finally {
        setIsSavingBarcodeImage(false);
        setIsSavingCard(false);
      }
      refresh();
    });
  }

  async function submitTx(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(txAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setIsAddingTransaction(true);
    setActivityMessage("");
    startTransition(async () => {
      try {
        await addTransaction(card.id, amt, txNote, txDate);
        setTxAmount("");
        setTxNote("");
        setTxList(await getTransactions(card.id));
        setCard((c) => ({ ...c, current: Math.max(0, c.current - amt) }));
        setActivityMessage("Transaction added");
      } finally {
        setIsAddingTransaction(false);
      }
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
      const note = noteBits.join(" | ").slice(0, 500);
      setLastReceiptSignature(signature);
      setTxAmount(finalAmount.toFixed(2));
      setTxNote(note);
      if (parsedDate) setTxDate(parsedDate);
      setReceiptMessage(`Receipt captured: $${finalAmount.toFixed(2)}. Review/edit then tap Add.`);
      setActivityMessage("Receipt ready to review");
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
      <div className="sticky top-[72px] z-20 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/95">
        {isSavingCard ? (
          <span className="font-medium text-sky-700 dark:text-sky-300">Saving card...</span>
        ) : isSavingBarcodeImage ? (
          <span className="font-medium text-indigo-700 dark:text-indigo-300">
            Updating barcode image...
          </span>
        ) : isAddingTransaction ? (
          <span className="font-medium text-amber-700 dark:text-amber-300">
            Adding transaction...
          </span>
        ) : receiptScanning ? (
          <span className="font-medium text-teal-700 dark:text-teal-300">Scanning receipt...</span>
        ) : activityMessage ? (
          <span className="font-medium text-emerald-700 dark:text-emerald-300">
            {activityMessage}
          </span>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">Ready</span>
        )}
      </div>

      {card.imageUrl ? (
        <div>
          {imgVisible ? (
            <div>
              <div className="overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.imageUrl}
                  alt=""
                  style={{
                    transform: `scale(${barcodeZoom})`,
                    transformOrigin: "center center",
                  }}
                  className="max-h-[min(55vh,360px)] w-full object-contain transition-transform duration-150"
                />
              </div>
              <label className="mt-2 block text-xs text-slate-500">
                Barcode zoom ({barcodeZoom.toFixed(1)}x)
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.1}
                  value={barcodeZoom}
                  onChange={(e) => setBarcodeZoom(Number(e.target.value))}
                  className="w-full"
                />
              </label>
              <button
                type="button"
                onClick={() => setImgVisible(false)}
                className="mt-2 w-full rounded-lg border border-slate-300 py-1.5 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-400"
              >
                Hide barcode
              </button>
              <p className="mt-1 text-[11px] text-slate-500">
                Need tighter framing? Use Replace barcode image below to save a cropped version.
              </p>
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
                setEditExtractMessage("");
                if (!originalFile) {
                  setSourceDims(null);
                  return;
                }
                await handleEditImageSelection(originalFile);
              }}
            />
            <p className="mt-1 text-xs text-slate-500">{editExtracting ? "Extracting details..." : editExtractMessage}</p>
            {editOriginalImage ? (
              <div className="mt-2 space-y-2">
                <div
                  ref={cropRef}
                  className="relative h-36 w-full touch-none overflow-hidden rounded border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60"
                  onTouchStart={(e) => {
                    if (e.touches.length === 1) {
                      const t = e.touches[0]!;
                      touchRef.current = {
                        ...touchRef.current,
                        mode: "pan",
                        startX: t.clientX,
                        startY: t.clientY,
                        startCropX: gestureCrop.x,
                        startCropY: gestureCrop.y,
                      };
                    } else if (e.touches.length >= 2) {
                      const t0 = e.touches[0]!;
                      const t1 = e.touches[1]!;
                      touchRef.current = {
                        ...touchRef.current,
                        mode: "pinch",
                        startDistance: touchDistance(t0, t1),
                        startScale: gestureCrop.scale,
                        startCropX: gestureCrop.x,
                        startCropY: gestureCrop.y,
                        startMidX: (t0.clientX + t1.clientX) / 2,
                        startMidY: (t0.clientY + t1.clientY) / 2,
                      };
                    }
                  }}
                  onTouchMove={(e) => {
                    e.preventDefault();
                    const st = touchRef.current;
                    if (st.mode === "pan" && e.touches.length === 1) {
                      const t = e.touches[0]!;
                      const next = clampGesture({
                        ...gestureCrop,
                        x: st.startCropX + (t.clientX - st.startX),
                        y: st.startCropY + (t.clientY - st.startY),
                      });
                      setGestureCrop(next);
                    } else if (st.mode === "pinch" && e.touches.length >= 2) {
                      const t0 = e.touches[0]!;
                      const t1 = e.touches[1]!;
                      const dist = touchDistance(t0, t1);
                      const midX = (t0.clientX + t1.clientX) / 2;
                      const midY = (t0.clientY + t1.clientY) / 2;
                      const next = clampGesture({
                        scale: st.startScale * (dist / Math.max(1, st.startDistance)),
                        x: st.startCropX + (midX - st.startMidX),
                        y: st.startCropY + (midY - st.startMidY),
                      });
                      setGestureCrop(next);
                    }
                  }}
                  onTouchEnd={() => {
                    touchRef.current.mode = "none";
                  }}
                >
                  {editCropPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editCropPreviewUrl}
                      alt=""
                      style={{
                        transform: `translate(${gestureCrop.x}px, ${gestureCrop.y}px) scale(${gestureCrop.scale})`,
                        transformOrigin: "center center",
                      }}
                      className="h-full w-full object-contain transition-transform duration-75"
                    />
                  ) : null}
                  <div className="pointer-events-none absolute inset-0 border-2 border-dashed border-teal-400/70" />
                </div>
                <p className="text-[11px] text-slate-500">
                  Drag with one finger to move. Pinch with two fingers to zoom. Saved when you tap Save card.
                </p>
                <label className="block text-[11px] text-slate-500">
                  Zoom ({gestureCrop.scale.toFixed(1)}x)
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={0.1}
                    value={gestureCrop.scale}
                    onChange={(e) =>
                      setGestureCrop((prev) =>
                        clampGesture({ ...prev, scale: Number(e.target.value) }),
                      )
                    }
                    className="w-full"
                  />
                </label>
                {editCropPreviewUrl ? (
                  <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="mb-1 text-[11px] text-slate-500">Source image</p>
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
          {receiptScanning ? "Scanning receipt..." : "Scan receipt (prefill transaction)"}
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
