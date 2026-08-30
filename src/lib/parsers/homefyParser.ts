import { IStatementParser } from "./base";
import { ParsedPayment, ParsedStatement } from "../subscriptionTypes";

export class HomefyParser implements IStatementParser {
  id = "HomefyParser";
  name = "Homefy Community (Water & Maintenance)";
  description = "Extracts apartment water bills, maintenance charges, and receipts from Homefy Community emails.";
  sampleStatementQuery = 'from:contact@homefy.co.in "Water Bill"';
  samplePaymentQuery = 'from:contact@homefy.co.in subject:"bill/receipt"';

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

  parseStatement(content: string, subject = ""): ParsedStatement {
    const rawMatches: Record<string, string> = {};
    const text = (content + " " + subject).replace(/\r\n/g, " ").replace(/\n/g, " ");

    // Amount extraction:
    // "Total Amount Received Rs 1200" or "Actual Amount: 1200" or "Amount(Rs) ... 1200"
    let statementTotal: number | undefined;
    const amountMatch =
      text.match(/Total\s*Amount\s*(?:Received|Due|Billed)?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
      text.match(/Actual\s*Amount[:\s]*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
      text.match(/(?:Water\s*Bill|Maintenance).*?(\d{2,6})/i);

    if (amountMatch && amountMatch[1]) {
      const parsed = parseFloat(amountMatch[1].replace(/,/g, ""));
      if (!isNaN(parsed) && parsed > 0) {
        statementTotal = parsed;
        rawMatches.statementTotal = amountMatch[0];
      }
    }

    // Due Date extraction: "Due on: 09-08-2026" or "Due on ... 09-08-2026"
    let dueDate: string | undefined;
    const dueMatch =
      text.match(/Due\s*(?:on|Date)?[:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i) ||
      text.match(/(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/);

    if (dueMatch && dueMatch[1]) {
      dueDate = parseDateToIso(dueMatch[1]) || undefined;
      if (dueDate) rawMatches.dueDate = dueMatch[0];
    }

    // Statement / Created on Date: "Created on: 02-08-2026"
    let statementDate: string | undefined;
    const createdMatch = text.match(/Created\s*(?:on|Date)?[:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);
    if (createdMatch && createdMatch[1]) {
      statementDate = parseDateToIso(createdMatch[1]) || undefined;
      if (statementDate) rawMatches.statementDate = createdMatch[0];
    }

    // Bill Number: "Bill No. BI-STO-1273" or "Receipt Number: REC-BI-STO-1273"
    let billNo: string | undefined;
    const billMatch =
      text.match(/Bill\s*No\.?[:\s]*([a-zA-Z0-9-]+)/i) ||
      text.match(/Receipt\s*Number[:\s]*([a-zA-Z0-9-]+)/i);
    if (billMatch && billMatch[1]) {
      billNo = billMatch[1];
      rawMatches.billNo = billMatch[0];
    }

    if (statementTotal === undefined) {
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

  parsePayment(content: string, subject = ""): ParsedPayment {
    const rawMatches: Record<string, string> = {};
    const text = (content + " " + subject).replace(/\r\n/g, " ").replace(/\n/g, " ");

    // Amount Paid: "Total Amount Received Rs 1200" or "Actual Amount: 1200"
    let paidAmount: number | undefined;
    const amountMatch =
      text.match(/Total\s*Amount\s*Received\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
      text.match(/Actual\s*Amount[:\s]*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
      text.match(/Amount\(Rs\).*?(\d{2,6})/i);

    if (amountMatch && amountMatch[1]) {
      const parsed = parseFloat(amountMatch[1].replace(/,/g, ""));
      if (!isNaN(parsed) && parsed > 0) {
        paidAmount = parsed;
        rawMatches.paidAmount = amountMatch[0];
      }
    }

    // Payment / Receipt Date: "Receipt Date: 17-08-2026"
    let paymentDate: string | undefined;
    const receiptDateMatch = text.match(/Receipt\s*Date[:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);
    if (receiptDateMatch && receiptDateMatch[1]) {
      paymentDate = parseDateToIso(receiptDateMatch[1]) || undefined;
      if (paymentDate) rawMatches.paymentDate = receiptDateMatch[0];
    }

    // Transaction ID: "Transaction ID: 312680429963"
    let txnId: string | undefined;
    const txnMatch = text.match(/Transaction\s*ID[:\s]*([a-zA-Z0-9]+)/i);
    if (txnMatch && txnMatch[1]) {
      txnId = txnMatch[1];
      rawMatches.transactionId = txnMatch[0];
    }

    if (paidAmount === undefined) {
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

    // Check if format is YYYY-MM-DD or DD-MM-YYYY
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    }

    return `${year}-${month}-${day}`;
  }
  return null;
}
