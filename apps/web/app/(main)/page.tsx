import { WalletHomePage } from "@/components/wallet-home-page";
import { getWalletPayload } from "@/app/actions/wallet";

export default async function HomePage() {
  const { cards, stats } = await getWalletPayload();
  return <WalletHomePage initialCards={cards} initialStats={stats} />;
}
