export type MoneyDirection = "withdrawal" | "deposit";

export type StatementTransaction = {
  id: string;
  transactionFingerprint?: string;
  statementFileHashes?: string[];
  date: string;
  valueDate: string;
  transactionDateIso?: string;
  year?: number;
  month?: number;
  day?: number;
  yearMonth?: string;
  narration: string;
  referenceNumber: string;
  withdrawalAmount: number | null;
  depositAmount: number | null;
  closingBalance: number;
  direction: MoneyDirection;
  amount: number;
  amountBucket?: "small" | "medium" | "large" | "very_large";
  categoryHint: string;
  searchTokens?: string[];
  merchantHint?: string | null;
  isCategoryManual?: boolean;
};

export type ParsedStatement = {
  bankName: string;
  accountNumberMasked: string;
  accountType: string | null;
  currency: string;
  statementFrom: string | null;
  statementTo: string | null;
  generatedAt: string;
  transactionCount: number;
  openingBalance: number | null;
  closingBalance: number | null;
  totalWithdrawals: number;
  totalDeposits: number;
  transactions: StatementTransaction[];
};

export type ProcessedStatementRecord = {
  fileHash: string;
  fileName: string;
  bankName: string;
  accountNumberMasked: string;
  statementFrom: string | null;
  statementTo: string | null;
  transactionCount: number;
  processedAt: string;
};

export type CategoryRuleDirection = "any" | MoneyDirection;

export type CategoryRule = {
  id: string;
  category: string;
  keywords: string[];
  direction: CategoryRuleDirection;
  priority: number;
  enabled: boolean;
  color?: string;
};
