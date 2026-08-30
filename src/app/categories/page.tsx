import { FinanceTopBar } from "@/components/FinanceTopBar";
import { StatementImporter } from "@/components/StatementImporter";

export default function CategoriesPage() {
  return (
    <>
      <FinanceTopBar title="Update categories" />
      <StatementImporter mode="categories" />
    </>
  );
}
