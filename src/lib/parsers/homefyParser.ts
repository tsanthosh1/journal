import { IStatementParser, parseFlexibleDate } from "./base";
import { ParsedPayment, ParsedStatement, ParserConfigField } from "../subscriptionTypes";

function cleanHtmlAndQuotedPrintable(raw: string): string {
  return raw
    .replace(/=3D/g, "=")
    .replace(/=\r?\n/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/=[0-9A-Fa-f]{2}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class HomefyParser implements IStatementParser {
  id = "HomefyParser";
  name = "Homefy Community (Water & Maintenance)";
  description = "Extracts apartment water bills, maintenance charges, and receipts from Homefy Community emails.";
  sampleStatementQuery = 'from:contact@homefy.co.in "Water Bill"';
  samplePaymentQuery = 'from:contact@homefy.co.in subject:"bill/receipt"';

  readonly configFields: ParserConfigField[] = [
    {
      key: "flatNumber",
      label: "Flat / Unit Number",
      type: "text",
      placeholder: "e.g. A-302 or 302",
      description: "Optional: Only match bills for this specific flat number",
    },
  ];

  canParse(from: string, subject: string, bodyText: string): boolean {
    const combined = `${from} ${subject} ${bodyText}`.toLowerCase();
    return (
      combined.includes("homefy") ||
      combined.includes("bounce-zem.homefy.co.in") ||
      combined.includes("bluemoon callisto") ||
      combined.includes("bill/receipt") ||
      combined.includes("water bill")
    );
  }

  parseStatement(content: string, subject = "", config?: Record<string, any>): ParsedStatement {
    const rawMatches: Record<string, string> = {};
    const text = cleanHtmlAndQuotedPrintable(content + " " + subject);

    // 1. Amount Extraction (Prioritize Total Amount Received / Actual Amount)
    let statementTotal: number | undefined;
    const totalReceivedMatch = text.match(/Total\s*Amount\s*(?:Received|Due|Billed)?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    const actualAmountMatch = text.match(/Actual\s*Amount[:\s]*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    const waterRowMatch = text.match(/(?:Water\s*Bill|Maintenance)\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*([A-Za-z0-9-]+)\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*([\d,]+(?:\.\d{1,2})?)/i);

    if (totalReceivedMatch && totalReceivedMatch[1]) {
      statementTotal = parseFloat(totalReceivedMatch[1].replace(/,/g, ""));
      rawMatches.statementTotal = totalReceivedMatch[0];
    } else if (actualAmountMatch && actualAmountMatch[1]) {
      statementTotal = parseFloat(actualAmountMatch[1].replace(/,/g, ""));
      rawMatches.statementTotal = actualAmountMatch[0];
    } else if (waterRowMatch && waterRowMatch[4]) {
      statementTotal = parseFloat(waterRowMatch[4].replace(/,/g, ""));
      rawMatches.statementTotal = waterRowMatch[0];
    }

    // 2. Due Date
    let dueDate: string | undefined;
    const dueMatch = text.match(/Due\s*on[:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);
    if (dueMatch && dueMatch[1]) {
      dueDate = parseDateToIso(dueMatch[1]) || undefined;
      if (dueDate) rawMatches.dueDate = dueMatch[0];
    } else if (waterRowMatch && waterRowMatch[3]) {
      dueDate = parseDateToIso(waterRowMatch[3]) || undefined;
      if (dueDate) rawMatches.dueDate = waterRowMatch[0];
    }

    // 3. Statement / Created on Date
    let statementDate: string | undefined;
    const createdMatch = text.match(/Created\s*on[:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);
    if (createdMatch && createdMatch[1]) {
      statementDate = parseDateToIso(createdMatch[1]) || undefined;
      if (statementDate) rawMatches.statementDate = createdMatch[0];
    } else if (waterRowMatch && waterRowMatch[1]) {
      statementDate = parseDateToIso(waterRowMatch[1]) || undefined;
      if (statementDate) rawMatches.statementDate = waterRowMatch[0];
    }

    // 4. Bill Number / Receipt Number
    let billNo: string | undefined;
    const receiptNoMatch = text.match(/Receipt\s*Number[:\s]*([A-Za-z0-9-]+)/i);
    if (receiptNoMatch && receiptNoMatch[1]) {
      billNo = receiptNoMatch[1];
      rawMatches.billNo = receiptNoMatch[0];
    } else if (waterRowMatch && waterRowMatch[2]) {
      billNo = waterRowMatch[2];
      rawMatches.billNo = waterRowMatch[0];
    }

    if (statementTotal === undefined || isNaN(statementTotal) || statementTotal <= 0) {
      return {
        success: false,
        error: "Could not extract Homefy statement amount.",
      };
    }

    return {
      success: true,
      statementTotal,
      dueDate,
      statementDate,
      accountOrCardDigits: billNo,
      referenceId: billNo,
      rawMatches,
    };
  }

  parsePayment(content: string, subject = "", config?: Record<string, any>): ParsedPayment {
    const rawMatches: Record<string, string> = {};
    const text = cleanHtmlAndQuotedPrintable(content + " " + subject);

    // 1. Amount Paid
    let paidAmount: number | undefined;
    const totalReceivedMatch = text.match(/Total\s*Amount\s*Received\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    const actualAmountMatch = text.match(/Actual\s*Amount[:\s]*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    const waterRowMatch = text.match(/(?:Water\s*Bill|Maintenance)\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*([A-Za-z0-9-]+)\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*([\d,]+(?:\.\d{1,2})?)/i);

    if (totalReceivedMatch && totalReceivedMatch[1]) {
      paidAmount = parseFloat(totalReceivedMatch[1].replace(/,/g, ""));
      rawMatches.paidAmount = totalReceivedMatch[0];
    } else if (actualAmountMatch && actualAmountMatch[1]) {
      paidAmount = parseFloat(actualAmountMatch[1].replace(/,/g, ""));
      rawMatches.paidAmount = actualAmountMatch[0];
    } else if (waterRowMatch && waterRowMatch[4]) {
      paidAmount = parseFloat(waterRowMatch[4].replace(/,/g, ""));
      rawMatches.paidAmount = waterRowMatch[0];
    }

    // 2. Payment / Receipt Date
    let paymentDate: string | undefined;
    const receiptDateMatch = text.match(/Receipt\s*Date[:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);
    if (receiptDateMatch && receiptDateMatch[1]) {
      paymentDate = parseDateToIso(receiptDateMatch[1]) || undefined;
      if (paymentDate) rawMatches.paymentDate = receiptDateMatch[0];
    }

    // 3. Transaction ID
    let txnId: string | undefined;
    const txnMatch = text.match(/Transaction\s*ID[:\s]*([A-Za-z0-9]+)/i);
    if (txnMatch && txnMatch[1]) {
      txnId = txnMatch[1];
      rawMatches.transactionId = txnMatch[0];
    }

    if (paidAmount === undefined || isNaN(paidAmount) || paidAmount <= 0) {
      return {
        success: false,
        error: "Could not extract Homefy receipt amount.",
      };
    }

    return {
      success: true,
      paidAmount,
      paymentDate,
      referenceId: txnId,
      rawMatches,
    };
  }
}

function parseDateToIso(dateStr: string): string | null {
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length === 3) {
    let day = parts[0];
    let month = parts[1];
    let year = parts[2];

    if (year.length === 2) year = "20" + year;
    if (day.length === 1) day = "0" + day;
    if (month.length === 1) month = "0" + month;

    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    }

    return `${year}-${month}-${day}`;
  }
  return null;
}
