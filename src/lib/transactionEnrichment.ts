import type { StatementTransaction } from "@/lib/types";

export function enrichTransaction(transaction: StatementTransaction) {
  const transactionDate = parseStatementDate(transaction.date);
  const narrationTokens = tokenize(transaction.narration);

  return {
    ...transaction,
    transactionDate,
    transactionDateIso: transactionDate?.toISOString() ?? null,
    year: transactionDate?.getUTCFullYear() ?? null,
    month: transactionDate ? transactionDate.getUTCMonth() + 1 : null,
    day: transactionDate?.getUTCDate() ?? null,
    yearMonth: transactionDate
      ? `${transactionDate.getUTCFullYear()}-${String(
          transactionDate.getUTCMonth() + 1,
        ).padStart(2, "0")}`
      : null,
    amountBucket: getAmountBucket(transaction.amount),
    searchTokens: Array.from(new Set(narrationTokens)).slice(0, 80),
    merchantHint: inferMerchantHint(transaction.narration),
  };
}

export function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function parseStatementDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);

  return new Date(Date.UTC(fullYear, Number(month) - 1, Number(day)));
}

function getAmountBucket(amount: number) {
  if (amount >= 50_000) {
    return "very_large";
  }

  if (amount >= 10_000) {
    return "large";
  }

  if (amount >= 1_000) {
    return "medium";
  }

  return "small";
}

function inferMerchantHint(narration: string) {
  const [, merchant] = narration.match(/^(?:UPI|ACH D)-([^-]+)/i) ?? [];

  return merchant?.trim() || null;
}
