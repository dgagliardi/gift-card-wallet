import { WalletHome } from "@/components/wallet-home";
import { getWalletPayload } from "@/app/actions/wallet";

export default async function HomePage() {
  const { cards, stats } = await getWalletPayload();
  return <WalletHome initialCards={cards} initialStats={stats} />;
}
