import { FinanceTopBar } from "@/components/FinanceTopBar";
import { StatementImporter } from "@/components/StatementImporter";

export default function StatementsPage() {
  return (
    <>
      <FinanceTopBar title="View statements" />
      <StatementImporter mode="statements" />
    </>
  );
}
