import { ParsedPayment, ParsedStatement, ParserConfigField } from "../subscriptionTypes";
import {
  cleanCurrencyAmount,
  IStatementParser,
  parseFlexibleDate,
  stripHtmlAndCleanText,
} from "./base";

export class SBICardParser implements IStatementParser {
  readonly id = "SBICardParser";
  readonly name = "SBI Card Parser";
  readonly description =
    "Extracts Total Amount Due, Payment Due Date, Statement Period, and Payment confirmations for SBI Credit Cards.";
  readonly sampleStatementQuery =
    'from:estatement@sbicard.com subject:"SBI Card e-Statement"';
  readonly samplePaymentQuery =
    'from:feedback@sbicard.com subject:"Payment Confirmation"';

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

    const amountRegexes = [
      /Total\s+Amount\s+Due\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /Total\s+Dues?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
    ];

    for (const rx of amountRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawAmount = match[1];
        break;
      }
    }

    const dueDateRegexes = [
      /Payment\s+Due\s+Date\s*[:\-]?\s*(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /Due\s+Date\s*[:\-]?\s*(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    ];

    for (const rx of dueDateRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawDueDate = match[1];
        break;
      }
    }

    const cardRegexes = [
      /(?:SBI\s+Card\s+ending|ending\s+in|ending\s+with|XXXX|XX)\s*[:\-]?\s*(?:[X*]*\s*)?(\d{4})/i,
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

    if (statementTotal === undefined) {
      return {
        success: false,
        error: "Could not extract Total Amount Due from SBI Card statement.",
        rawMatches: matches,
      };
    }

    if (config?.cardLast4 && matches.rawCardDigits && matches.rawCardDigits !== config.cardLast4) {
      return {
        success: false,
        error: `SBI Card statement is for card ending ${matches.rawCardDigits}, expected ${config.cardLast4}.`,
      };
    }

    return {
      success: true,
      statementTotal,
      dueDate: dueDate ?? new Date().toISOString().split("T")[0],
      accountOrCardDigits: matches.rawCardDigits,
      rawMatches: matches,
    };
  }

  parsePayment(content: string, subject = "", config?: Record<string, any>): ParsedPayment {
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);
    const matches: Record<string, string> = {};

    const paymentAmountRegexes = [
      /received\s+payment\s+of\s+(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /payment\s+of\s+(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)\s+received/i,
      /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{2})?)\s+has\s+been\s+credited/i,
    ];

    for (const rx of paymentAmountRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawPaidAmount = match[1];
        break;
      }
    }

    const paymentDateRegexes = [
      /(?:on|dated)\s+(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    ];

    for (const rx of paymentDateRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawPaymentDate = match[1];
        break;
      }
    }

    const cardRegexes = [
      /(?:SBI\s+Card|card|ending)\s*(?:no\.?|XXXX|XX)?\s*[:\-]?\s*(?:[X*]*\s*)?(\d{4})/i,
    ];

    for (const rx of cardRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawCardDigits = match[1];
        break;
      }
    }

    const paidAmount = cleanCurrencyAmount(matches.rawPaidAmount);
    const paymentDate = parseFlexibleDate(matches.rawPaymentDate);

    if (paidAmount === undefined) {
      return {
        success: false,
        error: "Could not extract Payment Amount from SBI payment confirmation email.",
        rawMatches: matches,
      };
    }

    if (config?.cardLast4 && matches.rawCardDigits && matches.rawCardDigits !== config.cardLast4) {
      return {
        success: false,
        error: `SBI payment is for card ending ${matches.rawCardDigits}, expected ${config.cardLast4}.`,
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
