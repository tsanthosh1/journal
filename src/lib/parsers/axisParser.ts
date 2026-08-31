import { ParsedPayment, ParsedStatement, ParserConfigField } from "../subscriptionTypes";
import {
  cleanCurrencyAmount,
  IStatementParser,
  parseFlexibleDate,
  stripHtmlAndCleanText,
} from "./base";

export class AxisCardParser implements IStatementParser {
  readonly id = "AxisCardParser";
  readonly name = "Axis Bank Credit Card Parser";
  readonly description =
    "Extracts Total Amount Due, Payment Due Date, and Payment receipts for Axis Bank Credit Cards.";
  readonly sampleStatementQuery =
    'from:cc.statements@axis.bank.in subject:"Credit Card"';
  readonly samplePaymentQuery =
    'from:alerts@axisbank.com subject:"Payment received"';

  readonly configFields: ParserConfigField[] = [
    {
      key: "cardLast4",
      label: "Credit Card Last 4 Digits",
      type: "text",
      placeholder: "e.g. 1234",
      description: "Optional: Only match statements or payments for this specific card",
    },
  ];

  parseStatement(content: string, subject = "", config?: Record<string, any>): ParsedStatement {
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);
    const matches: Record<string, string> = {};

    // 1. Table structure match (Axis Bank tabular e-statements)
    // Example: "Total Amount Due INR Minimum Amount Due (INR) Payment Due Date (DD-MM-YYYY) 202330.63 Dr 4122 Dr 04/09/2026"
    const tableMatch = cleanText.match(
      /Total\s+Amount\s+Due\s*(?:INR|\(INR\))?.*?Payment\s+Due\s+Date.*?\s+([0-9,]+(?:\.[0-9]{2})?)\s*(?:Dr|Cr)?\s+[0-9,.]+\s*(?:Dr|Cr)?\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    );

    if (tableMatch) {
      matches.rawAmount = tableMatch[1];
      matches.rawDueDate = tableMatch[2];
    } else {
      // Direct Amount Patterns
      const amountRegexes = [
        /Total\s+Amount\s+Due\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)\s*(?:Dr|Cr)?/i,
        /Total\s+Payment\s+Due\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)\s*(?:Dr|Cr)?/i,
        /Total\s+Dues?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)\s*(?:Dr|Cr)?/i,
        /Amount\s+Due\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)\s*(?:Dr|Cr)?/i,
        /([0-9,]+(?:\.[0-9]{2})?)\s+Dr\b/i,
      ];

      for (const rx of amountRegexes) {
        const match = cleanText.match(rx);
        if (match && match[1]) {
          matches.rawAmount = match[1];
          break;
        }
      }

      // Direct Due Date Patterns
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
    }

    // 2. Statement Date: explicit generation date in email body if present
    const stmtDateMatch = cleanText.match(
      /(?:Statement\s+Date|period\s+ending\s+with|period\s+ending|dated)\s*[:\-]?\s*(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    );
    if (stmtDateMatch) {
      matches.rawStmtDate = stmtDateMatch[1].trim();
    }

    // 3. Card digits
    const cardRegexes = [
      /(?:Credit\s+Card\s+no\.?|ending\s+with|ending\s+in|ending|XXXX|XX)\s*[:\-]?\s*(?:[X*]*\s*)?(\d{2,4})/i,
      /XX(\d{2,4})/i,
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
        error: "Could not extract Total Amount Due from Axis Bank statement.",
        rawMatches: matches,
      };
    }

    if (config?.cardLast4 && matches.rawCardDigits && matches.rawCardDigits !== config.cardLast4) {
      return {
        success: false,
        error: `Axis statement is for card ending ${matches.rawCardDigits}, expected ${config.cardLast4}.`,
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

    const paymentAmountRegexes = [
      /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:is|has\s+been)\s+debited/i,
      /received\s+payment\s+of\s+(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /payment\s+of\s+(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)\s+received/i,
      /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{2})?)\s+has\s+been\s+credited/i,
      /debited\s+(?:with|by)?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
    ];

    for (const rx of paymentAmountRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawPaidAmount = match[1];
        break;
      }
    }

    // Extract Card Digits
    const cardRegexes = [
      /Credit\s+Card\s+ending\s+(\d{4})/i,
      /Card\s+(?:no\.?|ending)?\s*[:\-]?\s*(?:[X*]*\s*)?(\d{4})/i,
    ];

    for (const rx of cardRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawCardDigits = match[1];
        break;
      }
    }

    // Extract Date
    const paymentDateRegexes = [
      /on\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /date\s*[:\-]?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    ];

    for (const rx of paymentDateRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawPaymentDate = match[1];
        break;
      }
    }

    const paidAmount = cleanCurrencyAmount(matches.rawPaidAmount);
    const paymentDate = parseFlexibleDate(matches.rawPaymentDate);

    if (paidAmount === undefined) {
      return {
        success: false,
        error: "Could not extract Paid Amount from Axis Bank payment email.",
        rawMatches: matches,
      };
    }

    if (config?.cardLast4 && matches.rawCardDigits && matches.rawCardDigits !== config.cardLast4) {
      return {
        success: false,
        error: `Axis payment is for card ending ${matches.rawCardDigits}, expected ${config.cardLast4}.`,
      };
    }

    return {
      success: true,
      paidAmount,
      paymentDate: paymentDate ?? new Date().toISOString().split("T")[0],
      accountOrCardDigits: matches.rawCardDigits,
      rawMatches: matches,
    };
  }
}
