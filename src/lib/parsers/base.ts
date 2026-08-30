import { ParsedPayment, ParsedStatement } from "../subscriptionTypes";

export interface IStatementParser {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sampleStatementQuery: string;
  readonly samplePaymentQuery: string;

  parseStatement(content: string, subject?: string): ParsedStatement;
  parsePayment(content: string, subject?: string): ParsedPayment;
}

/**
 * Utility functions for parsing currency strings, dates, and clean email text
 */

export function stripHtmlAndCleanText(raw: string): string {
  if (!raw) return "";

  // Replace <br>, </p>, </div>, </tr> with newlines to preserve spacing
  let text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x20B9;|&INR;|Rs\.?|INR/gi, "Rs. ")
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n+/g, "\n");

  return text.trim();
}

/**
 * Cleans extracted currency strings e.g. "24,500.50", "24500", "24,500" into a float
 */
export function cleanCurrencyAmount(amountStr: string | undefined): number | undefined {
  if (!amountStr) return undefined;
  // Remove currency signs, commas, spaces
  const cleaned = amountStr.replace(/[^0-9.]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? undefined : Math.round(val * 100) / 100;
}

/**
 * Parses diverse date formats:
 * - "15-Aug-2026", "15/08/2026", "15-08-2026", "15 Aug 2026", "August 15, 2026", "2026-08-15"
 * Returns ISO "YYYY-MM-DD"
 */
export function parseFlexibleDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;

  const cleaned = dateStr.trim().replace(/,/g, "");

  // Check standard ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  const months: Record<string, string> = {
    jan: "01", january: "01",
    feb: "02", february: "02",
    mar: "03", march: "03",
    apr: "04", april: "04",
    may: "05",
    jun: "06", june: "06",
    jul: "07", july: "07",
    aug: "08", august: "08",
    sep: "09", sept: "09", september: "09",
    oct: "10", october: "10",
    nov: "11", november: "11",
    dec: "12", december: "12",
  };

  // Match DD-MMM-YYYY or DD MMM YYYY or DD/MMM/YYYY
  const m1 = cleaned.match(/^(\d{1,2})[-/\s]+([a-zA-Z]{3,9})[-/\s]+(\d{2,4})$/i);
  if (m1) {
    const day = m1[1].padStart(2, "0");
    const mStr = m1[2].toLowerCase();
    const month = months[mStr];
    let year = m1[3];
    if (year.length === 2) year = `20${year}`;
    if (month) return `${year}-${month}-${day}`;
  }

  // Match MMM DD YYYY e.g. "Aug 15 2026"
  const m2 = cleaned.match(/^([a-zA-Z]{3,9})[-/\s]+(\d{1,2})[-/\s]+(\d{2,4})$/i);
  if (m2) {
    const mStr = m2[1].toLowerCase();
    const month = months[mStr];
    const day = m2[2].padStart(2, "0");
    let year = m2[3];
    if (year.length === 2) year = `20${year}`;
    if (month) return `${year}-${month}-${day}`;
  }

  // Match DD/MM/YYYY or DD-MM-YYYY
  const m3 = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m3) {
    const day = m3[1].padStart(2, "0");
    const month = m3[2].padStart(2, "0");
    let year = m3[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  // Fallback to Date.parse
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  } catch {
    // ignore
  }

  return undefined;
}
