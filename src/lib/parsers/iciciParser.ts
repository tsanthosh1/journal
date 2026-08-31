import { ParsedPayment, ParsedStatement, ParserConfigField } from "../subscriptionTypes";
import {
  cleanCurrencyAmount,
  IStatementParser,
  parseFlexibleDate,
  stripHtmlAndCleanText,
} from "./base";

export class ICICICardParser implements IStatementParser {
  readonly id = "ICICICardParser";
  readonly name = "ICICI Bank & Amazon Pay Credit Card Parser";
  readonly description =
    "Extracts Total Amount Due, Due Date, Statement Period, and Payment receipts for ICICI Bank and Amazon Pay Credit Cards.";
  readonly sampleStatementQuery =
    'from:(credit_cards@icici.bank.in OR credit_cards@icicibank.com) subject:"Credit Card Statement"';
  readonly samplePaymentQuery =
    'from:(no-reply@amazonpay.in OR alerts@icicibank.com) "credit card"';

  readonly configFields: ParserConfigField[] = [
    {
      key: "cardLast4",
      label: "Credit Card Last 4 Digits",
      type: "text",
      placeholder: "e.g. 5678",
      description: "Optional: Only match statements or payments for this specific card",
    },
  ];

  parseStatement(content: string, subject = "", config?: Record<string, any>): ParsedStatement {
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);
    const matches: Record<string, string> = {};

    // 1. Amount Due (Strictly prioritize Total Amount Due over Minimum Amount Due)
    const amountRegexes = [
      /Total\s+Amount\s+Due\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /Total\s+Due\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /Total\s+Payment\s+Due\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /(?<!Minimum\s+)Amount\s+Payable\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /(?<!Minimum\s+)Amount\s+Due\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
    ];

    for (const rx of amountRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawAmount = match[1];
        break;
      }
    }

    // 2. Due Date
    const dueDateRegexes = [
      /(?:payment\s+due\s+by|payment\s+due\s+date|due\s+by|due\s+date|pay\s+by)\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /(?:by)\s+([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4})/i,
    ];

    for (const rx of dueDateRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawDueDate = match[1];
        break;
      }
    }

    // 3. Statement Date / Period End
    const stmtDateRegexes = [
      /period\s+[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}\s+to\s+([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i,
      /Statement\s+Date\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /Billing\s+Date\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /statement\s+for\s+([A-Za-z]{3,9}\s+\d{4})/i,
    ];

    for (const rx of stmtDateRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawStmtDate = match[1];
        break;
      }
    }

    // 4. Card Digits (supports body text, subject, and PDF attachment filename like 4315XXXXXXXX5005)
    const cardRegexes = [
      /(?:Credit\s+Card|Card\s+ending\s+in|ending\s+with|ending|XXXX|XX)\s*[:\-]?\s*(?:[X*]*\s*)?(\d{4})/i,
      /XX(\d{4})/i,
      /4315[X*]+(\d{4})/i,
      /filename=[^;]*?(\d{4})_.*\.pdf/i,
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

    // If no plaintext total due was found (common in older PDF attachment emails)
    if (statementTotal === undefined) {
      if (statementDate || matches.rawStmtDate) {
        const calculatedDueDate =
          dueDate ??
          (statementDate
            ? new Date(new Date(statementDate).getTime() + 18 * 86400000)
                .toISOString()
                .split("T")[0]
            : undefined);

        return {
          success: true,
          statementTotal: 0,
          dueDate: calculatedDueDate,
          statementDate,
          accountOrCardDigits: matches.rawCardDigits,
          rawMatches: matches,
        };
      }

      return {
        success: false,
        error: "Could not extract Total Amount Due from ICICI statement email.",
        rawMatches: matches,
      };
    }

    if (config?.cardLast4 && matches.rawCardDigits && matches.rawCardDigits !== config.cardLast4) {
      return {
        success: false,
        error: `ICICI statement is for card ending ${matches.rawCardDigits}, expected ${config.cardLast4}.`,
      };
    }

    return {
      success: true,
      statementTotal,
      dueDate: dueDate ?? (statementDate ? new Date(new Date(statementDate).getTime() + 18 * 86400000).toISOString().split("T")[0] : undefined),
      statementDate,
      accountOrCardDigits: matches.rawCardDigits,
      rawMatches: matches,
    };
  }

  parsePayment(content: string, subject = "", config?: Record<string, any>): ParsedPayment {
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);
    const matches: Record<string, string> = {};

    // 1. Amount Paid (supports Amazon Pay and direct ICICI receipts)
    const paymentAmountRegexes = [
      /payment\s+of\s*(?:₹|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /(?:Paid\s+Amount|Amount\s+Paid)\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /Amount\s*[:\-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /received\s+(?:a\s+)?payment\s+of\s+(?:₹|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /payment\s+of\s+(?:₹|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{2})?)\s+received/i,
      /amount\s+of\s+(?:₹|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{2})?)\s+credited/i,
      /(?:₹|Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:has\s+been\s+received|received|towards|for|paid|successful)/i,
      /(?:₹|Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:is|has\s+been)\s+debited/i,
    ];

    for (const rx of paymentAmountRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawPaidAmount = match[1];
        break;
      }
    }

    // 2. Payment Date
    const paymentDateRegexes = [
      /(?:transaction\s+date|payment\s+date|date|dated|on)\s*[:\-]?\s*(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i,
    ];

    for (const rx of paymentDateRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawPaymentDate = match[1];
        break;
      }
    }

    // 3. Card Digits (e.g. "**** 5005", "XX-5005", "ending 5005")
    const cardRegexes = [
      /(?:credit\s+card|card|card\s+number)\s*(?:no\.?|XXXX|XX|-|\*+)?\s*[:\-]?\s*(?:[X*]*\s*)?(\d{4})/i,
      /\*{3,4}\s*(\d{4})/i,
      /XX-?(\d{4})/i,
      /ending\s+with\s+(\d{4})/i,
    ];

    for (const rx of cardRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawCardDigits = match[1];
        break;
      }
    }

    // 4. Order / Reference ID (e.g. "Order Id 408-1861546-7819521")
    const refRegexes = [
      /Order\s+Id\s*[:\-]?\s*([0-9\-]{10,25})/i,
      /(?:reference\s+no\.?|reference\s+number|transaction\s+ref)\s*[:\-]?\s*([A-Za-z0-9]+)/i,
    ];

    for (const rx of refRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawReferenceId = match[1];
        break;
      }
    }

    const paidAmount = cleanCurrencyAmount(matches.rawPaidAmount);
    const paymentDate = parseFlexibleDate(matches.rawPaymentDate);

    if (paidAmount === undefined) {
      return {
        success: false,
        error: "Could not extract Payment Amount from ICICI / Amazon Pay payment email.",
        rawMatches: matches,
      };
    }

    if (config?.cardLast4 && matches.rawCardDigits && matches.rawCardDigits !== config.cardLast4) {
      return {
        success: false,
        error: `ICICI payment is for card ending ${matches.rawCardDigits}, expected ${config.cardLast4}.`,
      };
    }

    return {
      success: true,
      paidAmount,
      paymentDate,
      accountOrCardDigits: matches.rawCardDigits,
      referenceId: matches.rawReferenceId,
      rawMatches: matches,
    };
  }
}
