import { FinanceTopBar } from "@/components/FinanceTopBar";
import { StatementImporter } from "@/components/StatementImporter";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function ImportPage() {
  return (
    <AuthGuard
      title="Statement Importer"
      badge="Private & Encrypted"
      description="Import HDFC and bank statements securely into your account. Sign in to continue."
    >
      <FinanceTopBar title="Import statements" />
      <StatementImporter mode="import" />
    </AuthGuard>
  );
}
