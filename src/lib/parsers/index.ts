import { EmailConfig, ParserTestResult } from "../subscriptionTypes";
import { AxisCardParser } from "./axisParser";
import { IStatementParser } from "./base";
import { CustomRegexParser, GenericUtilityParser } from "./genericParser";
import { HDFCCardParser } from "./hdfcParser";
import { ICICICardParser } from "./iciciParser";
import { SBICardParser } from "./sbiParser";
import { UPIPaymentParser } from "./upiParser";
import { UniversalAutoParser } from "./universalParser";

export * from "./base";
export * from "./axisParser";
export * from "./genericParser";
export * from "./hdfcParser";
export * from "./iciciParser";
export * from "./sbiParser";
export * from "./upiParser";
export * from "./universalParser";

export const BUILT_IN_PARSERS: Record<string, () => IStatementParser> = {
  UniversalAutoParser: () => new UniversalAutoParser(),
  HDFCCardParser: () => new HDFCCardParser(),
  UPIPaymentParser: () => new UPIPaymentParser(),
  ICICICardParser: () => new ICICICardParser(),
  SBICardParser: () => new SBICardParser(),
  AxisCardParser: () => new AxisCardParser(),
  GenericUtilityParser: () => new GenericUtilityParser(),
};

export interface ParserMetadata {
  id: string;
  name: string;
  description: string;
  sampleStatementQuery: string;
  samplePaymentQuery: string;
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
    };
  });

  list.push({
    id: "CustomRegexParser",
    name: "Custom Regex Pattern (Advanced)",
    description: "Specify your own regular expressions with capture groups for custom providers.",
    sampleStatementQuery: 'from:billing@provider.com subject:"Invoice"',
    samplePaymentQuery: 'from:billing@provider.com subject:"Receipt"',
  });

  return list;
}

export function getParserForConfig(config?: EmailConfig): IStatementParser {
  if (!config) {
    return new UniversalAutoParser();
  }

  if (config.parserModule === "CustomRegexParser" && config.customRegex) {
    return new CustomRegexParser(config.customRegex);
  }

  if (config.parserModule && config.parserModule !== "UniversalAutoParser" && BUILT_IN_PARSERS[config.parserModule]) {
    return BUILT_IN_PARSERS[config.parserModule]();
  }

  // Default to UniversalAutoParser which automatically cascades across all built-in parsers
  return new UniversalAutoParser();
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
): ParserTestResult {
  const logs: string[] = [];
  logs.push(`[Sandbox] Testing parser module: "${parserModule || "UniversalAutoParser"}"`);
  logs.push(`[Sandbox] Subject length: ${subject.length}, Content length: ${content.length}`);

  let parser: IStatementParser;
  if (parserModule === "CustomRegexParser") {
    parser = new CustomRegexParser(customRegex);
    logs.push(
      `[Sandbox] Custom Regex configured: statementAmountPattern="${customRegex?.statementAmountPattern || ""}", paymentAmountPattern="${customRegex?.paymentAmountPattern || ""}"`,
    );
  } else if (parserModule && BUILT_IN_PARSERS[parserModule]) {
    parser = BUILT_IN_PARSERS[parserModule]();
    logs.push(`[Sandbox] Loaded built-in parser: ${parser.name}`);
  } else {
    parser = new UniversalAutoParser();
    logs.push(`[Sandbox] Running Universal Auto-Detect Cascade Parser`);
  }

  const statementResult = parser.parseStatement(content, subject);
  logs.push(
    `[Sandbox] Statement Parse Result: ${
      statementResult.success
        ? `SUCCESS (Amount: ₹${statementResult.statementTotal}, DueDate: ${statementResult.dueDate})`
        : `FAILED (${statementResult.error})`
    }`,
  );

  const paymentResult = parser.parsePayment(content, subject);
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
