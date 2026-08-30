import { ParsedPayment, ParsedStatement } from "../subscriptionTypes";
import { IStatementParser } from "./base";

/**
 * Jewellery & Savings Scheme Parser
 *
 * Supports gold savings schemes, monthly advance purchase plans, and jewellery chits:
 * - GRT Jewellers (GRT JPS Advance Payment, Membership Number, Scheme Amount)
 * - Tanishq (Golden Harvest Scheme, Installment Confirmation)
 * - Kalyan Jewellers (Dhanvarsha / Purchase Advance)
 * - Jos Alukkas / Joyalukkas / Malabar Gold monthly savings schemes
 * - Generic jewellery / chit purchase plans with Scheme/Installment Amount
 */
export class JewellerySchemeParser implements IStatementParser {
  readonly id = "JewellerySchemeParser";
  readonly name = "Jewellery & Savings Scheme Parser";
  readonly description =
    "Extracts monthly installment amounts, membership IDs, and advance payment receipts for GRT JPS, Tanishq Golden Harvest, and gold schemes.";
  readonly sampleStatementQuery =
    'from:(mail@grtjewels.com OR tanishq OR kalyanjewellers OR joyalukkas) subject:("Advance" OR "Scheme" OR "Receipt" OR "Payment")';
  readonly samplePaymentQuery =
    'from:(mail@grtjewels.com OR tanishq OR kalyanjewellers OR joyalukkas) subject:("Advance payment" OR "Receipt" OR "Confirmation")';

  parseStatement(content: string, subject = ""): ParsedStatement {
    // For voluntary / advance schemes, the advance payment receipt is often the primary record
    const payResult = this.parsePayment(content, subject);
    if (payResult.success) {
      return {
        success: true,
        statementTotal: payResult.paidAmount,
        statementDate: payResult.paymentDate,
        accountOrCardDigits: payResult.accountOrCardDigits,
        referenceId: payResult.referenceId,
        rawMatches: payResult.rawMatches,
      };
    }

    return {
      success: false,
      error: "No jewellery scheme statement or invoice detected.",
    };
  }

  parsePayment(content: string, subject = ""): ParsedPayment {
    const rawMatches: Record<string, string> = {};

    // 1. Check Subject & Brand Signatures
    const isGRT =
      subject.toLowerCase().includes("grt") ||
      content.toLowerCase().includes("grtjewels") ||
      content.toLowerCase().includes("jewellery purchase plan") ||
      content.toLowerCase().includes("jps advance payment");

    const isTanishq =
      subject.toLowerCase().includes("tanishq") ||
      content.toLowerCase().includes("golden harvest");

    const isGenericScheme =
      subject.toLowerCase().includes("advance payment") ||
      content.toLowerCase().includes("jewellery purchase") ||
      content.toLowerCase().includes("gold scheme") ||
      content.toLowerCase().includes("scheme amount");

    if (!isGRT && !isTanishq && !isGenericScheme) {
      return {
        success: false,
        error: "Content does not match any jewellery or savings scheme signatures.",
      };
    }

    // 2. Extract Scheme Amount / Paid Amount
    // Matches: "Scheme Amount : 30000", "Scheme Amount: Rs. 30,000", "Installment Amount: 5000", "Paid Amount: 10000"
    const amountPatterns = [
      /Scheme\s+Amount\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /Installment\s+Amount\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /Advance\s+Amount\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /Payment\s+Amount\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /Amount\s+Paid\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{2})?)\s*(?:has\s+been\s+received|paid\s+towards|received\s+for)/i,
    ];

    let paidAmount: number | undefined;

    for (const pattern of amountPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        const cleaned = match[1].replace(/,/g, "");
        const parsed = parseFloat(cleaned);
        if (!isNaN(parsed) && parsed > 0) {
          paidAmount = parsed;
          rawMatches.amountMatch = match[0];
          break;
        }
      }
    }

    // 3. Extract Membership / Account / Group Code
    // Matches: "Membership Number : 9292", "Membership No: 12345", "Account No: 98765"
    let membershipNumber: string | undefined;
    const membershipMatch = content.match(
      /(?:Membership\s+(?:Number|No\.?)|Account\s+(?:Number|No\.?)|Folio\s+No\.?)\s*[:\-]?\s*([A-Za-z0-9\-_]+)/i,
    );
    if (membershipMatch && membershipMatch[1]) {
      membershipNumber = membershipMatch[1].trim();
      rawMatches.membershipNumber = membershipNumber;
    }

    // Group code / Branch
    let groupCode: string | undefined;
    const groupMatch = content.match(/Group\s+Code\s*[:\-]?\s*([A-Za-z0-9]+)/i);
    if (groupMatch && groupMatch[1]) {
      groupCode = groupMatch[1].trim();
      rawMatches.groupCode = groupCode;
    }

    let branchCode: string | undefined;
    const branchMatch = content.match(/Branch\s*[:\-]?\s*([A-Za-z0-9]+)/i);
    if (branchMatch && branchMatch[1]) {
      branchCode = branchMatch[1].trim();
      rawMatches.branchCode = branchCode;
    }

    const referenceId = [groupCode, branchCode, membershipNumber].filter(Boolean).join("/") || membershipNumber;

    // 4. Extract Date
    // E.g. "Date: Tue, 04 Aug 2026 12:03:21 +0000" or internalDate
    let paymentDate: string | undefined;
    const dateMatch = content.match(
      /Date:\s*[A-Za-z]+,\s*([0-9]{1,2})\s+([A-Za-z]{3,9})\s+([0-9]{4})/i,
    );
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, "0");
      const monthName = dateMatch[2].toLowerCase();
      const year = dateMatch[3];

      const monthMap: Record<string, string> = {
        jan: "01", january: "01",
        feb: "02", february: "02",
        mar: "03", march: "03",
        apr: "04", april: "04",
        may: "05",
        jun: "06", june: "06",
        jul: "07", july: "07",
        aug: "08", august: "08",
        sep: "09", september: "09",
        oct: "10", october: "10",
        nov: "11", november: "11",
        dec: "12", december: "12",
      };

      const mm = monthMap[monthName.slice(0, 3)];
      if (mm) {
        paymentDate = `${year}-${mm}-${day}`;
        rawMatches.paymentDate = paymentDate;
      }
    }

    if (paidAmount === undefined) {
      return {
        success: false,
        error: "Could not extract scheme or installment amount from email.",
      };
    }

    return {
      success: true,
      paidAmount,
      paymentDate,
      referenceId,
      accountOrCardDigits: membershipNumber,
      rawMatches,
    };
  }
}
