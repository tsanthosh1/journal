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

export interface ParserMetadata {
  id: string;
  name: string;
  description: string;
  sampleStatementQuery: string;
  samplePaymentQuery: string;
  configFields?: ParserConfigField[];
}

export function getAvailableParsers(): ParserMetadata[] {
  const list: ParserMetadata[] = Object.values(BUILT_IN_PARSERS).map((factory) => {
    const p = factory();
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      sampleStatementQuery: p.sampleStatementQuery,
      samplePaymentQuery: p.samplePaymentQuery,
      configFields: p.configFields,
    };
  });

  list.push({
    id: "CustomRegexParser",
    name: "Custom Regex Pattern (Advanced)",
    description: "Specify your own regular expressions with capture groups for custom providers.",
    sampleStatementQuery: 'from:billing@provider.com subject:"Invoice"',
    samplePaymentQuery: 'from:billing@provider.com subject:"Receipt"',
    configFields: new CustomRegexParser().configFields,
  });

  return list;
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
