// Shared subscription domain utilities — single source of truth
// These replace scattered heuristics that were copy-pasted across the codebase.

import {
  BillingCycle,
  CycleState,
  PaymentStatus,
  Subscription,
} from "./subscriptionTypes";

/** Milliseconds in one day — replaces hardcoded 86400000 */
export const MILLIS_PER_DAY = 86_400_000;

// ─── Sanitization ─────────────────────────────────────────────────────────────

/**
 * Deeply strips undefined properties from an object so Firestore operations never reject it.
 * This is the canonical implementation — do NOT define this elsewhere.
 */
export function sanitizeForFirestore<T = any>(data: T): any {
  return JSON.parse(
    JSON.stringify(data, (_, value) => (value === undefined ? null : value)),
  );
}

// ─── Subscription Classification ──────────────────────────────────────────────

/**
 * Canonical check for whether a subscription is prepaid (paid upfront for the upcoming period).
 * Examples: OTT platforms, prepaid mobile, entertainment subscriptions.
 *
 * Replaces the scattered heuristic that was duplicated in 7+ locations:
 *   isPrepaid || category === "Entertainment" || (!dueDayOfMonth && billingType === "BILL_GENERATED" && !paymentQuery)
 */
export function isPrepaidSubscription(sub: Subscription): boolean {
  if (sub.isPrepaid) return true;
  if (sub.category === "Entertainment") return true;

  // No due day, bill-generated type, and no separate payment tracking → treat as prepaid receipt
  if (
    !sub.dueDayOfMonth &&
    !sub.isEndOfMonthDue &&
    sub.billingType === "BILL_GENERATED" &&
    !sub.emailConfig?.paymentQuery
  ) {
    return true;
  }

  return false;
}

/**
 * Canonical check for whether a subscription is a fixed-tenure commitment.
 * Examples: Loans, EMIs, SIPs with fixed monthly amounts.
 */
export function isFixedTenure(sub: Subscription): boolean {
  return (
    sub.billingType === "FIXED_TENURE" || sub.category === "Loans & EMIs"
  );
}

/**
 * Canonical check for whether a subscription is an advance-payment scheme.
 * Examples: Jewellery chit schemes, prepaid deposits where payment IS the statement.
 */
export function isAdvancePaymentSubscription(sub: Subscription): boolean {
  if (sub.isAdvancePayment) return true;
  if (sub.category === "Savings & Schemes") return true;
  return isPrepaidSubscription(sub);
}

// ─── Due Date Calculation ─────────────────────────────────────────────────────

/**
 * Calculates the due date for a given cycle month based on subscription configuration.
 * Returns undefined for prepaid subscriptions (they don't have a "due" concept).
 */
export function calculateDueDate(
  cycleMonth: string,
  sub: Subscription,
): string | undefined {
  if (isPrepaidSubscription(sub)) return undefined;

  const [yStr, mStr] = cycleMonth.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const maxDays = new Date(y, m, 0).getDate();

  if (sub.dueDayOfMonth) {
    const validDay = Math.min(sub.dueDayOfMonth, maxDays);
    return `${yStr}-${mStr}-${String(validDay).padStart(2, "0")}`;
  }

  if (sub.isEndOfMonthDue) {
    return `${yStr}-${mStr}-${String(maxDays).padStart(2, "0")}`;
  }

  // Fallback: mid-month for postpaid subscriptions without explicit due day
  return `${yStr}-${mStr}-15`;
}

// ─── Payment Status Calculation ───────────────────────────────────────────────

/**
 * Deterministic payment status computation from amounts.
 * Replaces scattered if/else chains that computed status inconsistently.
 */
export function computePaymentStatus(
  total: number,
  paid: number,
  opts?: {
    isPrepaid?: boolean;
    allowSkip?: boolean;
    isStale?: boolean; // cycle is from a past month
    currentStatus?: PaymentStatus; // preserve manual overrides
  },
): PaymentStatus {
  // Preserve manual overrides
  if (
    opts?.currentStatus === "MISMATCH_REVIEW" ||
    opts?.currentStatus === "PAUSED" ||
    opts?.currentStatus === "ARCHIVED"
  ) {
    return opts.currentStatus;
  }

  if (total > 0 && paid >= total) return "FULLY_PAID";
  if (total === 0 && paid > 0) return "FULLY_PAID";
  if (paid > 0 && paid < total) return "PARTIALLY_PAID";

  // Unpaid
  if (opts?.allowSkip && opts?.isStale) return "SKIPPED";
  return "UNPAID";
}

// ─── Remaining Balance ────────────────────────────────────────────────────────

/**
 * Computes remaining balance with proper rounding to avoid floating-point drift.
 */
