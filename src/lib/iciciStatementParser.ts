import type { ParsedStatement, StatementTransaction } from "@/lib/types";

/**
 * Checks if a byte buffer starts with the standard ZIP signature (PK\x03\x04).
 * Since modern .xlsx files (even when named .xls) are ZIP archives, this reliably identifies them.
 */
export function isZipBuffer(buffer: ArrayBuffer | Uint8Array): boolean {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 4) return false;
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Zero-dependency ZIP extractor using the web-standard DecompressionStream('deflate-raw').
 * Supported in modern Node.js and all modern evergreen browsers.
 */
export async function extractZipEntries(
  buffer: ArrayBuffer | Uint8Array,
): Promise<Record<string, string>> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: Record<string, string> = {};
  let offset = 0;

  while (offset < bytes.length - 4) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x04034b50) {
      // Local file header
      const compression = view.getUint16(offset + 8, true);
      const compressedSize = view.getUint32(offset + 18, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);

      const nameBytes = bytes.subarray(offset + 30, offset + 30 + nameLen);
      const name = new TextDecoder().decode(nameBytes);

      const dataStart = offset + 30 + nameLen + extraLen;
      const compData = bytes.subarray(dataStart, dataStart + compressedSize);

      if (compression === 0) {
        entries[name] = new TextDecoder().decode(compData);
      } else if (compression === 8) {
        try {
          const compBuf = bytes.buffer.slice(
            bytes.byteOffset + dataStart,
            bytes.byteOffset + dataStart + compressedSize,
          ) as ArrayBuffer;
          const chunk = new Uint8Array(compBuf);
          const ds = new DecompressionStream("deflate-raw");
          const writer = ds.writable.getWriter();
          void writer.write(chunk);
          void writer.close();
          const response = new Response(ds.readable);
          const uncompBuf = await response.arrayBuffer();
          entries[name] = new TextDecoder().decode(uncompBuf);
        } catch {
          // If a file in zip fails decompression, skip it
        }
      }
      offset = dataStart + compressedSize;
    } else {
      offset++;
    }
  }

  return entries;
}

/**
 * Parses XLSX XML entries into an array of cell-string rows.
 */
