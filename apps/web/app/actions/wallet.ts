"use server";

import {
  computeCurrentBalance,
  computeWalletStats,
  type CardRow,
  type TransactionRow,
} from "@gift-card-wallet/domain";
import { and, asc, eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { giftCard, giftCardTransaction } from "@/db/schema";
import { newCardId, newId } from "@/lib/id";
import { userUploadDir } from "@/lib/paths";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";

export type WalletCard = {
  id: string;
  brand: string;
  type: string;
  initial: number;
  current: number;
  imageUrl: string;
  cardNumber: string;
  pin: string;
  balanceUrl: string;
  archived: boolean;
};

export type WalletTx = {
  id: string;
  date: string;
  amount: number;
  balance: number;
  note: string;
};

export async function getWalletPayload() {
  const session = await requireSession();
  const uid = session.user.id;

  const cards = await db
    .select()
    .from(giftCard)
    .where(eq(giftCard.userId, uid));

  const txs = await db
    .select()
    .from(giftCardTransaction)
    .where(eq(giftCardTransaction.userId, uid));

  const cardRows: CardRow[] = cards.map((c) => ({
    id: c.id,
    brand: c.brand,
    type: c.type,
    initialBalance: c.initialBalance,
    archived: c.archived,
  }));

  const transRows: TransactionRow[] = txs.map((t) => ({
    cardId: t.cardId,
    date: new Date(t.date),
    amount: t.amount,
  }));

  const stats = computeWalletStats(cardRows, transRows);

  const byCard = new Map<string, typeof txs>();
  for (const t of txs) {
    const list = byCard.get(t.cardId) ?? [];
    list.push(t);
    byCard.set(t.cardId, list);
  }

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const out: WalletCard[] = cards.map((c) => {
    const list = byCard.get(c.id) ?? [];
    const current = computeCurrentBalance(
      c.initialBalance,
      list.map((x) => ({ amount: x.amount })),
    );
    const imageUrl = c.imagePath
      ? `${basePath}/api/uploads/${c.imagePath.split("/").map(encodeURIComponent).join("/")}`
      : "";
    return {
      id: c.id,
      brand: c.brand,
      type: c.type,
      initial: c.initialBalance,
      current,
      imageUrl,
      cardNumber: c.cardNumber,
      pin: c.pin,
      balanceUrl: c.balanceUrl,
      archived: c.archived,
    };
  });

  out.sort((a, b) => Number(a.archived) - Number(b.archived));

  return { cards: out, stats };
}

export async function saveCard(input: {
  brand: string;
  type: string;
  initialBalance: number;
  cardNumber: string;
  pin: string;
  balanceUrl: string;
  imageFile?: File | null;
}) {
  const session = await requireSession();
  const uid = session.user.id;
  const id = newCardId();
  const now = new Date();

  let imagePath = "";
  if (input.type === "Digital" && input.imageFile && input.imageFile.size > 0) {
    const dir = userUploadDir(uid);
    const safe = input.imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const rel = `${uid}/${id}_${safe}`;
    const full = path.join(dir, `${id}_${safe}`);
    const buf = Buffer.from(await input.imageFile.arrayBuffer());
    fs.writeFileSync(full, buf);
    imagePath = rel;
  }

  await db.insert(giftCard).values({
    id,
    userId: uid,
    brand: input.brand,
    type: input.type,
    dateAdded: now,
    initialBalance: input.initialBalance,
    imagePath,
    cardNumber: input.cardNumber,
    pin: input.pin,
    balanceUrl: input.balanceUrl,
    archived: false,
    createdAt: now,
    updatedAt: now,
  });

  revalidatePath("/");
  return getWalletPayload();
}

export async function saveCardFromForm(formData: FormData) {
  const image = formData.get("image");
  return saveCard({
    brand: String(formData.get("brand") ?? ""),
    type: String(formData.get("type") ?? "Physical"),
    initialBalance: parseFloat(String(formData.get("initialBalance") ?? "0")) || 0,
    cardNumber: String(formData.get("cardNumber") ?? ""),
    pin: String(formData.get("pin") ?? ""),
    balanceUrl: String(formData.get("balanceUrl") ?? ""),
    imageFile:
      image instanceof File && image.size > 0 ? image : null,
  });
}

export async function updateCardDetails(input: {
  cardId: string;
  brand: string;
  initialBalance: number;
  cardNumber: string;
  pin: string;
  balanceUrl: string;
}) {
  const session = await requireSession();
  const uid = session.user.id;
  const now = new Date();

  await db
    .update(giftCard)
    .set({
      brand: input.brand,
      initialBalance: input.initialBalance,
      cardNumber: input.cardNumber,
      pin: input.pin,
      balanceUrl: input.balanceUrl,
      updatedAt: now,
    })
    .where(and(eq(giftCard.id, input.cardId), eq(giftCard.userId, uid)));

  revalidatePath("/");
  return getWalletPayload();
}

export async function addTransaction(cardId: string, amount: number, note: string) {
  const session = await requireSession();
  const uid = session.user.id;
  const now = new Date();

  await db.insert(giftCardTransaction).values({
    id: newId(),
    userId: uid,
    cardId,
    date: now,
    amount,
    note: note ?? "",
    createdAt: now,
    updatedAt: now,
  });

  revalidatePath("/");
  return getWalletPayload();
}

export async function getTransactions(cardId: string): Promise<WalletTx[]> {
  const session = await requireSession();
  const uid = session.user.id;

  const card = await db
    .select()
    .from(giftCard)
    .where(and(eq(giftCard.id, cardId), eq(giftCard.userId, uid)))
    .limit(1);
  if (card.length === 0) return [];

  const initial = card[0].initialBalance;

  const rows = await db
    .select()
    .from(giftCardTransaction)
    .where(
      and(
        eq(giftCardTransaction.cardId, cardId),
        eq(giftCardTransaction.userId, uid),
      ),
    )
    .orderBy(asc(giftCardTransaction.date));

  let running = initial;
  const withBalance: WalletTx[] = [];
  for (const t of rows) {
    running -= t.amount;
    withBalance.push({
      id: t.id,
      date: new Date(t.date).toLocaleDateString(),
      amount: t.amount,
      balance: running,
      note: t.note,
    });
  }

  return withBalance.reverse();
}

export async function editTransaction(
  txId: string,
  cardId: string,
  newAmount: number,
  newNote: string,
) {
  const session = await requireSession();
  const uid = session.user.id;
  const now = new Date();

  await db
    .update(giftCardTransaction)
    .set({
      amount: newAmount,
      note: newNote ?? "",
      updatedAt: now,
    })
    .where(
      and(
        eq(giftCardTransaction.id, txId),
        eq(giftCardTransaction.cardId, cardId),
        eq(giftCardTransaction.userId, uid),
      ),
    );

  revalidatePath("/");
  return getWalletPayload();
}

export async function deleteTransaction(txId: string, cardId: string) {
  const session = await requireSession();
  const uid = session.user.id;

  await db
    .delete(giftCardTransaction)
    .where(
      and(
        eq(giftCardTransaction.id, txId),
        eq(giftCardTransaction.cardId, cardId),
        eq(giftCardTransaction.userId, uid),
      ),
    );

  revalidatePath("/");
  return getWalletPayload();
}

export async function toggleArchive(cardId: string, archived: boolean) {
  const session = await requireSession();
  const uid = session.user.id;
  const now = new Date();

  await db
    .update(giftCard)
    .set({ archived, updatedAt: now })
    .where(and(eq(giftCard.id, cardId), eq(giftCard.userId, uid)));

  revalidatePath("/");
  return getWalletPayload();
}
