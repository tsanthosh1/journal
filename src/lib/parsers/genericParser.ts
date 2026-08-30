import { ParsedPayment, ParsedStatement } from "../subscriptionTypes";
import {
  cleanCurrencyAmount,
  IStatementParser,
  parseFlexibleDate,
  stripHtmlAndCleanText,
} from "./base";

export class GenericUtilityParser implements IStatementParser {
  readonly id = "GenericUtilityParser";
  readonly name = "Generic Utility, OTT & Bill Parser";
  readonly description =
    "Extracts Total Bill Amount, Due Date, and Payment confirmation receipts for electricity, broadband, OTT streaming (Airtel Xstream, Netflix, Prime), mobile, water, and insurance.";
  readonly sampleStatementQuery =
    'from:(airtel OR jio OR bescom OR electricity) subject:("Bill" OR "Invoice" OR "Statement" OR "OTTs")';
  readonly samplePaymentQuery =
    'from:(airtel OR jio OR bescom OR electricity) subject:("Payment Successful" OR "Receipt" OR "Received" OR "Invoice Generated")';

  parseStatement(content: string, subject = ""): ParsedStatement {
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);
    const matches: Record<string, string> = {};

    const amountRegexes = [
      /(?:subscription\s+of|subscription\s+amount|purchasing\s+a\s+subscription\s+of)\s*[:\-]?\s*(?:Rs\.?|INR|₹|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /(?:Total\s+Amount\s+Due|Total\s+Due|Net\s+Payable|Amount\s+Payable|Bill\s+Amount|Total\s+Payable|Invoice\s+Amount|Total\s+Charges)\s*[:\-]?\s*(?:Rs\.?|INR|₹|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /(?:Rs\.?|INR|₹|\$|€|£)\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:is\s+due|payable\s+by|is\s+the\s+total)/i,
      /Pay\s+(?:Rs\.?|INR|₹|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)\s+before/i,
    ];

    for (const rx of amountRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawAmount = match[1];
        break;
      }
    }

    const dueDateRegexes = [
      /(?:Payment\s+Due\s+Date|Due\s+Date|Pay\s+by|Due\s+on|Before)\s*[:\-]?\s*(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /(?:due\s+on\s+or\s+before)\s+(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    ];

    for (const rx of dueDateRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawDueDate = match[1];
        break;
      }
    }

    // Ref / Invoice ID
    const refMatch = raw.match(/filename=([A-Za-z0-9_]+)\.pdf/i) || cleanText.match(/Invoice\s*(?:No\.?|Number|#)\s*[:\-]?\s*([A-Za-z0-9_\-]+)/i);
    if (refMatch && refMatch[1]) {
      matches.rawReferenceId = refMatch[1];
    }

    const statementTotal = cleanCurrencyAmount(matches.rawAmount);
    const dueDate = parseFlexibleDate(matches.rawDueDate);

    if (statementTotal === undefined) {
      return {
        success: false,
        error: "Could not extract Bill Amount from utility bill email.",
        rawMatches: matches,
      };
    }

    return {
      success: true,
      statementTotal,
      dueDate: dueDate ?? new Date().toISOString().split("T")[0],
      referenceId: matches.rawReferenceId,
      rawMatches: matches,
    };
  }

  parsePayment(content: string, subject = ""): ParsedPayment {
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);
    const matches: Record<string, string> = {};

    const paymentAmountRegexes = [
      /(?:subscription\s+of|purchasing\s+a\s+subscription\s+of|subscription\s+amount)\s*[:\-]?\s*(?:Rs\.?|INR|₹|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /(?:Payment\s+of|Received\s+payment\s+of|Payment\s+received\s+of|Amount\s+paid|Paid\s+amount|Transaction\s+amount)\s*[:\-]?\s*(?:Rs\.?|INR|₹|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /(?:Rs\.?|INR|₹|\$|€|£)\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:received\s+successfully|paid\s+successfully|has\s+been\s+received|debited)/i,
    ];

    for (const rx of paymentAmountRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawPaidAmount = match[1];
        break;
      }
    }

    const paymentDateRegexes = [
      /(?:on|dated|at)\s+(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    ];

    for (const rx of paymentDateRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawPaymentDate = match[1];
        break;
      }
    }

    // Ref / Invoice ID
    const refMatch = raw.match(/filename=([A-Za-z0-9_]+)\.pdf/i) || cleanText.match(/(?:Receipt\s*No\.?|Transaction\s*ID|Invoice\s*No\.?)\s*[:\-]?\s*([A-Za-z0-9_\-]+)/i);
    if (refMatch && refMatch[1]) {
      matches.rawReferenceId = refMatch[1];
    }

    const paidAmount = cleanCurrencyAmount(matches.rawPaidAmount);
    const paymentDate = parseFlexibleDate(matches.rawPaymentDate);

    if (paidAmount === undefined) {
      return {
        success: false,
        error: "Could not extract Payment Amount from receipt email.",
        rawMatches: matches,
      };
    }

    return {
      success: true,
      paidAmount,
      paymentDate: paymentDate ?? new Date().toISOString().split("T")[0],
      referenceId: matches.rawReferenceId,
      rawMatches: matches,
    };
  }
}

/**
 * Custom Regex Parser configured with user-provided patterns
 */
export class CustomRegexParser implements IStatementParser {
  readonly id = "CustomRegexParser";
  readonly name = "Custom Regex Parser";
  readonly description =
    "Executes user-defined custom regex patterns for statement amounts, due dates, and payment amounts.";
  readonly sampleStatementQuery = 'from:billing@provider.com subject:"Invoice"';
  readonly samplePaymentQuery = 'from:billing@provider.com subject:"Payment"';

