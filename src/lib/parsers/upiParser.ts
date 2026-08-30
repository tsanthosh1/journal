import { ParsedPayment, ParsedStatement } from "../subscriptionTypes";
import {
  cleanCurrencyAmount,
  IStatementParser,
  parseFlexibleDate,
  stripHtmlAndCleanText,
} from "./base";

export class UPIPaymentParser implements IStatementParser {
  readonly id = "UPIPaymentParser";
  readonly name = "UPI Credit Card Payment Parser";
  readonly description =
    "Extracts payments made via UPI (GPay, CRED, PhonePe, Paytm, BBPS) towards credit cards or utilities.";
  readonly sampleStatementQuery =
    'from:statements@hdfcbank.net subject:"Statement"';
  readonly samplePaymentQuery =
    'from:alerts@hdfcbank.bank.in "VPA" "gpay-creditcard@okpayaxis"';

  parseStatement(content: string, subject = ""): ParsedStatement {
    // UPI alerts are payment alerts. If used for statement, fallback to base extraction
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);
    const matches: Record<string, string> = {};

    const amountMatch = cleanText.match(
      /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{2})?)/i,
    );
    if (amountMatch) matches.rawAmount = amountMatch[1];

    const total = cleanCurrencyAmount(matches.rawAmount);
    return {
      success: total !== undefined,
      statementTotal: total || 0,
      dueDate: new Date().toISOString().split("T")[0],
      rawMatches: matches,
    };
  }

  parsePayment(content: string, subject = ""): ParsedPayment {
    const raw = `${subject}\n${content}`;
    const cleanText = stripHtmlAndCleanText(raw);

    const matches: Record<string, string> = {};

    // 1. Extract Paid Amount
    // Example: "Rs.70000.00 is debited from your account ending 6013 towards VPA gpay-creditcard@okpayaxis"
    const amountRegexes = [
      /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:is|has\s+been)\s+debited\s+from\s+your\s+account/i,
      /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:debited|transferred|sent)/i,
      /debited\s+(?:by|with|of)?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /towards\s+VPA\s+.*?([0-9,]+(?:\.[0-9]{2})?)/i,
      /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{2})?)/i,
    ];

    for (const rx of amountRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawPaidAmount = match[1];
        break;
      }
    }

    // 2. Extract VPA / Payee
    const vpaRegexes = [
      /towards\s+VPA\s+([a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+(?:\s*\([^)]*\))?)/i,
      /to\s+VPA\s+([a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+(?:\s*\([^)]*\))?)/i,
      /VPA\s*[:\-]?\s*([a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+)/i,
    ];

    for (const rx of vpaRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawVPA = match[1].trim();
        break;
      }
    }

    // 3. Extract Payment Date
    // Example: "...on 29-08-26."
    const dateRegexes = [
      /on\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /(?:dated|date)\s*[:\-]?\s*(\d{1,2}[-/\s]+[a-zA-Z]{3,9}[-/\s]+\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    ];

    for (const rx of dateRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawPaymentDate = match[1];
        break;
      }
    }

    // 4. Extract Account digits
    const accountRegexes = [
      /account\s+ending\s+(?:in\s+)?(\d{4})/i,
      /A\/c\s+(?:ending\s+)?(?:\*+|X+)?(\d{4})/i,
    ];

    for (const rx of accountRegexes) {
      const match = cleanText.match(rx);
      if (match && match[1]) {
        matches.rawAccountDigits = match[1];
        break;
      }
    }

    // 5. Extract UPI Reference Number
    // Example: "UPI transaction reference no.: 128680903509."
    const refRegexes = [
      /UPI\s+transaction\s+reference\s+no\.?\s*[:\-]?\s*([0-9A-Za-z]+)/i,
      /(?:reference|ref|rrn|txn)\s*(?:no\.?|id)?\s*[:\-]?\s*([0-9A-Za-z]+)/i,
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
        error: "Could not extract debited UPI payment amount.",
        rawMatches: matches,
      };
    }

    return {
      success: true,
      paidAmount,
      paymentDate: paymentDate ?? new Date().toISOString().split("T")[0],
      referenceId: matches.rawRef,
      accountOrCardDigits: matches.rawAccountDigits,
      rawMatches: matches,
    };
  }
}
