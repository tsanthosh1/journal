import { createHash } from "node:crypto";

import type { DocumentReference } from "firebase-admin/firestore";

import type { StatementTransaction } from "@/lib/types";
import { enrichTransaction } from "@/lib/transactionEnrichment";

export async function loadStatementTransactions(
  userRef: DocumentReference,
  fileHash: string,
  statementRange?: {
    statementFrom: string | null;
    statementTo: string | null;
  },
) {
  const transactionsSnapshot = await userRef
    .collection("financialTransactions")
    .where("statementFileHashes", "array-contains", fileHash)
    .get();
  let transactions = transactionsSnapshot.docs.map((doc) =>
    toStatementTransaction({ ...doc.data(), transactionFingerprint: doc.id }),
  );

  if (!transactions.length) {
    const legacySnapshot = await userRef
      .collection("financialTransactions")
      .where("statementFileHash", "==", fileHash)
      .get();
    transactions = legacySnapshot.docs.map((doc) =>
      toStatementTransaction({ ...doc.data(), transactionFingerprint: doc.id }),
    );
  }

  if (transactions.length) {
    return sortTransactions(transactions);
  }

  const legacyTransactions: StatementTransaction[] = [];
  const legacyPathParts = getLegacyPathParts(statementRange);

  for (const { day, month } of legacyPathParts) {
    const legacySnapshot = await userRef
      .collection("financialTransactions")
      .doc(`${fileHash}_${day}`)
      .collection(month)
      .where("statementFileHash", "==", fileHash)
      .get();

    legacyTransactions.push(
      ...legacySnapshot.docs.map((doc) =>
        toStatementTransaction({ ...doc.data(), transactionFingerprint: doc.id }),
      ),
    );
  }

  return sortTransactions(legacyTransactions);
}

export function toStatementTransaction(data: FirebaseFirestore.DocumentData) {
  const baseTransaction = {
    id: String(data.id ?? ""),
    transactionFingerprint:
      typeof data.transactionFingerprint === "string"
        ? data.transactionFingerprint
        : undefined,
    statementFileHashes: Array.isArray(data.statementFileHashes)
      ? data.statementFileHashes.map(String)
      : typeof data.statementFileHash === "string"
        ? [data.statementFileHash]
        : undefined,
    date: String(data.date ?? ""),
    valueDate: String(data.valueDate ?? ""),
    narration: String(data.narration ?? ""),
    referenceNumber: String(data.referenceNumber ?? ""),
    withdrawalAmount:
      typeof data.withdrawalAmount === "number" ? data.withdrawalAmount : null,
    depositAmount: typeof data.depositAmount === "number" ? data.depositAmount : null,
    closingBalance:
      typeof data.closingBalance === "number" ? data.closingBalance : 0,
    direction: data.direction === "deposit" ? "deposit" : "withdrawal",
    amount: typeof data.amount === "number" ? data.amount : 0,
    categoryHint: String(data.categoryHint ?? "Uncategorized"),
  } satisfies StatementTransaction;
  const enrichedFallback = enrichTransaction(baseTransaction);

  return {
    ...baseTransaction,
    isCategoryManual:
      typeof data.isCategoryManual === "boolean"
        ? data.isCategoryManual
        : undefined,
    transactionDateIso:
      toIsoString(data.transactionDate) ??
      (typeof data.transactionDateIso === "string"
        ? data.transactionDateIso
        : enrichedFallback.transactionDateIso ?? undefined),
    year: typeof data.year === "number" ? data.year : enrichedFallback.year ?? undefined,
    month:
      typeof data.month === "number" ? data.month : enrichedFallback.month ?? undefined,
    day: typeof data.day === "number" ? data.day : enrichedFallback.day ?? undefined,
    yearMonth:
      typeof data.yearMonth === "string"
        ? data.yearMonth
        : enrichedFallback.yearMonth ?? undefined,
    amountBucket:
      data.amountBucket === "medium" ||
      data.amountBucket === "large" ||
      data.amountBucket === "very_large" ||
      data.amountBucket === "small"
        ? data.amountBucket
        : enrichedFallback.amountBucket,
    searchTokens: Array.isArray(data.searchTokens)
      ? data.searchTokens.map(String)
      : enrichedFallback.searchTokens,
    merchantHint:
      typeof data.merchantHint === "string"
        ? data.merchantHint
        : enrichedFallback.merchantHint,
  } satisfies StatementTransaction;
}

export function getTransactionIndex(id: string) {
  const index = Number(id.match(/-(\d+)$/)?.[1]);

  return Number.isFinite(index) ? index : 0;
}

export function getTransactionFingerprint(
  accountNumberMasked: string,
  transaction: StatementTransaction,
) {
  const fingerprintParts = [
    accountNumberMasked,
    transaction.date,
    transaction.valueDate,
    transaction.referenceNumber,
    transaction.direction,
    transaction.amount.toFixed(2),
    transaction.closingBalance.toFixed(2),
    normalizeNarration(transaction.narration),
  ];

  return createHash("sha256").update(fingerprintParts.join("|")).digest("hex");
}

function sortTransactions(transactions: StatementTransaction[]) {
  return transactions.sort(
    (left, right) => getTransactionIndex(left.id) - getTransactionIndex(right.id),
  );
}

function normalizeNarration(narration: string) {
  return narration.toLowerCase().replace(/\s+/g, " ").trim();
}

function toIsoString(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  return null;
}

function getLegacyPathParts(
  statementRange:
    | {
        statementFrom: string | null;
        statementTo: string | null;
      }
    | undefined,
) {
  const months = getStatementMonths(statementRange);
  const pathParts: Array<{ day: string; month: string }> = [];

  for (const month of months) {
    for (let day = 1; day <= 31; day += 1) {
      pathParts.push({
        day: String(day).padStart(2, "0"),
        month,
      });
    }
  }

  return pathParts;
}

function getStatementMonths(
  statementRange:
    | {
        statementFrom: string | null;
        statementTo: string | null;
      }
    | undefined,
) {
  const fromMonth = statementRange?.statementFrom?.match(/^\d{2}\/(\d{2})\//)?.[1];
  const toMonth = statementRange?.statementTo?.match(/^\d{2}\/(\d{2})\//)?.[1];

  if (!fromMonth && !toMonth) {
    return ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  }

  if (!fromMonth || !toMonth || fromMonth === toMonth) {
    return [fromMonth ?? toMonth ?? "01"];
  }

  const from = Number(fromMonth);
  const to = Number(toMonth);

  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return [fromMonth, toMonth];
  }

  const monthCount = from <= to ? to - from + 1 : 12 - from + to + 1;

  return Array.from({ length: monthCount }, (_, index) => {
    const month = ((from + index - 1) % 12) + 1;
    return String(month).padStart(2, "0");
  });
}