export function parseXlsxRows(entries: Record<string, string>): string[][] {
  const sharedStrings: string[] = [];
  const ssXml = entries["xl/sharedStrings.xml"];
  if (ssXml) {
    const siMatches = ssXml.match(/<si>[\s\S]*?<\/si>/g) || [];
    for (const si of siMatches) {
      const tMatches = Array.from(si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((m) => m[1]);
      sharedStrings.push(tMatches.join(""));
    }
  }

  const sheetXml = entries["xl/worksheets/sheet1.xml"];
  if (!sheetXml) return [];

  const rows: string[][] = [];
  const rowMatches = sheetXml.match(/<row[\s\S]*?<\/row>/g) || [];
  for (const rowXml of rowMatches) {
    const cells: string[] = [];
    const cellMatches = rowXml.match(/<c[\s\S]*?<\/c>/g) || [];
    for (const cellXml of cellMatches) {
      const isString = /t="s"/.test(cellXml);
      const valMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
      let val = valMatch ? valMatch[1] : "";
      if (isString && val !== "") {
        const idx = parseInt(val, 10);
        val = sharedStrings[idx] ?? val;
      }
      cells.push(val.trim());
    }
    if (cells.some((c) => c !== "")) {
      rows.push(cells.filter(Boolean));
    }
  }

  return rows;
}

/**
 * Formats date into DD/MM/YYYY.
 */
function normalizeDate(rawDate: string): string {
  const clean = rawDate.trim().replace(/-/g, "/");
  const parts = clean.split("/");
  if (parts.length === 3) {
    const p0 = parts[0].padStart(2, "0");
    const p1 = parts[1].padStart(2, "0");
    const p2 = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return `${p0}/${p1}/${p2}`;
  }
  return clean;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Checks whether rows or text content represent an ICICI Credit Card Statement.
 */
export function isIciciCreditCardStatement(content: string | string[][]): boolean {
  if (Array.isArray(content)) {
    const allText = content.map((r) => r.join(" ")).join("\n");
    return (
      /VIEW\s+(?:CURRENT|LAST)\s+STATEMENT/i.test(allText) ||
      (/Credit\s+Card\s+Details/i.test(allText) && /Transaction\s+Details/i.test(allText)) ||
      (/Transaction\s+Date/i.test(allText) && /Reward\s+Points/i.test(allText))
    );
  }

  return (
    /VIEW\s+(?:CURRENT|LAST)\s+STATEMENT/i.test(content) ||
    (/Credit\s+Card\s+Details/i.test(content) && /Transaction\s+Details/i.test(content)) ||
    (/Transaction\s+Date/i.test(content) && /Reward\s+Points/i.test(content))
  );
}

/**
 * Parses rows extracted from an ICICI Credit Card Statement spreadsheet into a ParsedStatement.
 */
export function parseIciciStatementRows(
  rows: string[][],
  options: { fileName?: string; fallbackCardNumber?: string } = {},
): ParsedStatement {
  const bankName = "ICICI Bank";
  const accountType = "Credit Card";
  const currency = "INR";
  let accountNumberMasked = options.fallbackCardNumber || "";
  let statementFrom: string | null = null;
  let statementTo: string | null = null;
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;
  const transactions: StatementTransaction[] = [];

  let inTransactions = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowText = row.join(" | ");

    // 1. Masked Card number (e.g. Santhosh Thamaraiselvan-431581******5005 or 431581******5005)
    const cardMatch = rowText.match(/\b\d{4,}[*Xx]+\d{4}\b/);
    if (cardMatch && !accountNumberMasked) {
      accountNumberMasked = cardMatch[0];
    }

    // 2. Statement Period (e.g. 13-09-2026 TO 19-09-2026 or 14-08-2026 TO 13-09-2026)
    const periodIdx = row.findIndex((c) => /statement\s+period/i.test(c));
    if (periodIdx !== -1 && row[periodIdx + 1]) {
      const pText = row[periodIdx + 1];
      const pMatch = pText.match(
        /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*(?:TO|to|-)\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      );
      if (pMatch) {
        statementFrom = normalizeDate(pMatch[1]);
        statementTo = normalizeDate(pMatch[2]);
      }
    }

    // 3. Previous Balance (Opening Balance)
    const prevBalIdx = row.findIndex((c) => /previous\s+balance/i.test(c));
    if (prevBalIdx !== -1 && row[prevBalIdx + 1]) {
      const num = parseFloat(row[prevBalIdx + 1].replace(/[^0-9.]/g, ""));
      if (!isNaN(num)) openingBalance = roundMoney(num);
    }

    // 4. Total Amount Due (Closing Balance)
    const dueIdx = row.findIndex((c) => /total\s+amount\s+due/i.test(c));
    if (dueIdx !== -1 && row[dueIdx + 1]) {
      const num = parseFloat(row[dueIdx + 1].replace(/[^0-9.]/g, ""));
      if (!isNaN(num)) closingBalance = roundMoney(num);
    }

    // 5. Transaction Details section start
    if (/transaction\s+details/i.test(row[0])) {
      inTransactions = true;
      continue;
    }

    if (inTransactions) {
      // Header row check: ignore header
      if (
        row.some((c) => /transaction\s+date/i.test(c)) &&
        row.some((c) => /amount/i.test(c))
      ) {
        continue;
      }

      // Check if it looks like a transaction row: Date in first cell
      const dateMatch = row[0]?.match(/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/);
      if (dateMatch) {
        const dateFormatted = normalizeDate(row[0]);
        const narration = (row[1] || "").replace(/\s+/g, " ").trim();
        const amountRaw = row[2] || "";
        const isDebit = /Dr\.?/i.test(amountRaw);
        const isCredit = /Cr\.?/i.test(amountRaw);
        const numAmount = parseFloat(amountRaw.replace(/[^0-9.]/g, "")) || 0;
        const refNumber = (row[4] || row[3] || "").trim();

        transactions.push({
          id: `tx-${transactions.length}`,
          date: dateFormatted,
          valueDate: dateFormatted,
          narration,
          referenceNumber: refNumber,
          withdrawalAmount: isDebit ? numAmount : null,
          depositAmount: isCredit ? numAmount : null,
          closingBalance: 0,
          direction: isDebit ? "withdrawal" : "deposit",
          amount: numAmount,
          categoryHint: "Uncategorized",
        });
      }
    }
  }

  // Fallback card number if not found explicitly
  if (!accountNumberMasked) {
    accountNumberMasked = "ICICI Credit Card";
  }

  const totalWithdrawals = roundMoney(
    transactions.reduce((sum, t) => sum + (t.withdrawalAmount ?? 0), 0),
  );
  const totalDeposits = roundMoney(
    transactions.reduce((sum, t) => sum + (t.depositAmount ?? 0), 0),
  );

  return {
    bankName,
    accountNumberMasked,
    accountType,
    currency,
    statementFrom,
    statementTo,
    generatedAt: new Date().toISOString(),
    transactionCount: transactions.length,
    openingBalance,
    closingBalance,
    totalWithdrawals,
    totalDeposits,
    transactions,
  };
}

/**
 * Converts spreadsheet rows into clean readable plain text format.
 * This is saved into Firestore alongside the statement record for easy auditing and review.
 */
export function rowsToStatementText(rows: string[][]): string {
  return rows.map((r) => r.join(" | ")).join("\n");
}

/**
 * Parses plain text / pipe-delimited ICICI statement representation.
 */
export function parseIciciStatementText(
  text: string,
  options: { fileName?: string } = {},
): ParsedStatement {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = lines.map((line) => {
    if (line.includes("|")) {
      return line.split("|").map((c) => c.trim()).filter(Boolean);
    }
    if (line.includes("\t")) {
      return line.split("\t").map((c) => c.trim()).filter(Boolean);
    }
    return [line];
  });

  return parseIciciStatementRows(rows, options);
}

/**
 * Parses a binary ICICI Credit Card Statement (.xls / .xlsx / ArrayBuffer)
 * and returns both the structured ParsedStatement and plain statementText representation.
 */
export async function parseIciciCreditCardFile(
  buffer: ArrayBuffer | Uint8Array,
  fileName = "",
): Promise<{ statement: ParsedStatement; statementText: string }> {
  const entries = await extractZipEntries(buffer);
  const rows = parseXlsxRows(entries);

  if (!rows.length) {
    throw new Error(
      "Could not read spreadsheet data from file. Please ensure it is an ICICI Credit Card Statement.",
    );
  }

  const statement = parseIciciStatementRows(rows, { fileName });
  const statementText = rowsToStatementText(rows);

  return {
    statement,
    statementText,
  };
}
