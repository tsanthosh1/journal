import type { ParsedStatement, StatementTransaction } from "@/lib/types";

const HDFC_TRANSACTION_START = /^\d{2}\/\d{2}\/\d{2}\s+/;
const HDFC_DELIMITED_HEADER =
  /Date\s*,\s*Narration\s*,\s*Value Dat\s*,\s*Debit Amount\s*,\s*Credit Amount\s*,\s*Chq\/Ref Number\s*,\s*Closing Balance/i;

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

type ParseBankStatementOptions = {
  fileName?: string;
};

export function parseBankStatement(
  text: string,
  options: ParseBankStatementOptions = {},
): ParsedStatement {
  if (HDFC_DELIMITED_HEADER.test(text)) {
    return parseDelimitedBankStatement(text, options);
  }

  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const metadata = parseMetadata(text, options);
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

function parseDelimitedBankStatement(
  text: string,
  options: ParseBankStatementOptions,
): ParsedStatement {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const transactions: StatementTransaction[] = [];
  let reachedHeader = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!reachedHeader) {
      reachedHeader = HDFC_DELIMITED_HEADER.test(line);
      continue;
    }

    if (!line.trim()) {
      continue;
    }

    if (!HDFC_TRANSACTION_START.test(line.trimStart())) {
      continue;
    }

    transactions.push(
      finalizeTransaction(
        parseDelimitedTransactionLine(line),
        transactions.length,
      ),
    );
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
    ...parseMetadata(text, options),
    statementFrom: formatRangeDate(transactions[0]?.date) ?? null,
    statementTo: formatRangeDate(transactions.at(-1)?.date) ?? null,
    generatedAt: new Date().toISOString(),
    transactionCount: transactions.length,
    openingBalance: inferOpeningBalance(transactions),
    closingBalance: transactions.at(-1)?.closingBalance ?? null,
    totalWithdrawals,
    totalDeposits,
    transactions,
  };
}

function parseMetadata(text: string, options: ParseBankStatementOptions = {}) {
  const accountNumber = text.match(/Account No\s+:\s+([0-9]+)/)?.[1] ?? "";
  const statementRange = text.match(
    /Statement From\s+:\s+(\d{2}\/\d{2}\/\d{4})\s+To:\s+(\d{2}\/\d{2}\/\d{4})/,
  );
  const accountNumberMasked =
    maskAccountNumber(accountNumber) ?? maskAccountNumberFromFileName(options.fileName);

  return {
    bankName:
      text.includes("HDFC BANK") || HDFC_DELIMITED_HEADER.test(text)
        ? "HDFC Bank"
        : "Unknown bank",
    accountNumberMasked,
    accountType: text.match(/Account Type\s+:\s+(.+)/)?.[1]?.trim() ?? null,
    currency: text.match(/Currency\s+:\s+([A-Z]+)/)?.[1] ?? "INR",
    statementFrom: statementRange?.[1] ?? null,
    statementTo: statementRange?.[2] ?? null,
  };
}

function parseDelimitedTransactionLine(line: string): WorkingTransaction {
  const columns = line.split(",").map((column) => column.trim());

  if (columns.length < 7) {
    throw new Error(`Could not parse delimited transaction line: ${line}`);
  }

  const date = columns[0] ?? "";
  const closingBalance = parseAmount(columns.at(-1) ?? "") ?? Number.NaN;
  const referenceNumber = columns.at(-2) ?? "";
  const depositAmount = zeroToNull(parseAmount(columns.at(-3) ?? ""));
  const withdrawalAmount = zeroToNull(parseAmount(columns.at(-4) ?? ""));
  const valueDate = columns.at(-5) ?? "";
  const narration = columns.slice(1, -5).join(", ").replace(/\s+/g, " ");

  if (!date || !valueDate || Number.isNaN(closingBalance)) {
    throw new Error(`Could not parse delimited transaction line: ${line}`);
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
    categoryHint: "Uncategorized",
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

function zeroToNull(value: number | null) {
  return value === 0 ? null : value;
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

function maskAccountNumber(accountNumber: string) {
  if (!accountNumber) {
    return null;
  }

  return `XXXX${accountNumber.slice(-4)}`;
}

function maskAccountNumberFromFileName(fileName?: string) {
  const match = fileName?.match(/X{2,}\d{4}/i);

  return match ? `XXXX${match[0].slice(-4)}` : "Unknown account";
}

function formatRangeDate(date?: string) {
  const match = date?.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;

  return `${day}/${month}/20${year}`;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
