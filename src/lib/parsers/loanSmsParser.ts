/**
 * Specialized parser for Indian Bank Loan, Home Loan, and EMI Recovery SMS alerts.
 * Supports HDFC, ICICI, SBI, Canara, Axis, Kotak, Bank of Baroda, PNB, Bajaj, Tata Capital, etc.
 */

export interface ParsedLoanSms {
  isMatch: boolean;
  amount: number | null;
  date: string | null; // ISO YYYY-MM-DD
  cycleMonth: string | null; // YYYY-MM
  loanAccount: string | null;
  debitAccount: string | null;
  referenceId: string | null;
  bankName: string | null;
  isDebit: boolean;
  rawText: string;
}

const BANK_SENDER_MAP: Record<string, string> = {
  HDFC: "HDFC Bank",
  SBI: "State Bank of India",
  ICICI: "ICICI Bank",
  AXIS: "Axis Bank",
  KOTAK: "Kotak Mahindra Bank",
  CANBNK: "Canara Bank",
  CANARA: "Canara Bank",
  BARODA: "Bank of Baroda",
  BOB: "Bank of Baroda",
  PNB: "Punjab National Bank",
  BAJAJ: "Bajaj Finserv",
  TATACAP: "Tata Capital",
  LICHFL: "LIC Housing Finance",
};

/**
 * Detects bank from sender address (e.g. "AD-HDFCBK" -> "HDFC Bank")
 */
export function detectBankFromSender(sender: string): string | null {
  const upper = sender.toUpperCase();
  for (const [key, name] of Object.entries(BANK_SENDER_MAP)) {
    if (upper.includes(key)) return name;
  }
  return null;
}

/**
 * Parses a loan recovery or EMI debit SMS string
 */
export function parseLoanSms(
  smsBody: string,
  sender: string = "",
  timestamp?: number,
): ParsedLoanSms {
  const body = smsBody.replace(/\r\n/g, " ").replace(/\n/g, " ").trim();
  const lower = body.toLowerCase();

  // Check if this looks like a loan or EMI debit
  const isLoanOrEmi =
    lower.includes("loan") ||
    lower.includes("emi") ||
    lower.includes("recovery") ||
    lower.includes("nach") ||
    lower.includes("ecs") ||
    lower.includes("auto-debit") ||
    lower.includes("auto debit");

  const isDebit =
    lower.includes("debited") ||
    lower.includes("debit") ||
    lower.includes("deducted") ||
    lower.includes("transferred to loan") ||
    lower.includes("towards");

  // 1. Amount Extraction
  // Patterns:
  // INR 38,450.00 debited
  // Rs. 42,100.00
  // debited by Rs.28,500.00
  // with INR 35,000.00
  let amount: number | null = null;
  const amountPatterns = [
    /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:has been debited|debited|deducted|paid|towards)/i,
    /(?:debited|deducted|paid|with|by)\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];

  for (const pattern of amountPatterns) {
    const match = body.match(pattern);
    if (match && match[1]) {
      const cleaned = match[1].replace(/,/g, "");
      const parsedNum = parseFloat(cleaned);
      if (!isNaN(parsedNum) && parsedNum > 0) {
        amount = parsedNum;
        break;
      }
    }
  }

  // 2. Date Extraction
  // Patterns: "on 05-AUG-26", "on 05/08/2026", "on 10Aug26", "on 2026-08-05"
  let extractedDate: string | null = null;
  const datePatterns = [
    /on\s*(\d{1,2}[-/](?:[a-zA-Z]{3}|\d{1,2})[-/]\d{2,4})/i,
    /on\s*(\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{2,4})/i,
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/,
  ];

  for (const pattern of datePatterns) {
    const match = body.match(pattern);
    if (match && match[1]) {
      const parsedDate = parseDateToIso(match[1]);
      if (parsedDate) {
        extractedDate = parsedDate;
        break;
      }
    }
  }

  // Fallback to timestamp if date was not extracted from text
  if (!extractedDate && timestamp) {
    try {
      extractedDate = new Date(timestamp).toISOString().split("T")[0];
    } catch {
      // ignore
    }
  }

  // Compute Cycle Month
  const cycleMonth = extractedDate ? extractedDate.slice(0, 7) : null;

  // 3. Loan Account Extraction
  // Patterns: "Home Loan A/C **7890", "Loan A/c 50100492819", "LOAN A/C 38291048201", "Loan Account 00057281928"
  let loanAccount: string | null = null;
  const loanPatterns = [
    /(?:Home\s*Loan|Loan|LN)\s*(?:A\/C|Acct|Account|No\.?)?\s*(?:\*\*)?([a-zA-Z0-9]+)/i,
    /(?:towards|for)\s*(?:Home\s*Loan|Loan|EMI)\s*(?:A\/C|Account)?\s*(?:\*\*)?([a-zA-Z0-9]+)/i,
  ];

  for (const pattern of loanPatterns) {
    const match = body.match(pattern);
    if (match && match[1] && match[1].length >= 3) {
      loanAccount = match[1];
      break;
    }
  }

  // 4. Debit Bank Account Extraction (e.g. "from A/C **1234")
  let debitAccount: string | null = null;
  const debitPatterns = [
    /(?:from|in)\s*(?:A\/C|Account|Acct)?\s*(?:\*\*)?(\d{4})/i,
    /A\/C\s*(?:\*\*)?(\d{4})/i,
  ];
  for (const pattern of debitPatterns) {
    const match = body.match(pattern);
    if (match && match[1]) {
      debitAccount = match[1];
      break;
    }
  }

  // 5. Reference ID Extraction (e.g. "Ref No: 6223849281", "UPI/123456", "Info: LN RECOVERY")
  let referenceId: string | null = null;
  const refMatch = body.match(/(?:Ref(?:\s*No)?\.?|UPI|Txn\s*ID|URN)[:\s]*([a-zA-Z0-9]+)/i);
  if (refMatch && refMatch[1]) {
    referenceId = refMatch[1];
  }

  const bankName = detectBankFromSender(sender);

  const isMatch = (isLoanOrEmi || isDebit) && amount !== null;

  return {
    isMatch,
    amount,
    date: extractedDate,
    cycleMonth,
    loanAccount,
    debitAccount,
    referenceId,
    bankName,
    isDebit,
    rawText: body,
  };
}

const MONTH_NAME_MAP: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function parseDateToIso(dateStr: string): string | null {
  const clean = dateStr.trim();

  // Format: 05-AUG-26 or 05-Aug-2026 or 10Aug26
  const alphaMatch = clean.match(/^(\d{1,2})[-/\s]?([a-zA-Z]{3})[-/\s]?(\d{2,4})$/);
  if (alphaMatch) {
    const day = alphaMatch[1].padStart(2, "0");
    const month = MONTH_NAME_MAP[alphaMatch[2].toLowerCase().slice(0, 3)] || "01";
    let year = alphaMatch[3];
    if (year.length === 2) {
      year = "20" + year;
    }
    return `${year}-${month}-${day}`;
  }

  // Format: 05/08/2026 or 05-08-2026
  const numMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (numMatch) {
    const day = numMatch[1].padStart(2, "0");
    const month = numMatch[2].padStart(2, "0");
    let year = numMatch[3];
    if (year.length === 2) {
      year = "20" + year;
    }
    return `${year}-${month}-${day}`;
  }

  // Format: 2026-08-05
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return clean;
  }

  return null;
}
