import { FinanceTopBar } from "@/components/FinanceTopBar";
import { StatementImporter } from "@/components/StatementImporter";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function CategoriesPage() {
  return (
    <AuthGuard
      title="Category Rules"
      badge="Private & Encrypted"
      description="Category rules determine transaction classification. Sign in to view and configure your rules."
    >
      <FinanceTopBar title="Update categories" />
      <StatementImporter mode="categories" />
    </AuthGuard>
  );
}