  customPatterns?: {
    statementAmountPattern?: string;
    statementDueDatePattern?: string;
    paymentAmountPattern?: string;
  };

  constructor(customPatterns?: {
    statementAmountPattern?: string;
    statementDueDatePattern?: string;
    paymentAmountPattern?: string;
  }) {
    this.customPatterns = customPatterns;
  }

  parseStatement(content: string, subject = ""): ParsedStatement {
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);
    const matches: Record<string, string> = {};

    if (this.customPatterns?.statementAmountPattern) {
      try {
        const rx = new RegExp(this.customPatterns.statementAmountPattern, "i");
        const m = cleanText.match(rx);
        if (m && m[1]) matches.rawAmount = m[1];
      } catch {
        // ignore regex error
      }
    }

    if (this.customPatterns?.statementDueDatePattern) {
      try {
        const rx = new RegExp(this.customPatterns.statementDueDatePattern, "i");
        const m = cleanText.match(rx);
        if (m && m[1]) matches.rawDueDate = m[1];
      } catch {
        // ignore regex error
      }
    }

    const statementTotal = cleanCurrencyAmount(matches.rawAmount);
    const dueDate = parseFlexibleDate(matches.rawDueDate);

    if (statementTotal === undefined) {
      return {
        success: false,
        error: "Custom Regex could not extract Statement Amount from content.",
        rawMatches: matches,
      };
    }

    return {
      success: true,
      statementTotal,
      dueDate: dueDate ?? new Date().toISOString().split("T")[0],
      rawMatches: matches,
    };
  }

  parsePayment(content: string, subject = ""): ParsedPayment {
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);
    const matches: Record<string, string> = {};

    if (this.customPatterns?.paymentAmountPattern) {
      try {
        const rx = new RegExp(this.customPatterns.paymentAmountPattern, "i");
        const m = cleanText.match(rx);
        if (m && m[1]) matches.rawPaidAmount = m[1];
      } catch {
        // ignore regex error
      }
    }

    const paidAmount = cleanCurrencyAmount(matches.rawPaidAmount);

    if (paidAmount === undefined) {
      return {
        success: false,
        error: "Custom Regex could not extract Payment Amount from content.",
        rawMatches: matches,
      };
    }

    return {
      success: true,
      paidAmount,
      paymentDate: new Date().toISOString().split("T")[0],
      rawMatches: matches,
    };
  }
}