export function computeRemainingBalance(total: number, paid: number): number {
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

// ─── Cycle Identification ─────────────────────────────────────────────────────

/**
 * Returns the current calendar month as "YYYY-MM".
 */
export function getCurrentCycleMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Returns today's date as "YYYY-MM-DD".
 */
export function getTodayIso(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Generates the canonical cycle document ID for Firestore.
 */
export function getCycleDocId(subscriptionId: string, cycleMonth: string): string {
  return `${subscriptionId}_${cycleMonth}`;
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

/**
 * Adds days to a date string and returns "YYYY-MM-DD".
 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * Returns number of days between two date strings (positive if target is in the future).
 */
export function daysDifference(fromDateStr: string, toDateStr: string): number {
  const from = new Date(fromDateStr);
  const to = new Date(toDateStr);
  return Math.ceil((to.getTime() - from.getTime()) / MILLIS_PER_DAY);
}

// ─── Next Statement Tracking ──────────────────────────────────────────────────

export interface NextStatementInfo {
  statementDay: number;
  nextStatementDate: string; // "YYYY-MM-DD"
  daysRemaining: number;
  displayText: string; // "Next statement in 6 days", "Next statement tomorrow", "Next statement today"
  formattedDate: string; // e.g. "15 Sep"
  cycleEnded: boolean;
}

/**
 * Checks whether the previous or current cycle has ended.
 * A cycle has ended if:
 * 1. It is fully settled (status is FULLY_PAID, or paidAmount >= statementTotal for a non-zero bill).
 * 2. It was skipped / paused.
 * 3. It is prepaid (period is active/settled).
 * 4. Or it is in AWAITING_BILL state (meaning the previous month's bill was already settled, and this month's statement hasn't arrived).
 */
export function hasPreviousCycleEnded(sub: Subscription): boolean {
  if (isPrepaidSubscription(sub)) return true;
  const cycle = sub.currentCycle;
  if (!cycle) return false;
  if (cycle.status === "FULLY_PAID" || cycle.status === "SKIPPED" || cycle.status === "PAUSED") return true;
  const total = cycle.statementTotal || 0;
  const paid = cycle.paidAmount || 0;
  if (total > 0 && paid >= total) return true;
  // If waiting for bill, previous cycle has settled
  if (total === 0 && cycle.status === "UNPAID") return true;
  return false;
}

/**
 * Calculates the next statement date and countdown when the previous cycle has ended.
 * Returns null if no statement date/day is configured on the subscription.
 */
export function getNextStatementInfo(
  sub: Subscription,
  todayIso?: string,
): NextStatementInfo | null {
  // 1. Resolve statement day of month (1-31)
  let statementDay: number | undefined = undefined;

  if (
    typeof sub.statementDayOfMonth === "number" &&
    sub.statementDayOfMonth >= 1 &&
    sub.statementDayOfMonth <= 31
  ) {
    statementDay = Math.round(sub.statementDayOfMonth);
  } else if (
    typeof sub.statementDate === "number" &&
    sub.statementDate >= 1 &&
    sub.statementDate <= 31
  ) {
    statementDay = Math.round(sub.statementDate);
  } else if (typeof sub.statementDate === "string" && sub.statementDate.trim()) {
    const trimmed = sub.statementDate.trim();
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= 31 && !trimmed.includes("-")) {
      statementDay = num;
    } else if (trimmed.includes("-")) {
      const parts = trimmed.split(/[-/]/);
      if (parts.length >= 3) {
        const dayPart = parseInt(parts[2].slice(0, 2), 10);
        if (!isNaN(dayPart) && dayPart >= 1 && dayPart <= 31) {
          statementDay = dayPart;
        }
      }
    }
  }

  // Only calculate next statement if explicitly configured on the subscription
  if (!statementDay) return null;

  const today = todayIso || getTodayIso();
  const [yStr, mStr, dStr] = today.split("-");
  const currentYear = Number(yStr);
  const currentMonth = Number(mStr);
  const currentDay = Number(dStr);

  const cycle = sub.currentCycle;
  const cycleEnded = hasPreviousCycleEnded(sub);
  const currentMonthStr = today.slice(0, 7);
  const isCurrentMonthSettled =
    cycle?.cycleMonth === currentMonthStr &&
    (cycle?.statementTotal || 0) > 0 &&
    (cycle?.status === "FULLY_PAID" || (cycle?.paidAmount || 0) >= (cycle?.statementTotal || 0));

  let targetYear = currentYear;
  let targetMonth = currentMonth;

  if (isCurrentMonthSettled) {
    // Current month's statement arrived and was already settled, so next statement is next month
    if (targetMonth === 12) {
      targetYear += 1;
      targetMonth = 1;
    } else {
      targetMonth += 1;
    }
  } else if (currentDay > statementDay) {
    // Current month's statement day has already elapsed
    if (targetMonth === 12) {
      targetYear += 1;
      targetMonth = 1;
    } else {
      targetMonth += 1;
    }
  }

  const maxDaysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
  const validTargetDay = Math.min(statementDay, maxDaysInTargetMonth);
  const nextStatementDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(validTargetDay).padStart(2, "0")}`;

  const daysDiff = daysDifference(today, nextStatementDate);
  const daysRemaining = Math.max(0, daysDiff);

  let displayText: string;
  if (daysRemaining === 0) {
    displayText = "Next statement today";
  } else if (daysRemaining === 1) {
    displayText = "Next statement tomorrow";
  } else {
    displayText = `Next statement in ${daysRemaining} days`;
  }

  const SHORT_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const formattedDate = `${validTargetDay} ${SHORT_MONTH_NAMES[targetMonth - 1]}`;

  return {
    statementDay,
    nextStatementDate,
    daysRemaining,
    displayText,
    formattedDate,
    cycleEnded,
  };
}

