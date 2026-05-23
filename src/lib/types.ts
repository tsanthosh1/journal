export type MoneyDirection = "withdrawal" | "deposit";

export type StatementTransaction = {
  id: string;
  date: string;
  valueDate: string;
  narration: string;
  referenceNumber: string;
  withdrawalAmount: number | null;
  depositAmount: number | null;
  closingBalance: number;
  direction: MoneyDirection;
  amount: number;
  categoryHint: string;
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
