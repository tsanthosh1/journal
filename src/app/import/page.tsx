import { FinanceTopBar } from "@/components/FinanceTopBar";
import { StatementImporter } from "@/components/StatementImporter";

export default function ImportPage() {
  return (
    <>
      <FinanceTopBar title="Import statements" />
      <StatementImporter mode="import" />
    </>
  );
}
