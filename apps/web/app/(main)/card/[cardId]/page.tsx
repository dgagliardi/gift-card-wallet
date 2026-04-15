import { notFound } from "next/navigation";
import { CardDetailPage } from "@/components/card-detail-page";
import { getTransactions, getWalletPayload } from "@/app/actions/wallet";

export default async function CardPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  const { cards } = await getWalletPayload();
  const card = cards.find((c) => c.id === cardId);
  if (!card) notFound();
  const tx = await getTransactions(cardId);
  return <CardDetailPage initialCard={card} initialTx={tx} />;
}
