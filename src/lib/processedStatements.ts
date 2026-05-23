import type { ParsedStatement, ProcessedStatementRecord } from "@/lib/types";

const STORAGE_KEY = "track-everything-ai.processed-statements.v1";

export async function hashFile(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = Array.from(new Uint8Array(digest));

  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getProcessedStatements(): ProcessedStatementRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawRecords = window.localStorage.getItem(STORAGE_KEY);

  if (!rawRecords) {
    return [];
  }

  try {
    return JSON.parse(rawRecords) as ProcessedStatementRecord[];
  } catch {
    return [];
  }
}

export function findProcessedStatement(fileHash: string) {
  return getProcessedStatements().find(
    (statement) => statement.fileHash === fileHash,
  );
}

export function saveProcessedStatement(
  file: File,
  fileHash: string,
  statement: ParsedStatement,
) {
  const records = getProcessedStatements();
  const nextRecord: ProcessedStatementRecord = {
    fileHash,
    fileName: file.name,
    bankName: statement.bankName,
    accountNumberMasked: statement.accountNumberMasked,
    statementFrom: statement.statementFrom,
    statementTo: statement.statementTo,
    transactionCount: statement.transactionCount,
    processedAt: new Date().toISOString(),
  };

  const nextRecords = [
    nextRecord,
    ...records.filter((record) => record.fileHash !== fileHash),
  ].slice(0, 50);

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords));

  return nextRecord;
}
