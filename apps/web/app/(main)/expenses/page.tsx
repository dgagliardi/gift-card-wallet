import { ExpensesPage } from "@/components/expenses-page";
import { getExpenseSummary } from "@/app/actions/wallet";

export default async function Page() {
  const summary = await getExpenseSummary();
  return <ExpensesPage summary={summary} />;
}
