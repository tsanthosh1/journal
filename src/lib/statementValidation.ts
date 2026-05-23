import type { ParsedStatement, StatementTransaction } from "@/lib/types";

type ValidationResult =
  | { ok: true; statement: ParsedStatement }
  | { ok: false; error: string };

export function validateImportPayload(payload: unknown): ValidationResult {
  if (!isRecord(payload)) {
    return { ok: false, error: "Request body must be an object." };
  }

  const fileHash = payload.fileHash;
  const fileName = payload.fileName;
  const statement = payload.statement;

  if (!isSha256(fileHash)) {
    return { ok: false, error: "Invalid file hash." };
  }

  if (typeof fileName !== "string" || !fileName.trim()) {
    return { ok: false, error: "File name is required." };
  }

  if (!isParsedStatement(statement)) {
    return { ok: false, error: "Invalid parsed statement payload." };
  }

  return { ok: true, statement };
}

export function getImportMetadata(payload: unknown) {
  if (!isRecord(payload)) {
    throw new Error("Invalid payload.");
  }

  return {
    fileHash: String(payload.fileHash),
    fileName: String(payload.fileName),
  };
}

function isParsedStatement(value: unknown): value is ParsedStatement {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.bankName === "string" &&
    typeof value.accountNumberMasked === "string" &&
    (typeof value.accountType === "string" || value.accountType === null) &&
    typeof value.currency === "string" &&
    (typeof value.statementFrom === "string" || value.statementFrom === null) &&
    (typeof value.statementTo === "string" || value.statementTo === null) &&
    typeof value.generatedAt === "string" &&
    isNumber(value.transactionCount) &&
    (isNumber(value.openingBalance) || value.openingBalance === null) &&
    (isNumber(value.closingBalance) || value.closingBalance === null) &&
    isNumber(value.totalWithdrawals) &&
    isNumber(value.totalDeposits) &&
    Array.isArray(value.transactions) &&
    value.transactions.length === value.transactionCount &&
    value.transactions.length <= 450 &&
    value.transactions.every(isStatementTransaction)
  );
}

function isStatementTransaction(
  value: unknown,
): value is StatementTransaction {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.date === "string" &&
    typeof value.valueDate === "string" &&
    typeof value.narration === "string" &&
    typeof value.referenceNumber === "string" &&
    (isNumber(value.withdrawalAmount) || value.withdrawalAmount === null) &&
    (isNumber(value.depositAmount) || value.depositAmount === null) &&
    isNumber(value.closingBalance) &&
    (value.direction === "withdrawal" || value.direction === "deposit") &&
    isNumber(value.amount) &&
    typeof value.categoryHint === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSha256(value: unknown) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
