/**
 * Specialized parser for Indian Bank Loan, Home Loan, and EMI Recovery SMS alerts.
 * Supports Bank of India (BOI), HDFC, ICICI, SBI, Canara, Axis, Kotak, Bank of Baroda, PNB, Bajaj, Tata Capital, etc.
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
  BOI: "Bank of India",
  BKID: "Bank of India",
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
  UNION: "Union Bank of India",
  UBI: "Union Bank of India",
  INDIANB: "Indian Bank",
};

/**
 * Detects bank from sender address or message body prefix
 */
export function detectBankFromSender(sender: string, bodyText: string = ""): string | null {
  const upperSender = sender.toUpperCase();
  const upperBody = bodyText.toUpperCase();

  for (const [key, name] of Object.entries(BANK_SENDER_MAP)) {
    if (upperSender.includes(key)) return name;
  }

  // Check body prefix or content e.g. "BOI - Rs 34550", "from HDFC Bank XX6013", "HDFC BANK LTD"
  for (const [key, name] of Object.entries(BANK_SENDER_MAP)) {
    if (
      upperBody.startsWith(key) ||
      upperBody.includes(`${key} -`) ||
      upperBody.includes(`${key}:`) ||
      upperBody.includes(`${key} BANK`) ||
      upperBody.includes(`${key}BK`)
    ) {
      return name;
    }
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

  // Exclude non-loan funds transfers (e.g. "To RTGS ...", "To NEFT ...", "To UPI ...", "ATM WDL")
  // unless explicitly marked as a loan recovery or ACH loan debit
  const isGenericTransfer =
    (lower.includes("to rtgs") ||
      lower.includes("to neft") ||
      lower.includes("to upi") ||
      lower.includes("upi/") ||
      lower.includes("atm wdl") ||
      lower.includes("pos ")) &&
    !lower.includes("loan rec") &&
    !lower.includes("loan recovery") &&
    !lower.includes("loan a/c") &&
    !lower.includes("home loan") &&
    !lower.includes("ach d-") &&
    !lower.includes("nach d-");

  if (isGenericTransfer) {
    return {
      isMatch: false,
      amount: null,
      date: null,
      cycleMonth: null,
      loanAccount: null,
      debitAccount: null,
      referenceId: null,
      bankName: detectBankFromSender(sender, body),
      isDebit: false,
      rawText: body,
    };
  }

  // Check for explicit loan recovery, loan debit, ACH/NACH mandate, or EMI keywords
  const isLoanOrEmi =
    lower.includes("loan rec") ||
    lower.includes("loan recovery") ||
    lower.includes("loan a/c") ||
    lower.includes("home loan") ||
    lower.includes("ln rec") ||
    lower.includes("ln recovery") ||
    lower.includes("ach d-") ||
    lower.includes("ach d ") ||
    lower.includes("nach d-") ||
    lower.includes("ach debit") ||
    lower.includes("nach debit") ||
    lower.includes("transferred to loan") ||
    lower.includes("towards loan") ||
    lower.includes("towards emi") ||
    lower.includes("loan account") ||
    lower.includes("emi") ||
    lower.includes("nach") ||
    lower.includes("ecs") ||
    lower.includes("auto-debit") ||
    lower.includes("auto debit");

  const isDebit =
    lower.includes("debited") ||
    lower.includes("debit") ||
    lower.includes("deducted") ||
    lower.includes("transferred to loan") ||
    lower.includes("towards") ||
    lower.includes("debited(trf)");

  // 1. Amount Extraction
  let amount: number | null = null;
  const amountPatterns = [
    /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:has been debited|debited\(trf\)|debited|deducted|paid|towards)/i,
    /(?:debited\(trf\)|debited|deducted|paid|with|by)\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
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

  // 3. Loan Account / ACH Mandate Reference Extraction
  let loanAccount: string | null = null;
  const loanPatterns = [
    /(?:ACH\s*D-?\s*|NACH\s*D-?\s*)(?:[a-zA-Z\s]+-)?([a-zA-Z0-9]+)/i,
    /(?:Loan\s*Rec(?:overy)?|LN\s*REC)[/:\s]+([a-zA-Z0-9]+)/i,
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

  // 4. Debit Bank Account Extraction (e.g. "from HDFC Bank XX6013", "in your Ac XX1607", "from A/C **1234")
  let debitAccount: string | null = null;
  const debitPatterns = [
    /(?:from|in)\s*(?:[a-zA-Z\s]+)?(?:Bank|Ac|A\/c|Account|Acct)?\s*(?:XX|\*\*|X\*|\*)?(\d{4})/i,
    /(?:in\s*your\s*Ac|your\s*Ac|from\s*Ac|Ac|A\/C)\s*(?:XX|\*\*|X\*|\*)?(\d{4})/i,
    /(?:Account|Acct|A\/c|Ac)\s*(?:ending|no\.?|is)?\s*(?:XX|\*\*|X\*|\*)?(\d{4})/i,
    /A\/C\s*(?:\*\*)?(\d{4})/i,
  ];
  for (const pattern of debitPatterns) {
    const match = body.match(pattern);
    if (match && match[1]) {
      debitAccount = match[1];
      break;
    }
  }

  // 5. Reference ID Extraction
  let referenceId: string | null = null;
  const refMatch = body.match(/(?:Ref(?:\s*No)?\.?|UPI|Txn\s*ID|URN)[:\s]*([a-zA-Z0-9]+)/i);
  if (refMatch && refMatch[1]) {
    referenceId = refMatch[1];
  } else if (loanAccount) {
    referenceId = loanAccount;
  }

  const bankName = detectBankFromSender(sender, body);

  // Both isLoanOrEmi AND isDebit MUST be true, along with a valid parsed amount!
  const isMatch = isLoanOrEmi && isDebit && amount !== null;

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

  // Format: 05-AUG-26 or 05-JUL-26 or 05-Aug-2026 or 10Aug26
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

  // Format: 07-07-2026 or 05/08/2026 or 05-08-2026
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
