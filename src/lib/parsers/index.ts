import { EmailConfig, ParserConfigField, ParserTestResult } from "../subscriptionTypes";
import { AxisCardParser } from "./axisParser";
import { IStatementParser } from "./base";
import { CustomRegexParser, GenericUtilityParser } from "./genericParser";
import { HDFCCardParser } from "./hdfcParser";
import { ICICICardParser } from "./iciciParser";
import { SBICardParser } from "./sbiParser";
import { UPIPaymentParser } from "./upiParser";
import { UniversalAutoParser } from "./universalParser";
import { HomefyParser } from "./homefyParser";
import { AirtelPostpaidParser } from "./airtelPostpaidParser";
import { JewellerySchemeParser } from "./jewelleryParser";
import { LoanSmsParser } from "./loanSmsParser";

export * from "./base";
export * from "./axisParser";
export * from "./genericParser";
export * from "./hdfcParser";
export * from "./iciciParser";
export * from "./sbiParser";
export * from "./upiParser";
export * from "./universalParser";
export * from "./homefyParser";
export * from "./airtelPostpaidParser";
export * from "./jewelleryParser";
export * from "./loanSmsParser";

export const BUILT_IN_PARSERS: Record<string, () => IStatementParser> = {
  UniversalAutoParser: () => new UniversalAutoParser(),
  AirtelPostpaidParser: () => new AirtelPostpaidParser(),
  HDFCCardParser: () => new HDFCCardParser(),
  UPIPaymentParser: () => new UPIPaymentParser(),
  ICICICardParser: () => new ICICICardParser(),
  AxisCardParser: () => new AxisCardParser(),
  SBICardParser: () => new SBICardParser(),
  HomefyParser: () => new HomefyParser(),
  JewellerySchemeParser: () => new JewellerySchemeParser(),
  GenericUtilityParser: () => new GenericUtilityParser(),
  LoanSmsParser: () => new LoanSmsParser(),
};

export type ParserType = "STATEMENT" | "PAYMENT_RECEIPT" | "DUAL" | "SMS_DEBIT";

export interface ParserMetadata {
  id: string;
  name: string;
  type: ParserType;
  category: "Cards" | "UPI & Debits" | "Utilities" | "Gold & Schemes" | "SMS & Loans" | "Advanced";
  description: string;
  statementTitle?: string;
  paymentTitle?: string;
  sampleStatementQuery: string;
  samplePaymentQuery: string;
  configFields?: ParserConfigField[];
}

const PARSER_TYPE_MAP: Record<string, { type: ParserType; category: ParserMetadata["category"]; statementTitle?: string; paymentTitle?: string }> = {
  UniversalAutoParser: {
    type: "DUAL",
    category: "Advanced",
    statementTitle: "Universal Bill Dues Extractor",
    paymentTitle: "Universal Payment Matcher",
  },
  AirtelPostpaidParser: {
    type: "DUAL",
    category: "Utilities",
    statementTitle: "Google Pay BBPS / Airtel Postpaid Bill",
    paymentTitle: "Airtel Payment Receipt Confirmation",
  },
  HDFCCardParser: {
    type: "DUAL",
    category: "Cards",
    statementTitle: "HDFC Bank Credit Card Statement",
    paymentTitle: "HDFC Card Payment Received Alert",
  },
  UPIPaymentParser: {
    type: "PAYMENT_RECEIPT",
    category: "UPI & Debits",
    paymentTitle: "UPI & NetBanking Debit Alert (GPay/CRED/HDFC)",
  },
  ICICICardParser: {
    type: "DUAL",
    category: "Cards",
    statementTitle: "ICICI & Amazon Pay Card Statement",
    paymentTitle: "ICICI Card Payment Confirmation",
  },
  AxisCardParser: {
    type: "DUAL",
    category: "Cards",
    statementTitle: "Axis Bank Credit Card Statement",
    paymentTitle: "Axis Bank Card Payment Alert",
  },
  SBICardParser: {
    type: "DUAL",
    category: "Cards",
    statementTitle: "SBI Credit Card e-Statement",
    paymentTitle: "SBI Card Payment Confirmation",
  },
  HomefyParser: {
    type: "DUAL",
    category: "Utilities",
    statementTitle: "Homefy Water & Maintenance Bill",
    paymentTitle: "Homefy Water Payment Receipt",
  },
  JewellerySchemeParser: {
    type: "DUAL",
    category: "Gold & Schemes",
    statementTitle: "Jewellery Monthly Scheme Statement",
    paymentTitle: "GRT / Tanishq Chit Payment Receipt",
  },
  GenericUtilityParser: {
    type: "DUAL",
    category: "Utilities",
    statementTitle: "Telecom, Electricity & Utility Invoices",
    paymentTitle: "Generic Utility Payment Receipt",
  },
  LoanSmsParser: {
    type: "SMS_DEBIT",
    category: "SMS & Loans",
    statementTitle: "Loan Recovery SMS Dues",
    paymentTitle: "Bank Home Loan & EMI Debit Alert (SMS)",
  },
};

