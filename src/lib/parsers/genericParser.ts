import { ParsedPayment, ParsedStatement, ParserConfigField } from "../subscriptionTypes";
import {
  cleanCurrencyAmount,
  IStatementParser,
  parseFlexibleDate,
  stripHtmlAndCleanText,
} from "./base";

export class GenericUtilityParser implements IStatementParser {
  readonly id = "GenericUtilityParser";
  readonly name = "Generic Utility, Telecom & OTT Parser";
  readonly description =
    "Extracts Total Bill Amount, Due Date, and Payment confirmation receipts for electricity, broadband, OTT streaming (Airtel Xstream, Netflix, Prime), mobile, water, and insurance.";
  readonly sampleStatementQuery =
    'from:(airtel OR jio OR bescom OR electricity) subject:("Bill" OR "Invoice" OR "Statement" OR "OTTs")';
  readonly samplePaymentQuery =
    'from:(airtel OR jio OR bescom OR electricity) subject:("Payment Successful" OR "Receipt" OR "Received" OR "Invoice Generated")';

  readonly configFields: ParserConfigField[] = [
    {
      key: "billerKeyword",
      label: "Biller / Provider Name Filter",
      type: "text",
      placeholder: "e.g. BESCOM, Jio, Netflix",
      description: "Optional: Only match bills or receipts mentioning this keyword",
    },
  ];

  parseStatement(content: string, subject = "", config?: Record<string, any>): ParsedStatement {
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);
    const matches: Record<string, string> = {};

    if (config?.billerKeyword && !cleanText.toLowerCase().includes(config.billerKeyword.toLowerCase())) {
      return {
        success: false,
        error: `Bill did not match biller keyword "${config.billerKeyword}".`,
      };
    }

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

  parsePayment(content: string, subject = "", config?: Record<string, any>): ParsedPayment {
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);
    const matches: Record<string, string> = {};

    if (config?.billerKeyword && !cleanText.toLowerCase().includes(config.billerKeyword.toLowerCase())) {
      return {
        success: false,
        error: `Receipt did not match biller keyword "${config.billerKeyword}".`,
      };
    }

    // Direct Payment & Invoice Generation Receipt Regexes
    const paymentRegexes = [
      /received\s+(?:a\s+)?payment\s+of\s+(?:Rs\.?|INR|₹|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /payment\s+of\s+(?:Rs\.?|INR|₹|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:has\s+been\s+received|received|successful|completed)/i,
      /paid\s+amount\s*[:\-]?\s*(?:Rs\.?|INR|₹|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /amount\s+paid\s*[:\-]?\s*(?:Rs\.?|INR|₹|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /(?:Rs\.?|INR|₹|\$|€|£)\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:has\s+been\s+paid|paid\s+successfully|debited)/i,
      /invoice\s+(?:amount|total|value)\s*[:\-]?\s*(?:Rs\.?|INR|₹|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
    ];

    for (const rx of paymentRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawPaidAmount = match[1];
        break;
      }
    }

    // Payment Date
    const paymentDateRegexes = [
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

    // Transaction ID / Reference
    const refMatch = cleanText.match(/(?:receipt|transaction|txn|order|reference|invoice)\s*(?:no\.?|id|number)?\s*[:\-]?\s*([A-Za-z0-9_\-]+)/i);
    if (refMatch && refMatch[1]) {
      matches.rawReferenceId = refMatch[1];
    }

    const paidAmount = cleanCurrencyAmount(matches.rawPaidAmount);
    const paymentDate = parseFlexibleDate(matches.rawPaymentDate);

    if (paidAmount === undefined) {
      return {
        success: false,
        error: "Could not extract Payment Amount from utility receipt email.",
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
  readonly name = "Custom Regex Pattern Parser";
  readonly description =
    "Applies user-defined regular expressions to extract amounts and due dates directly from arbitrary email layouts.";
  readonly sampleStatementQuery = "from:billing@example.com";
  readonly samplePaymentQuery = "from:payments@example.com";

  readonly configFields: ParserConfigField[] = [
    {
      key: "statementAmountPattern",
      label: "Statement Amount Regex (with 1 capturing group)",
      type: "text",
      placeholder: 'e.g. Total Due:\\s*(?:Rs\\.?|₹)?\\s*([\\d,]+(?:\\.\\d{2})?)',
      description: "Captures statement bill amount",
    },
    {
      key: "statementDueDatePattern",
      label: "Statement Due Date Regex (with 1 capturing group)",
      type: "text",
      placeholder: 'e.g. Due Date:\\s*(\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4})',
      description: "Captures payment due date",
    },
    {
      key: "paymentAmountPattern",
      label: "Payment Amount Regex (with 1 capturing group)",
      type: "text",
      placeholder: 'e.g. Paid amount:\\s*(?:Rs\\.?|₹)?\\s*([\\d,]+(?:\\.\\d{2})?)',
      description: "Captures receipt paid amount",
    },
  ];

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

  parseStatement(content: string, subject = "", config?: Record<string, any>): ParsedStatement {
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);
    const matches: Record<string, string> = {};

    const amountPattern = config?.statementAmountPattern || this.customPatterns?.statementAmountPattern;
    const dueDatePattern = config?.statementDueDatePattern || this.customPatterns?.statementDueDatePattern;

    if (amountPattern) {
      try {
        const rx = new RegExp(amountPattern, "i");
        const m = cleanText.match(rx);
        if (m && m[1]) matches.rawAmount = m[1];
      } catch {
        // ignore regex error
      }
    }

    if (dueDatePattern) {
      try {
        const rx = new RegExp(dueDatePattern, "i");
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
      dueDate,
      rawMatches: matches,
    };
  }

  parsePayment(content: string, subject = "", config?: Record<string, any>): ParsedPayment {
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);
    const matches: Record<string, string> = {};

    const payPattern = config?.paymentAmountPattern || this.customPatterns?.paymentAmountPattern;

    if (payPattern) {
      try {
        const rx = new RegExp(payPattern, "i");
        const m = cleanText.match(rx);
        if (m && m[1]) matches.rawPaidAmount = m[1];
      } catch {
        // ignore regex error
      }
    }

    const paidAmount = cleanCurrencyAmount(matches.rawPaidAmount);
    const paymentDate = parseFlexibleDate(matches.rawPaymentDate);

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
      paymentDate,
      rawMatches: matches,
    };
  }
}
