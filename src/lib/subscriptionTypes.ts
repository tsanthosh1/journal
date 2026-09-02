// Billing Models & Schema definitions for Subscriptions and Outflow Tracker

export type BillingType = "FIXED_TENURE" | "BILL_GENERATED";
export type SourceType = "MANUAL" | "EMAIL_AUTOMATED" | "SMS_AUTOMATED" | "TNEB_MODULE";
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
  | "Loans & EMIs"
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

export interface ParserConfigField {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  placeholder?: string;
  description?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  defaultValue?: string | number;
}

export interface EmailConfig {
  enabled: boolean;
  statementQuery: string;
  paymentQuery: string;
  dedupStrategy?: DedupStrategy;

  // Independent parser selection for Statements & Payments
  statementParserModule?: string;
  statementParserConfig?: Record<string, any>;
  paymentParserModule?: string;
  paymentParserConfig?: Record<string, any>;

  // Backward compatibility fallback
  parserModule?: string;
  parserConfig?: Record<string, any>;
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
  periodStartDate?: string; // "YYYY-MM-DD" (Prepaid subscription validity start)
  periodEndDate?: string; // "YYYY-MM-DD" (Prepaid subscription validity end)
  nextRenewalDate?: string; // "YYYY-MM-DD" (Next expected prepaid renewal / bill date)
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

export interface TnebSubscriptionConfig {
  consumerNumber: string;
  nickname?: string;
  tariffCode?: string;
  section?: string;
  meterNumber?: string;
  autoSyncWithEbModule?: boolean;
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
  isPrepaid?: boolean; // True for OTTs / services paid upfront for the upcoming period
  dedupStrategy?: DedupStrategy;
  notes?: string;
  imageUrl?: string; // Custom uploaded image URL or online logo URL
  icon?: string;
  color?: string;
  emailConfig?: EmailConfig;
  smsConfig?: SmsConfig;
  tnebConfig?: TnebSubscriptionConfig;
  currentCycle: CycleState;
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

export interface SyncSummary {
  userId: string;
  timestamp: string;
  totalSubscriptions: number;
  totalSynced: number;
  results: Array<{
    subscriptionId: string;
    subscriptionName: string;
    status: string;
    message?: string;
    messagesProcessed?: number;
  }>;
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
  periodStartDate?: string;
  periodEndDate?: string;
  nextRenewalDate?: string;
  accountOrCardDigits?: string;
  referenceId?: string;
  rawMatches?: Record<string, string>;
  error?: string;
}

export interface ParsedPayment {
  success: boolean;
  paidAmount?: number;
  paymentDate?: string;
  periodStartDate?: string;
  periodEndDate?: string;
  nextRenewalDate?: string;
  referenceId?: string;
  accountOrCardDigits?: string;
  rawMatches?: Record<string, string>;
  error?: string;
}

export interface PrepaidRenewalInfo {
  periodStartDate?: string;
  periodEndDate?: string;
  nextRenewalDate?: string;
  daysRemaining?: number;
  isExpiringSoon?: boolean;
  isExpired?: boolean;
}

export function calculatePrepaidRenewalInfo(
  cycle?: CycleState | null,
  billingCycle: BillingCycle | string = "MONTHLY",
  dueDayOfMonth?: number,
): PrepaidRenewalInfo {
  if (!cycle) return {};

  const baseDateStr =
    cycle.periodStartDate ||
    cycle.statementDate ||
    cycle.lastPaymentDate ||
    (cycle.cycleMonth ? `${cycle.cycleMonth}-${String(dueDayOfMonth || 1).padStart(2, "0")}` : undefined);

  if (!baseDateStr) return {};

  const baseDate = new Date(baseDateStr);
  if (isNaN(baseDate.getTime())) return {};

  let renewalDate: Date;
  let periodEnd: Date;

  if (cycle.nextRenewalDate) {
    renewalDate = new Date(cycle.nextRenewalDate);
    periodEnd = cycle.periodEndDate ? new Date(cycle.periodEndDate) : new Date(renewalDate.getTime() - 86400000);
  } else if (cycle.periodEndDate) {
    periodEnd = new Date(cycle.periodEndDate);
    renewalDate = new Date(periodEnd.getTime() + 86400000);
  } else {
    renewalDate = new Date(baseDate);
    if (billingCycle === "ANNUAL" || billingCycle === "YEARLY") {
      renewalDate.setFullYear(renewalDate.getFullYear() + 1);
    } else if (billingCycle === "HALF_YEARLY") {
      renewalDate.setMonth(renewalDate.getMonth() + 6);
    } else if (billingCycle === "QUARTERLY") {
      renewalDate.setMonth(renewalDate.getMonth() + 3);
    } else if (billingCycle === "WEEKLY") {
      renewalDate.setDate(renewalDate.getDate() + 7);
    } else {
      // Default: 1 month validity
      renewalDate.setMonth(renewalDate.getMonth() + 1);
    }

    periodEnd = new Date(renewalDate);
    periodEnd.setDate(periodEnd.getDate() - 1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startIso = cycle.periodStartDate || baseDate.toISOString().split("T")[0];
  const endIso = cycle.periodEndDate || periodEnd.toISOString().split("T")[0];
  const nextIso = cycle.nextRenewalDate || renewalDate.toISOString().split("T")[0];

  const diffMs = periodEnd.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const isExpired = daysRemaining < 0;
  const isExpiringSoon = daysRemaining >= 0 && daysRemaining <= 5;

  return {
    periodStartDate: startIso,
    periodEndDate: endIso,
    nextRenewalDate: nextIso,
    daysRemaining,
    isExpiringSoon,
    isExpired,
  };
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

