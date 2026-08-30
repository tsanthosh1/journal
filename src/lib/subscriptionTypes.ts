// Billing Models & Schema definitions for Subscriptions and Outflow Tracker

export type BillingType = "FIXED_TENURE" | "BILL_GENERATED";
export type SourceType = "MANUAL" | "EMAIL_AUTOMATED" | "SMS_AUTOMATED";
export type BillingCycle = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "ANNUAL" | "CUSTOM";
export type PaymentStatus =
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "FULLY_PAID"
  | "SKIPPED"
  | "PAUSED"
  | "ARCHIVED"
  | "MISMATCH_REVIEW";

export type SubscriptionCategory =
  | "Credit Cards"
  | "Utilities"
  | "Services"
  | "Entertainment"
  | "Savings & Schemes"
  | "Insurance"
  | "Software & Tools"
  | "Housing & Rent"
  | "Other";

export type DedupStrategy =
  | "SAME_DAY_SAME_AMOUNT"
  | "SINGLE_PAYMENT_PER_CYCLE"
  | "ALLOW_MULTIPLE";

export interface EmailConfig {
  enabled: boolean;
  statementQuery: string;
  paymentQuery: string;
  dedupStrategy?: DedupStrategy;
  parserModule?: string; // Optional: defaults to Universal Auto-Detect cascade
  customRegex?: {
    statementAmountPattern?: string;
    statementDueDatePattern?: string;
    paymentAmountPattern?: string;
  };
}

export interface SmsConfig {
  enabled: boolean;
  senderQuery: string; // e.g. "HDFCBK" or "SBIINB" or "CANBNK"
  filterKeywords?: string[]; // e.g. ["loan", "EMI", "recovery"]
  accountOrLoanDigits?: string; // Optional last 4 digits of loan account e.g. "7890"
  dedupStrategy?: DedupStrategy;
  parserModule?: string; // e.g. "LoanSmsParser"
  customRegex?: {
    amountPattern?: string;
    datePattern?: string;
    accountPattern?: string;
  };
}

export interface RawSmsRecord {
  id: string; // SHA-256 fingerprint
  userId: string;
  sender: string;
  body: string;
  timestamp: number; // epoch ms
  date: string; // ISO date
  processed: boolean;
  processedAt?: string;
  matchedSubscriptionId?: string;
  extractedAmount?: number;
  extractedDate?: string;
  accountReference?: string;
  createdAt: string;
}

export interface SourceEmailRecord {
  id: string; // Gmail messageId
  subscriptionId: string;
  subscriptionName?: string;
  cycleMonth?: string;
  type: "STATEMENT" | "PAYMENT";
  subject: string;
  from?: string;
  to?: string;
  date: string; // Email date or ISO
  storagePath?: string;
  bodySnippet: string;
  bodyHtml?: string;
  bodyText?: string;
  extractedAmount?: number;
  extractedDate?: string;
  accountOrCardDigits?: string;
  referenceId?: string;
  rawMatches?: Record<string, string>;
  createdAt: string;
}

export interface CycleState {
  cycleMonth: string; // "YYYY-MM"
  statementDate?: string; // "YYYY-MM-DD"
  dueDate?: string; // "YYYY-MM-DD" (Optional for Prepaid OTTs / Instant renewals)
  statementTotal: number;
  paidAmount: number;
  remainingBalance: number;
  status: PaymentStatus;
  lastPaymentDate?: string;
  lastError?: string;
  processedMessageIds: string[];
  sourceEmails?: SourceEmailRecord[];
  sourceSms?: RawSmsRecord[];
  updatedAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  name: string;
  category: SubscriptionCategory | string;
  billingType: BillingType;
  source: SourceType;
  currency: string; // e.g. "INR", "USD", "EUR"
  defaultAmount: number;
  billingCycle: BillingCycle;
  dueDayOfMonth?: number; // 1-31 (Optional for postpaid bills)
  isEndOfMonthDue?: boolean; // True if due on last day of month (e.g. 28-31)
  allowSkip?: boolean; // True if missed month is skipped without overdue penalty (e.g. jewellery schemes / voluntary SIPs)
  dedupStrategy?: DedupStrategy; // Anti-duplicate strategy for duplicate email alerts
  isPrepaid?: boolean; // True for OTTs/immediate renewals (no due date)
  emailConfig?: EmailConfig;
  smsConfig?: SmsConfig;
  currentCycle: CycleState;
  notes?: string;
  imageUrl?: string; // Custom uploaded image URL or online logo URL
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HistoricalCycle extends CycleState {
  id: string;
  subscriptionId: string;
  subscriptionName: string;
  currency: string;
  createdAt: string;
}

export interface GmailTokenRecord {
  userId: string;
  email?: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number; // Unix timestamp in ms
  scope?: string;
  lastSyncAt?: string;
  updatedAt: string;
}

export interface SyncAuditLog {
  id: string;
  userId: string;
  timestamp: string;
  subscriptionsProcessed: number;
  statementsFound: number;
  paymentsFound: number;
  errorsCount: number;
  durationMs: number;
  details: Array<{
    subscriptionId: string;
    subscriptionName: string;
    status: string;
    message?: string;
    messagesProcessed?: number;
  }>;
}

// Parser output types
export interface ParsedStatement {
  success: boolean;
  statementTotal?: number;
  statementDate?: string;
  dueDate?: string;
  accountOrCardDigits?: string;
  referenceId?: string;
  rawMatches?: Record<string, string>;
  error?: string;
}

export interface ParsedPayment {
  success: boolean;
  paidAmount?: number;
  paymentDate?: string;
  referenceId?: string;
  accountOrCardDigits?: string;
  rawMatches?: Record<string, string>;
  error?: string;
}

export interface ParserTestResult {
  parserModule: string;
  statementResult: ParsedStatement;
  paymentResult: ParsedPayment;
  logs: string[];
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Formats "2026-08-30" or ISO date string -> "30 August 2026"
 */
export function formatDisplayDate(dateStr?: string | null): string {
  if (!dateStr || !dateStr.trim()) return "Not set";
  const trimmed = dateStr.trim();

  // Match "YYYY-MM-DD"
  const parts = trimmed.split(/[-/]/);
  if (parts.length === 3 && parts[0].length === 4) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2].slice(0, 2), 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day) && month >= 1 && month <= 12) {
      return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
    }
  }

  // Fallback to Date parse
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  return trimmed;
}

/**
 * Formats "2026-08" -> "August 2026"
 */
export function formatCycleMonth(monthStr?: string | null): string {
  if (!monthStr || !monthStr.trim()) return "Current";
  const trimmed = monthStr.trim();

  const parts = trimmed.split(/[-/]/);
  if (parts.length >= 2 && parts[0].length === 4) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
      return `${MONTH_NAMES[month - 1]} ${year}`;
    }
  }

  const d = new Date(`${trimmed}-01`);
  if (!isNaN(d.getTime())) {
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  return trimmed;
}

/**
 * Formats full RFC/ISO email date like "Wed, 03 Sep 2025 17:14:51 +0000" -> "3 September 2025, 05:14 PM"
 */
export function formatEmailTimestamp(dateStr?: string | null): string {
  if (!dateStr || !dateStr.trim()) return "—";
  try {
    const d = new Date(dateStr.trim());
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const month = MONTH_NAMES[d.getMonth()];
    const year = d.getFullYear();
    const timeStr = d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${day} ${month} ${year}, ${timeStr}`;
  } catch {
    return dateStr;
  }
}

