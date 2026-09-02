"use client";

import { parseGiftCardOcrText } from "@gift-card-wallet/domain";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { saveCardFromForm } from "@/app/actions/wallet";

type CardType = "Physical" | "Digital";

type BarcodeResult = {
  rawValue?: string;
};

type BarcodeDetectorLike = {
  detect(image: ImageBitmapSource): Promise<BarcodeResult[]>;
};

type WindowWithBarcodeDetector = Window & {
  BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
};

const barcodeFormats = [
  "aztec",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "data_matrix",
  "ean_13",
  "ean_8",
  "itf",
  "pdf417",
  "qr_code",
  "upc_a",
  "upc_e",
];

export function AddCardPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({
    brand: "",
    type: "Physical" as CardType,
    initialBalance: "",
    cardNumber: "",
    pin: "",
    balanceUrl: "",
    image: null as File | null,
  });
  const [extracting, setExtracting] = useState(false);
  const [extractMessage, setExtractMessage] = useState("");

  async function decodeBarcodeFromImage(file: File): Promise<string> {
    const BarcodeDetector = (window as WindowWithBarcodeDetector).BarcodeDetector;
    if (!BarcodeDetector || typeof createImageBitmap === "undefined") return "";

    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file);
      const detector = new BarcodeDetector({ formats: barcodeFormats });
      const barcodes = await detector.detect(bitmap);
      return barcodes
        .map((barcode) => barcode.rawValue?.trim() ?? "")
        .find((value) => /\d{8,}/.test(value.replace(/\D/g, ""))) ?? "";
    } catch {
      return "";
    } finally {
      bitmap?.close();
    }
  }

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
      const barcodeValue = await decodeBarcodeFromImage(file);
      const barcodeParsed = barcodeValue
        ? parseGiftCardOcrText(`Card Number: ${barcodeValue}`)
        : { brand: "", cardNumber: "", pin: "", balance: null };
      let parsed = barcodeParsed;

      try {
        const ocrParsed = parseGiftCardOcrText(await extractTextFromImage(file));
        parsed = {
          brand: ocrParsed.brand || barcodeParsed.brand,
          cardNumber: ocrParsed.cardNumber || barcodeParsed.cardNumber,
          pin: ocrParsed.pin || barcodeParsed.pin,
          balance: ocrParsed.balance ?? barcodeParsed.balance,
        };
      } catch {
        if (!barcodeValue) throw new Error("Image text extraction failed");
      }

      setForm((f) => ({
        ...f,
        image: file,
        brand: parsed.brand || f.brand,
        cardNumber: parsed.cardNumber || f.cardNumber,
        pin: parsed.pin || f.pin,
        initialBalance: parsed.balance !== null ? parsed.balance.toFixed(2) : f.initialBalance,
      }));

      const fields = [
        parsed.brand ? "brand" : "",
        parsed.cardNumber ? "card number" : "",
        parsed.pin ? "PIN" : "",
        parsed.balance !== null ? "balance" : "",
      ].filter(Boolean);
      setExtractMessage(
        fields.length > 0
          ? `Detected ${fields.join(", ")} from image. Review before saving.`
          : "No card details were detected. You can still enter them manually.",
      );
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
                type: e.target.value as CardType,
              }))
            }
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="Physical">Physical</option>
            <option value="Digital">Digital</option>
          </select>
        </label>

        <div className="space-y-3 border-y border-slate-200 py-3 dark:border-slate-800">
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {form.type === "Physical" ? "Physical card photo" : "Digital barcode image"}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
              {form.type === "Physical"
                ? "Take a photo to fill card number, PIN, balance, and brand when visible."
                : "Upload the barcode image to fill the card number, plus any visible PIN or balance text."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Take photo
            </button>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              {form.type === "Digital" ? "Upload barcode" : "Choose image"}
            </button>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onClick={(e) => {
              e.currentTarget.value = "";
            }}
            onChange={async (e) => onImageSelected(e.target.files?.[0] ?? null)}
          />
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onClick={(e) => {
              e.currentTarget.value = "";
            }}
            onChange={async (e) => onImageSelected(e.target.files?.[0] ?? null)}
          />

          <div className="min-h-5 text-xs text-slate-500 dark:text-slate-400">
            {extracting ? (
              <span className="font-medium text-sky-700 dark:text-sky-300">
                Extracting card details...
              </span>
            ) : extractMessage ? (
              <span>{extractMessage}</span>
            ) : form.image ? (
              <span>Selected {form.image.name}</span>
            ) : null}
          </div>
        </div>

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
