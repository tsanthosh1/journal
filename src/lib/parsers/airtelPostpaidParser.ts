import { IStatementParser, parseFlexibleDate, stripHtmlAndCleanText } from "./base";
import { ParsedPayment, ParsedStatement, ParserConfigField } from "../subscriptionTypes";

function decodeBase64IfPresent(raw: string): string {
  // If raw body contains base64 encoded text part
  const b64Match = raw.match(/Content-Transfer-Encoding:\s*base64\s+([A-Za-z0-9+/=\r\n]{50,})/i);
  if (b64Match) {
    try {
      const cleanB64 = b64Match[1].replace(/\r?\n/g, "");
      const decoded = Buffer.from(cleanB64, "base64").toString("utf8");
      return raw + " " + decoded;
    } catch {
      // ignore
    }
  }
  return raw;
}

export class AirtelPostpaidParser implements IStatementParser {
  readonly id = "AirtelPostpaidParser";
  readonly name = "Google Pay BBPS / Airtel Postpaid Parser";
  readonly description =
    "Extracts Google Pay BBPS bill emails ('New bill from Airtel Postpaid Mobile') and official Airtel payment receipts.";
  readonly sampleStatementQuery = 'from:google-pay-noreply@google.com "Airtel Mobile Postpaid"';
  readonly samplePaymentQuery = 'from:update@airtel.com subject:("payment receipt" OR "Payment Confirmation")';

  readonly configFields: ParserConfigField[] = [
    {
      key: "accountOrMobile",
      label: "Mobile Number / Account No",
      type: "text",
      placeholder: "e.g. 9876543210",
      description: "Optional: Only match bills or receipts mentioning this number",
    },
  ];

  canParse(from: string, subject: string, bodyText: string): boolean {
    const combined = `${from} ${subject} ${bodyText}`.toLowerCase();
    return (
      combined.includes("airtel") ||
      combined.includes("airtel postpaid") ||
      combined.includes("airtel broadband") ||
      combined.includes("ebill@airtel.com") ||
      combined.includes("update@airtel.com")
    );
  }

  parseStatement(content: string, subject = "", config?: Record<string, any>): ParsedStatement {
    const rawMatches: Record<string, string> = {};
    const fullText = decodeBase64IfPresent(content);
    const text = stripHtmlAndCleanText(`${subject} ${fullText}`);

    // 1. Amount Due Extraction
    let statementTotal: number | undefined;

    // Pattern A: Google Pay BBPS / Airtel Bill Amount: "Bill Amount: ₹529.82" / "Bill Amount: Rs. 529.82"
    const billAmountMatch = text.match(/Bill\s*Amount[:\s]*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    // Pattern B: Total Amount Due / Amount Payable: "Amount Payable: ₹529.82"
    const payableMatch = text.match(/(?:Total\s*Amount\s*Due|Amount\s*Payable|Total\s*Payable)[:\s]*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    // Pattern C: "bill of ₹529.82 generated"
    const billGeneratedMatch = text.match(/bill\s*of\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i);

    if (billAmountMatch && billAmountMatch[1]) {
      statementTotal = parseFloat(billAmountMatch[1].replace(/,/g, ""));
      rawMatches.statementTotal = billAmountMatch[0];
    } else if (payableMatch && payableMatch[1]) {
      statementTotal = parseFloat(payableMatch[1].replace(/,/g, ""));
      rawMatches.statementTotal = payableMatch[0];
    } else if (billGeneratedMatch && billGeneratedMatch[1]) {
      statementTotal = parseFloat(billGeneratedMatch[1].replace(/,/g, ""));
      rawMatches.statementTotal = billGeneratedMatch[0];
    }

    // 2. Due Date Extraction
    let dueDate: string | undefined;
    // Pattern A: "Due Date: Aug 16, 2026" or "Due Date: 16-Aug-2026"
    const dueMatch = text.match(/Due\s*Date[:\s]*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[-/ ](?:[A-Za-z]{3}|\d{1,2})[-/ ]\d{2,4})/i);
    // Pattern B: "Pay by: 16/08/2026"
    const payByMatch = text.match(/Pay\s*(?:by|before)[:\s]*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[-/ ](?:[A-Za-z]{3}|\d{1,2})[-/ ]\d{2,4})/i);

    if (dueMatch && dueMatch[1]) {
      dueDate = parseFlexibleDate(dueMatch[1]) || undefined;
      if (dueDate) rawMatches.dueDate = dueMatch[0];
    } else if (payByMatch && payByMatch[1]) {
      dueDate = parseFlexibleDate(payByMatch[1]) || undefined;
      if (dueDate) rawMatches.dueDate = payByMatch[0];
    }

    // 3. Bill / Statement Date Extraction
    let statementDate: string | undefined;
    const stmtDateMatch = text.match(/(?:Bill\s*Date|Invoice\s*Date|Statement\s*Date)[:\s]*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[-/ ](?:[A-Za-z]{3}|\d{1,2})[-/ ]\d{2,4})/i);
    if (stmtDateMatch && stmtDateMatch[1]) {
      statementDate = parseFlexibleDate(stmtDateMatch[1]) || undefined;
      if (statementDate) rawMatches.statementDate = stmtDateMatch[0];
    }

