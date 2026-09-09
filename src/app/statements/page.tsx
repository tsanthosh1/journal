import { FinanceTopBar } from "@/components/FinanceTopBar";
import { StatementImporter } from "@/components/StatementImporter";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function StatementsPage() {
  return (
    <AuthGuard
      title="Statement Viewer"
      badge="Private & Encrypted"
      description="View and search parsed bank transactions. Sign in to view your accounts."
    >
      <FinanceTopBar title="View statements" />
      <StatementImporter mode="statements" />
    </AuthGuard>
  );
}
