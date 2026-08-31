import { ParsedPayment, ParsedStatement, ParserConfigField } from "../subscriptionTypes";
import {
  cleanCurrencyAmount,
  IStatementParser,
  parseFlexibleDate,
  stripHtmlAndCleanText,
} from "./base";

export class HDFCCardParser implements IStatementParser {
  readonly id = "HDFCCardParser";
  readonly name = "HDFC Bank Credit Card & Payments";
  readonly description =
    "Extracts Total Amount Due, Due Date, Statement Date, and Payment confirmations (including UPI & NetBanking) for HDFC Bank.";
  readonly sampleStatementQuery =
    'from:statements@hdfcbank.net subject:"Statement"';
  readonly samplePaymentQuery =
    'from:alerts@hdfcbank.bank.in "gpay-creditcard@okpayaxis"';

  readonly configFields: ParserConfigField[] = [
    {
      key: "cardLast4",
      label: "Credit Card Last 4 Digits",
      type: "text",
      placeholder: "e.g. 6013",
      description: "Optional: Only match statements or payments for this specific card",
    },
    {
      key: "vpaFilter",
      label: "UPI VPA / Beneficiary Handle",
      type: "text",
      placeholder: "e.g. gpay-creditcard@okpayaxis",
      description: "Optional: Filter UPI debit alerts to this specific beneficiary VPA",
    },
  ];

  parseStatement(content: string, subject = "", config?: Record<string, any>): ParsedStatement {
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);

    const matches: Record<string, string> = {};

    // 1. Extract Total Amount Due
    const amountRegexes = [
      /Total\s+Amount\s+Due(?:\s*\(Rs\.?\))?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /Total\s+Dues?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /Amount\s+Due\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{2})?)\s+is\s+the\s+total\s+amount\s+due/i,
    ];

    for (const rx of amountRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawAmount = match[1];
        break;
      }
    }

    // 2. Extract Payment Due Date
    const dueDateRegexes = [
      /Payment\s+Due\s+Date\s*[:\-]?\s*(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /Due\s+Date\s*[:\-]?\s*(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /Pay\s+by\s*[:\-]?\s*(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    ];

    for (const rx of dueDateRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawDueDate = match[1];
        break;
      }
    }

    // 3. Extract Statement Date
    const stmtDateRegexes = [
      /Statement\s+Date\s*[:\-]?\s*(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /Statement\s+Period\s*[:\-]?\s*.*?to\s+(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    ];

    for (const rx of stmtDateRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawStmtDate = match[1];
        break;
      }
    }

    // 4. Extract Card digits (last 4)
    const cardRegexes = [
      /Card\s+(?:ending\s+in|ending\s+with|ending|number|no\.?|XXXX|XX)\s*[:\-]?\s*(?:[X*]*\s*)?(\d{4})/i,
      /Credit\s+Card\s+.*?(?:XX|ending\s+in\s+)(\d{4})/i,
    ];

    for (const rx of cardRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawCardDigits = match[1];
        break;
      }
    }

    const statementTotal = cleanCurrencyAmount(matches.rawAmount);
    const dueDate = parseFlexibleDate(matches.rawDueDate);
    const statementDate = parseFlexibleDate(matches.rawStmtDate);

    if (statementTotal === undefined) {
      return {
        success: false,
        error: "Could not extract Statement Total Amount Due from HDFC email body.",
        rawMatches: matches,
      };
    }

    if (config?.cardLast4 && matches.rawCardDigits && matches.rawCardDigits !== config.cardLast4) {
      return {
        success: false,
        error: `HDFC card statement is for card ending ${matches.rawCardDigits}, expected ${config.cardLast4}.`,
      };
    }

    return {
      success: true,
      statementTotal,
      dueDate: dueDate ?? new Date().toISOString().split("T")[0],
      statementDate,
      accountOrCardDigits: matches.rawCardDigits,
      rawMatches: matches,
    };
  }

  parsePayment(content: string, subject = "", config?: Record<string, any>): ParsedPayment {
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);

    const matches: Record<string, string> = {};

    // 1. Extract Paid Amount (handles both Direct Card receipts and UPI/NetBanking debits)
    const paymentAmountRegexes = [
      /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:is|has\s+been)\s+debited\s+from\s+your\s+account/i,
      /received\s+(?:a\s+)?payment\s+of\s+(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /payment\s+of\s+(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:has\s+been|is)\s+received/i,
      /amount\s+of\s+(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)\s+credited\s+towards\s+(?:your\s+)?(?:credit\s+card|card)/i,
      /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:has\s+been\s+received|received\s+towards)/i,
      /payment\s+received\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /debited\s+(?:with|by)?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{2})?)/i,
    ];

    for (const rx of paymentAmountRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawPaidAmount = match[1];
        break;
      }
    }

    // 2. Extract Payment Date
    const paymentDateRegexes = [
      /on\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /(?:on|dated)\s+(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /payment\s+date\s*[:\-]?\s*(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    ];

    for (const rx of paymentDateRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawPaymentDate = match[1];
        break;
      }
    }

    // 3. Extract Card / Account Digits
    const cardRegexes = [
      /account\s+ending\s+(?:in\s+)?(\d{4})/i,
      /(?:card|ending\s+in|ending)\s*(?:no\.?|number|XXXX|XX)?\s*[:\-]?\s*(?:[X*]*\s*)?(\d{4})/i,
    ];

    for (const rx of cardRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawCardDigits = match[1];
        break;
      }
    }

    // 4. Extract Reference ID / UPI RRN
    const refRegexes = [
      /UPI\s+transaction\s+reference\s+no\.?\s*[:\-]?\s*([0-9A-Za-z]+)/i,
      /(?:reference|ref|txn|transaction|rrn)\s*(?:no\.?|id|number)?\s*[:\-]?\s*([A-Za-z0-9]+)/i,
    ];

    for (const rx of refRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawRef = match[1];
        break;
      }
    }

    const paidAmount = cleanCurrencyAmount(matches.rawPaidAmount);
    const paymentDate = parseFlexibleDate(matches.rawPaymentDate);

    if (paidAmount === undefined) {
      return {
        success: false,
        error: "Could not extract Payment Amount from HDFC payment/UPI email.",
        rawMatches: matches,
      };
    }

    if (config?.vpaFilter && !cleanText.toLowerCase().includes(config.vpaFilter.toLowerCase())) {
      return {
        success: false,
        error: `HDFC payment did not match VPA filter "${config.vpaFilter}".`,
      };
    }

    if (config?.cardLast4 && matches.rawCardDigits && matches.rawCardDigits !== config.cardLast4) {
      return {
        success: false,
        error: `HDFC payment is for card ending ${matches.rawCardDigits}, expected ${config.cardLast4}.`,
      };
    }

    return {
      success: true,
      paidAmount,
      paymentDate: paymentDate ?? new Date().toISOString().split("T")[0],
      referenceId: matches.rawRef,
      accountOrCardDigits: matches.rawCardDigits,
      rawMatches: matches,
    };
  }
}