    // 4. Account Number / Mobile Number
    let accountNumber: string | undefined;
    const mobileMatch = text.match(/(?:Mobile\s*(?:No|Number)|Relationship\s*No|Account\s*No)[:\s]*([0-9]{8,12})/i);
    if (mobileMatch && mobileMatch[1]) {
      accountNumber = mobileMatch[1];
      rawMatches.accountNumber = mobileMatch[0];
    }

    if (statementTotal === undefined || isNaN(statementTotal) || statementTotal <= 0) {
      return {
        success: false,
        error: "Could not extract Airtel statement/bill amount.",
      };
    }

    return {
      success: true,
      statementTotal,
      dueDate,
      statementDate,
      accountOrCardDigits: accountNumber,
      rawMatches,
    };
  }

  parsePayment(content: string, subject = "", config?: Record<string, any>): ParsedPayment {
    const rawMatches: Record<string, string> = {};
    const fullText = decodeBase64IfPresent(content);
    const text = stripHtmlAndCleanText(`${subject} ${fullText}`);

    // 1. Payment Amount Extraction
    let paidAmount: number | undefined;

    // Pattern A: "received a payment of ₹529.82 for your Bill payment"
    const receivedMatch = text.match(/received\s*a\s*payment\s*of\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    // Pattern B: "payment of ₹529.82 towards your Airtel"
    const paymentOfMatch = text.match(/payment\s*of\s*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:towards|for|received|successful)/i);
    // Pattern C: "Amount Paid: ₹529.82"
    const amountPaidMatch = text.match(/(?:Amount\s*Paid|Total\s*Paid)[:\s]*(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{1,2})?)/i);

    if (receivedMatch && receivedMatch[1]) {
      paidAmount = parseFloat(receivedMatch[1].replace(/,/g, ""));
      rawMatches.paidAmount = receivedMatch[0];
    } else if (paymentOfMatch && paymentOfMatch[1]) {
      paidAmount = parseFloat(paymentOfMatch[1].replace(/,/g, ""));
      rawMatches.paidAmount = paymentOfMatch[0];
    } else if (amountPaidMatch && amountPaidMatch[1]) {
      paidAmount = parseFloat(amountPaidMatch[1].replace(/,/g, ""));
      rawMatches.paidAmount = amountPaidMatch[0];
    }

    // 2. Payment Date Extraction
    let paymentDate: string | undefined;
    const paidDateMatch = text.match(/(?:Payment\s*Date|Paid\s*on|Transaction\s*Date)[:\s]*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[-/ ](?:[A-Za-z]{3}|\d{1,2})[-/ ]\d{2,4})/i);
    if (paidDateMatch && paidDateMatch[1]) {
      paymentDate = parseFlexibleDate(paidDateMatch[1]) || undefined;
      if (paymentDate) rawMatches.paymentDate = paidDateMatch[0];
    }

    // 3. Reference / Transaction ID
    let referenceId: string | undefined;
    const refMatch = text.match(/(?:Transaction\s*ID|Receipt\s*No|Reference\s*No|Order\s*ID)[:\s]*([A-Za-z0-9-]+)/i);
    if (refMatch && refMatch[1]) {
      referenceId = refMatch[1];
      rawMatches.referenceId = refMatch[0];
    }

    if (paidAmount === undefined || isNaN(paidAmount) || paidAmount <= 0) {
      return {
        success: false,
        error: "Could not extract Airtel payment amount.",
      };
    }

    return {
      success: true,
      paidAmount,
      paymentDate,
      referenceId,
      rawMatches,
    };
  }
}