export function getAvailableParsers(): ParserMetadata[] {
  const list: ParserMetadata[] = Object.values(BUILT_IN_PARSERS).map((factory) => {
    const p = factory();
    const meta = PARSER_TYPE_MAP[p.id] || { type: "DUAL", category: "Advanced" };
    return {
      id: p.id,
      name: p.name,
      type: meta.type,
      category: meta.category,
      description: p.description,
      statementTitle: meta.statementTitle,
      paymentTitle: meta.paymentTitle,
      sampleStatementQuery: p.sampleStatementQuery,
      samplePaymentQuery: p.samplePaymentQuery,
      configFields: p.configFields,
    };
  });

  list.push({
    id: "CustomRegexParser",
    name: "Custom Regex Pattern (Advanced)",
    type: "DUAL",
    category: "Advanced",
    statementTitle: "Custom Statement Regex Pattern",
    paymentTitle: "Custom Payment Regex Pattern",
    description: "Specify your own regular expressions with capture groups for custom providers.",
    sampleStatementQuery: 'from:billing@provider.com subject:"Invoice"',
    samplePaymentQuery: 'from:billing@provider.com subject:"Receipt"',
    configFields: new CustomRegexParser().configFields,
  });

  return list;
}

export function getStatementParsers(): ParserMetadata[] {
  return getAvailableParsers().filter((p) => p.type === "STATEMENT" || p.type === "DUAL");
}

export function getPaymentParsers(): ParserMetadata[] {
  return getAvailableParsers().filter((p) => p.type === "PAYMENT_RECEIPT" || p.type === "DUAL");
}

export function getSmsParsers(): ParserMetadata[] {
  return getAvailableParsers().filter((p) => p.type === "SMS_DEBIT");
}

export function getParserForModule(moduleName?: string, customRegex?: any): IStatementParser {
  if (moduleName === "CustomRegexParser" && customRegex) {
    return new CustomRegexParser(customRegex);
  }

  if (moduleName && moduleName !== "UniversalAutoParser" && BUILT_IN_PARSERS[moduleName]) {
    return BUILT_IN_PARSERS[moduleName]();
  }

  return new UniversalAutoParser();
}

export function getParserForConfig(config?: EmailConfig): IStatementParser {
  if (!config) {
    return new UniversalAutoParser();
  }

  return getParserForModule(config.parserModule, config.customRegex);
}

export function testParserOnContent(
  parserModule: string,
  content: string,
  subject = "",
  customRegex?: {
    statementAmountPattern?: string;
    statementDueDatePattern?: string;
    paymentAmountPattern?: string;
  },
  parserConfig?: Record<string, any>,
): ParserTestResult {
  const logs: string[] = [];
  logs.push(`[Sandbox] Testing parser module: "${parserModule || "UniversalAutoParser"}"`);
  logs.push(`[Sandbox] Subject length: ${subject.length}, Content length: ${content.length}`);
  if (parserConfig && Object.keys(parserConfig).length > 0) {
    logs.push(`[Sandbox] Parser Config: ${JSON.stringify(parserConfig)}`);
  }

  let parser: IStatementParser;
  if (parserModule === "CustomRegexParser") {
    parser = new CustomRegexParser(customRegex);
    logs.push(
      `[Sandbox] Custom Regex configured: statementAmountPattern="${customRegex?.statementAmountPattern || ""}", paymentAmountPattern="${customRegex?.paymentAmountPattern || ""}"`,
    );
  } else if (parserModule && BUILT_IN_PARSERS[parserModule]) {
    parser = BUILT_IN_PARSERS[parserModule]();
    logs.push(`[Sandbox] Loaded specialized parser: ${parser.name}`);
  } else {
    parser = new UniversalAutoParser();
    logs.push(`[Sandbox] Running Universal Auto-Detect Cascade Parser`);
  }

  const statementResult = parser.parseStatement(content, subject, parserConfig);
  logs.push(
    `[Sandbox] Statement Parse Result: ${
      statementResult.success
        ? `SUCCESS (Amount: ₹${statementResult.statementTotal}, DueDate: ${statementResult.dueDate})`
        : `FAILED (${statementResult.error})`
    }`,
  );

  const paymentResult = parser.parsePayment(content, subject, parserConfig);
  logs.push(
    `[Sandbox] Payment Parse Result: ${
      paymentResult.success
        ? `SUCCESS (Paid: ₹${paymentResult.paidAmount}, Date: ${paymentResult.paymentDate})`
        : `FAILED (${paymentResult.error})`
    }`,
  );

  return {
    parserModule: parser.id,
    statementResult,
    paymentResult,
    logs,
  };
}
