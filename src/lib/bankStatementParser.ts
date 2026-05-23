import type { ParsedStatement, StatementTransaction } from "@/lib/types";

const HDFC_TRANSACTION_START = /^\d{2}\/\d{2}\/\d{2}\s+/;

const HEADER_MARKERS = [
  "Statement of accounts",
  "Account Branch",
  "Address",
  "City",
  "State",
  "Phone no.",
  "Email",
  "OD Limit",
  "Cust ID",
  "JOINT HOLDERS",
  "A/C Open Date",
  "Nomination",
  "Account Status",
  "RTGS/NEFT IFSC",
  "Branch Code",
  "Account Type",
  "Date      Narration",
  "Withdrawal Amt.",
  "Deposit Amt.",
  "**Continue**",
  "Page No",
];

type WorkingTransaction = Omit<
  StatementTransaction,
  "id" | "direction" | "amount" | "categoryHint"
>;

export function parseBankStatement(text: string): ParsedStatement {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const metadata = parseMetadata(text);
  const transactions: StatementTransaction[] = [];
  let current: WorkingTransaction | null = null;
  let reachedStatementSummary = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");

    if (line.includes("STATEMENT SUMMARY")) {
      reachedStatementSummary = true;
      continue;
    }

    if (reachedStatementSummary) {
      continue;
    }

    if (HDFC_TRANSACTION_START.test(line)) {
      if (current) {
        transactions.push(finalizeTransaction(current, transactions.length));
      }

      current = parseTransactionLine(line);
      continue;
    }

    if (!current || shouldSkipContinuationLine(line)) {
      continue;
    }

    const continuation = line.trim();
    if (continuation) {
      current.narration = `${current.narration} ${continuation}`.replace(
        /\s+/g,
        " ",
      );
    }
  }

  if (current) {
    transactions.push(finalizeTransaction(current, transactions.length));
  }

  const totalWithdrawals = roundMoney(
    transactions.reduce(
      (sum, transaction) => sum + (transaction.withdrawalAmount ?? 0),
      0,
    ),
  );
  const totalDeposits = roundMoney(
    transactions.reduce(
      (sum, transaction) => sum + (transaction.depositAmount ?? 0),
      0,
    ),
  );

  return {
    ...metadata,
    generatedAt: new Date().toISOString(),
    transactionCount: transactions.length,
    openingBalance: inferOpeningBalance(transactions),
    closingBalance: transactions.at(-1)?.closingBalance ?? null,
    totalWithdrawals,
    totalDeposits,
    transactions,
  };
}

function parseMetadata(text: string) {
  const accountNumber = text.match(/Account No\s+:\s+([0-9]+)/)?.[1] ?? "";
  const statementRange = text.match(
    /Statement From\s+:\s+(\d{2}\/\d{2}\/\d{4})\s+To:\s+(\d{2}\/\d{2}\/\d{4})/,
  );

  return {
    bankName: text.includes("HDFC BANK") ? "HDFC Bank" : "Unknown bank",
    accountNumberMasked: maskAccountNumber(accountNumber),
    accountType: text.match(/Account Type\s+:\s+(.+)/)?.[1]?.trim() ?? null,
    currency: text.match(/Currency\s+:\s+([A-Z]+)/)?.[1] ?? "INR",
    statementFrom: statementRange?.[1] ?? null,
    statementTo: statementRange?.[2] ?? null,
  };
}

function parseTransactionLine(line: string): WorkingTransaction {
  const paddedLine = line.padEnd(140, " ");
  const date = paddedLine.slice(0, 8).trim();
  const narration = paddedLine.slice(10, 50).trim();
  const referenceNumber = paddedLine.slice(52, 68).trim();
  const valueDate = paddedLine.slice(70, 78).trim();
  const withdrawalAmount = parseAmount(paddedLine.slice(80, 98));
  const depositAmount = parseAmount(paddedLine.slice(100, 118));
  const closingBalance =
    parseAmount(paddedLine.slice(120)) ?? parseTrailingBalance(line);

  if (!date || !valueDate || Number.isNaN(closingBalance)) {
    throw new Error(`Could not parse transaction line: ${line}`);
  }

  return {
    date,
    valueDate,
    narration,
    referenceNumber,
    withdrawalAmount,
    depositAmount,
    closingBalance,
  };
}

function finalizeTransaction(
  transaction: WorkingTransaction,
  index: number,
): StatementTransaction {
  const withdrawalAmount = transaction.withdrawalAmount;
  const depositAmount = transaction.depositAmount;
  const direction = depositAmount ? "deposit" : "withdrawal";
  const amount = depositAmount ?? withdrawalAmount ?? 0;

  return {
    ...transaction,
    id: `${transaction.date}-${transaction.referenceNumber}-${index}`,
    direction,
    amount,
    categoryHint: inferCategory(transaction.narration, direction),
  };
}

function shouldSkipContinuationLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed || /^[\s*-]+$/.test(trimmed)) {
    return true;
  }

  return HEADER_MARKERS.some((marker) => line.includes(marker));
}

function parseAmount(value: string) {
  const normalized = value.trim().replace(/,/g, "");

  if (!normalized) {
    return null;
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function parseTrailingBalance(line: string) {
  const matches = line.match(/(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}/g);
  const lastMatch = matches?.at(-1);

  return lastMatch ? Number(lastMatch.replace(/,/g, "")) : Number.NaN;
}

function inferOpeningBalance(transactions: StatementTransaction[]) {
  const first = transactions[0];

  if (!first) {
    return null;
  }

  const signedAmount =
    first.direction === "deposit" ? first.amount : -first.amount;

  return roundMoney(first.closingBalance - signedAmount);
}

function inferCategory(narration: string, direction: "withdrawal" | "deposit") {
  const upperNarration = narration.toUpperCase();

  if (direction === "deposit") {
    return "Income / Credit";
  }

  if (upperNarration.includes("CREDIT CA") || upperNarration.includes("CC ")) {
    return "Credit card payment";
  }

  if (upperNarration.includes("TNEB") || upperNarration.includes("ELECTRIC")) {
    return "Utilities";
  }

  if (upperNarration.includes("GROWW") || upperNarration.includes("INVEST")) {
    return "Investment";
  }

  if (
    upperNarration.includes("BLINKIT") ||
    upperNarration.includes("ZEPTO") ||
    upperNarration.includes("FRUIT") ||
    upperNarration.includes("PROTEINS")
  ) {
    return "Food / Groceries";
  }

  if (upperNarration.includes("UPI")) {
    return "UPI spend";
  }

  return "Uncategorized";
}

function maskAccountNumber(accountNumber: string) {
  if (!accountNumber) {
    return "Unknown account";
  }

  return `XXXX${accountNumber.slice(-4)}`;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
