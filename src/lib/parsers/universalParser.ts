import { ParsedPayment, ParsedStatement } from "../subscriptionTypes";
import { AxisCardParser } from "./axisParser";
import { IStatementParser } from "./base";
import { GenericUtilityParser } from "./genericParser";
import { HDFCCardParser } from "./hdfcParser";
import { ICICICardParser } from "./iciciParser";
import { JewellerySchemeParser } from "./jewelleryParser";
import { SBICardParser } from "./sbiParser";
import { UPIPaymentParser } from "./upiParser";
import { HomefyParser } from "./homefyParser";

/**
 * Universal Auto-Parser:
 * Cascades across all deterministic parser strategies and returns the first high-confidence match.
 * Eliminates the need for users to manually select or specify a "parserModule".
 */
export class UniversalAutoParser implements IStatementParser {
  readonly id = "UniversalAutoParser";
  readonly name = "Universal Auto-Detect Parser";
  readonly description =
    "Automatically recognizes bank card e-statements, UPI transaction receipts, utility bills, jewellery savings schemes, apartment maintenance receipts, and telecom invoices.";
  readonly sampleStatementQuery = 'subject:("Statement" OR "Bill" OR "Invoice" OR "Advance")';
  readonly samplePaymentQuery = 'subject:("Payment" OR "Receipt" OR "debited" OR "credited" OR "Advance payment")';

  private readonly statementParsers: IStatementParser[] = [
    new HomefyParser(),
    new AxisCardParser(),
    new HDFCCardParser(),
    new ICICICardParser(),
    new SBICardParser(),
    new GenericUtilityParser(),
    new JewellerySchemeParser(),
  ];

  private readonly paymentParsers: IStatementParser[] = [
    new HomefyParser(),
    new JewellerySchemeParser(),
    new UPIPaymentParser(),
    new HDFCCardParser(),
    new AxisCardParser(),
    new ICICICardParser(),
    new SBICardParser(),
    new GenericUtilityParser(),
  ];

  parseStatement(content: string, subject = ""): ParsedStatement {
    let lastError = "No statement parser matched the email format.";

    for (const parser of this.statementParsers) {
      try {
        const result = parser.parseStatement(content, subject);
        if (result.success && result.statementTotal !== undefined) {
          return result;
        }
        if (result.error) {
          lastError = result.error;
        }
      } catch {
        // Try next parser
      }
    }

    return {
      success: false,
      error: lastError,
    };
  }

  parsePayment(content: string, subject = ""): ParsedPayment {
    let lastError = "No payment pattern matched the email format.";

    for (const parser of this.paymentParsers) {
      try {
        const result = parser.parsePayment(content, subject);
        if (result.success && result.paidAmount !== undefined && result.paidAmount > 0) {
          return result;
        }
        if (result.error) {
          lastError = result.error;
        }
      } catch {
        // Try next parser
      }
    }

    return {
      success: false,
      error: lastError,
    };
  }
}
