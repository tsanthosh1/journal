import { getFirebaseAdmin } from "../firebaseAdmin";
import { sanitizeForFirestore, saveEmailSnapshot } from "../emailStorage";
import { getParserForConfig, getParserForModule } from "../parsers";
import {
  CycleState,
  HistoricalCycle,
  ParsedStatement,
  PaymentStatus,
  SourceEmailRecord,
  Subscription,
  SyncAuditLog,
} from "../subscriptionTypes";
import { getGmailMessageDetails, searchGmailMessages } from "./apiClient";
import { getValidGmailToken, saveGmailTokens } from "./oauth";
import { createSyncLogger, SyncLogCallback } from "./syncLogger";

export interface SyncSubscriptionResult {
  subscriptionId: string;
  subscriptionName: string;
  success: boolean;
  status: PaymentStatus;
  statementTotal?: number;
  paidAmount?: number;
  remainingBalance?: number;
  newMessagesProcessed: number;
  historicalCyclesProcessed?: number;
  sourceEmailsCount?: number;
  error?: string;
  warnings?: string[];
}

/**
 * Synchronizes an individual subscription with Gmail queries (current active cycle)
 */
export async function syncSubscriptionWithGmail(
  subscription: Subscription,
  accessToken: string,
  onLog?: SyncLogCallback,
): Promise<SyncSubscriptionResult> {
  const log = createSyncLogger(onLog);
  const subCtx = { subscriptionId: subscription.id, subscriptionName: subscription.name };

  log("info", `Starting Gmail sync for ${subscription.name} (${subscription.billingType})`, subCtx);

  const emailConfig = subscription.emailConfig;
  if (!emailConfig || !emailConfig.enabled) {
    log("info", `Email sync is disabled for ${subscription.name}`, subCtx);
    return {
      subscriptionId: subscription.id,
      subscriptionName: subscription.name,
      success: true,
      status: subscription.currentCycle.status,
      newMessagesProcessed: 0,
      warnings: ["Email sync disabled for this subscription."],
    };
  }

  const statementParserModule = emailConfig.statementParserModule || emailConfig.parserModule;
  const statementParser = getParserForModule(statementParserModule, emailConfig.customRegex);
  const statementConfig = emailConfig.statementParserConfig || emailConfig.parserConfig;

  const paymentParserModule = emailConfig.paymentParserModule || emailConfig.parserModule;
  const paymentParser = getParserForModule(paymentParserModule, emailConfig.customRegex);
  const paymentConfig = emailConfig.paymentParserConfig || emailConfig.parserConfig;

  const cycle: CycleState = {
    ...subscription.currentCycle,
    processedMessageIds: [...(subscription.currentCycle.processedMessageIds || [])],
    sourceEmails: [...(subscription.currentCycle.sourceEmails || [])],
  };

  const currentYearMonth = new Date().toISOString().slice(0, 7);
  if (!cycle.cycleMonth) {
    cycle.cycleMonth = currentYearMonth;
  }
  if (!cycle.statementTotal && subscription.defaultAmount) {
    cycle.statementTotal = subscription.defaultAmount;
  }
  if (!cycle.dueDate) {
    cycle.dueDate = `${cycle.cycleMonth}-${String(subscription.dueDayOfMonth || 5).padStart(2, "0")}`;
  }

  let newMessagesProcessed = 0;
  const warnings: string[] = [];

  // 1. Execute Statement Query (if configured)
  if (emailConfig.statementQuery && emailConfig.statementQuery.trim()) {
    const qStr = emailConfig.statementQuery.trim();
    log("query", `Executing Statement Query: "${qStr}"`, { ...subCtx, details: { query: qStr, parser: statementParserModule } });

    try {
      const statementMessages = await searchGmailMessages(
        accessToken,
        qStr,
        15,
      );

      log("fetch", `Statement search returned ${statementMessages.length} matching message(s)`, {
        ...subCtx,
        details: { messageCount: statementMessages.length, messageIds: statementMessages.map((m) => m.id) },
      });

      let foundValid = false;
      for (const msgSummary of statementMessages) {
        try {
          const msgDetail = await getGmailMessageDetails(accessToken, msgSummary.id);
          const actualMsgDate = msgDetail.internalDate
            ? new Date(parseInt(msgDetail.internalDate)).toISOString().split("T")[0]
            : msgDetail.date
            ? new Date(msgDetail.date).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0];

          log("fetch", `Processing statement email ${msgSummary.id} | Date: ${actualMsgDate} | Subject: "${msgDetail.subject}"`, {
            ...subCtx,
            details: { messageId: msgSummary.id, subject: msgDetail.subject, date: actualMsgDate, from: msgDetail.from },
          });

          const content = `${msgDetail.bodyText}\n${msgDetail.bodyHtml}`;
          const stmtParsed = statementParser.parseStatement(content, msgDetail.subject, statementConfig);

          if (stmtParsed.success && stmtParsed.statementTotal !== undefined) {
            cycle.statementTotal = stmtParsed.statementTotal;
            if (stmtParsed.dueDate) {
              cycle.dueDate = stmtParsed.dueDate;
            }
            if (stmtParsed.periodStartDate) cycle.periodStartDate = stmtParsed.periodStartDate;
            if (stmtParsed.periodEndDate) cycle.periodEndDate = stmtParsed.periodEndDate;
            if (stmtParsed.nextRenewalDate) cycle.nextRenewalDate = stmtParsed.nextRenewalDate;

            cycle.statementDate = stmtParsed.statementDate || actualMsgDate;
            const ym = (stmtParsed.statementDate || actualMsgDate).slice(0, 7);
            if (ym) cycle.cycleMonth = ym;

            log("parse", `Statement extracted: ₹${stmtParsed.statementTotal.toLocaleString("en-IN")} | Due: ${cycle.dueDate || "N/A"} | Cycle: ${cycle.cycleMonth}`, {
              ...subCtx,
              details: {
                total: stmtParsed.statementTotal,
                dueDate: stmtParsed.dueDate,
                statementDate: cycle.statementDate,
                periodStartDate: stmtParsed.periodStartDate,
                periodEndDate: stmtParsed.periodEndDate,
                nextRenewalDate: stmtParsed.nextRenewalDate,
                rawMatches: stmtParsed.rawMatches,
              },
            });

            // Save copy of source statement email to Firebase Storage & Firestore
            const archivedEmail = await saveEmailSnapshot({
              userId: subscription.userId || "default_user",
              subscriptionId: subscription.id,
              subscriptionName: subscription.name,
              cycleMonth: cycle.cycleMonth,
              messageId: msgSummary.id,
              type: "STATEMENT",
              subject: msgDetail.subject,
              from: msgDetail.from,
              to: msgDetail.to,
              date: msgDetail.date || actualMsgDate,
              bodyHtml: msgDetail.bodyHtml,
              bodyText: msgDetail.bodyText,
              snippet: msgDetail.snippet,
              extractedAmount: stmtParsed.statementTotal,
              extractedDate: stmtParsed.dueDate,
              accountOrCardDigits: stmtParsed.accountOrCardDigits,
              rawMatches: stmtParsed.rawMatches,
            });

            log("save", `Archived statement email snapshot to Storage & Firestore`, {
              ...subCtx,
              details: { snapshotId: archivedEmail.id, storagePath: archivedEmail.storagePath },
            });

            // Replace or add to cycle.sourceEmails
            if (!cycle.sourceEmails) cycle.sourceEmails = [];
            const existingIdx = cycle.sourceEmails.findIndex((e) => e.id === msgSummary.id);
            if (existingIdx >= 0) {
              cycle.sourceEmails[existingIdx] = archivedEmail;
            } else {
              cycle.sourceEmails = cycle.sourceEmails.filter((e) => e.type !== "STATEMENT");
              cycle.sourceEmails.unshift(archivedEmail);
            }

            if (!cycle.processedMessageIds.includes(msgSummary.id)) {
              cycle.processedMessageIds.push(msgSummary.id);
              newMessagesProcessed++;
            }

            foundValid = true;
            break;
          } else {
            log("warn", `Parser mismatch on email ${msgSummary.id}: ${stmtParsed.error || "Could not parse amount"}`, subCtx);
          }
        } catch (fetchErr) {
          log("warn", `Failed to inspect email ${msgSummary.id}: ${(fetchErr as Error).message}`, subCtx);
        }
      }

      if (!foundValid && statementMessages.length > 0) {
        log("warn", `None of the ${statementMessages.length} statement emails could be parsed by ${statementParserModule}`, subCtx);
      }
    } catch (err) {
      const errMsg = `Statement query error: ${(err as Error).message}`;
      warnings.push(errMsg);
      log("error", errMsg, subCtx);
    }
  }

  // 2. Execute Payment Query (if configured)
  if (emailConfig.paymentQuery && emailConfig.paymentQuery.trim()) {
    const payQueryStr = emailConfig.paymentQuery.trim();
    log("query", `Executing Payment Query: "${payQueryStr}"`, { ...subCtx, details: { query: payQueryStr, parser: paymentParserModule } });

    try {
      const paymentMessages = await searchGmailMessages(
        accessToken,
        payQueryStr,
        15,
      );

      log("fetch", `Payment search returned ${paymentMessages.length} candidate message(s)`, {
        ...subCtx,
        details: { messageCount: paymentMessages.length },
      });

      // Statement start timestamp threshold (payments must be made ON or AFTER the statement generation date)
      // If no statement is generated (e.g. fixed service), allow payments within the current month window
      const stmtThresholdTime = cycle.statementDate
        ? new Date(cycle.statementDate).getTime() - 24 * 60 * 60 * 1000 // 1 day buffer for timezones
        : new Date(`${cycle.cycleMonth}-01`).getTime() - 5 * 86400000; // 5 days buffer into previous month

      for (const pMsg of paymentMessages) {
        if (cycle.processedMessageIds.includes(pMsg.id)) {
          continue;
        }

        const msgDetail = await getGmailMessageDetails(accessToken, pMsg.id);
        const content = `${msgDetail.bodyText}\n${msgDetail.bodyHtml}`;
        const payParsed = paymentParser.parsePayment(content, msgDetail.subject, paymentConfig);

        if (payParsed.success && payParsed.paidAmount !== undefined) {
          const pDate =
            payParsed.paymentDate ||
            (msgDetail.internalDate
              ? new Date(parseInt(msgDetail.internalDate)).toISOString().split("T")[0]
              : new Date().toISOString().split("T")[0]);

          const pTime = new Date(pDate).getTime();
          const payMonth = pDate.slice(0, 7);

          const cycleDeadlineTime = cycle.dueDate
            ? new Date(cycle.dueDate).getTime() + 12 * 86400000
            : stmtThresholdTime > 0
            ? stmtThresholdTime + 35 * 86400000
            : Infinity;

          // Payment must belong to this cycle's active window
          if (pTime > cycleDeadlineTime) {
            continue;
          }

          // Check if payment was made before this cycle threshold
          if (stmtThresholdTime > 0 && pTime < stmtThresholdTime) {
            continue;
          }

          // Check if statement email was already this exact payment (e.g. advance payment email from GRT)
          const isStatementItself =
            cycle.sourceEmails?.some((e) => e.type === "STATEMENT" && e.id === pMsg.id) ||
            (cycle.statementDate === pDate &&
              Math.abs((cycle.statementTotal || 0) - payParsed.paidAmount!) < 0.01 &&
              (subscription.category === "Savings & Schemes" || subscription.isPrepaid));

          if (isStatementItself && (cycle.paidAmount || 0) >= payParsed.paidAmount) {
            // Already settled as the advance statement receipt
            cycle.processedMessageIds.push(pMsg.id);
            continue;
          }

          // Anti-duplicate check
          const dedupStrat =
            subscription.dedupStrategy ||
            subscription.emailConfig?.dedupStrategy ||
            "SAME_DAY_SAME_AMOUNT";

          const isDuplicatePayment = (() => {
            if (
              dedupStrat === "SINGLE_PAYMENT_PER_CYCLE" ||
              subscription.category === "Savings & Schemes" ||
              subscription.isEndOfMonthDue
            ) {
              return (cycle.paidAmount || 0) > 0;
            }
            if (dedupStrat === "SAME_DAY_SAME_AMOUNT") {
              return (cycle.sourceEmails || []).some(
                (prev) =>
                  (prev.date?.slice(0, 10) === pDate || prev.extractedDate === pDate) &&
                  Math.abs((prev.extractedAmount || 0) - payParsed.paidAmount!) < 0.01,
              );
            }
            return false;
          })();

          if (!isDuplicatePayment) {
            cycle.paidAmount = Math.round(((cycle.paidAmount || 0) + payParsed.paidAmount) * 100) / 100;
            if (payParsed.paymentDate) {
              cycle.lastPaymentDate = payParsed.paymentDate;
            }
            if (payParsed.periodStartDate) cycle.periodStartDate = payParsed.periodStartDate;
            if (payParsed.periodEndDate) cycle.periodEndDate = payParsed.periodEndDate;
            if (payParsed.nextRenewalDate) cycle.nextRenewalDate = payParsed.nextRenewalDate;

            log("parse", `Payment extracted: ₹${payParsed.paidAmount.toLocaleString("en-IN")} on ${pDate} | Ref: ${payParsed.referenceId || "N/A"}`, {
              ...subCtx,
              details: {
                amount: payParsed.paidAmount,
                date: pDate,
                referenceId: payParsed.referenceId,
                cumulativePaid: cycle.paidAmount,
                periodStartDate: payParsed.periodStartDate,
                periodEndDate: payParsed.periodEndDate,
                nextRenewalDate: payParsed.nextRenewalDate,
              },
            });
          }

          // Save copy of source payment email to Firebase Storage & Firestore
          const archivedEmail = await saveEmailSnapshot({
            userId: subscription.userId || "default_user",
            subscriptionId: subscription.id,
            subscriptionName: subscription.name,
            cycleMonth: cycle.cycleMonth,
            messageId: pMsg.id,
            type: "PAYMENT",
            subject: msgDetail.subject,
            from: msgDetail.from,
            to: msgDetail.to,
            date: msgDetail.date || pDate,
            bodyHtml: msgDetail.bodyHtml,
            bodyText: msgDetail.bodyText,
            snippet: msgDetail.snippet,
            extractedAmount: payParsed.paidAmount,
            extractedDate: payParsed.paymentDate,
            accountOrCardDigits: payParsed.accountOrCardDigits,
            referenceId: payParsed.referenceId,
            rawMatches: payParsed.rawMatches,
          });

          log("save", `Archived payment receipt snapshot (${pMsg.id}) to Storage`, subCtx);

          if (!cycle.sourceEmails) cycle.sourceEmails = [];
          if (!cycle.sourceEmails.some((e) => e.id === pMsg.id)) {
            cycle.sourceEmails.push(archivedEmail);
          }

          cycle.processedMessageIds.push(pMsg.id);
          newMessagesProcessed++;
        } else {
          log("warn", `Payment parser mismatch for msg ${pMsg.id}: ${payParsed.error || "Could not extract amount"}`, subCtx);
          warnings.push(
            `Payment parser mismatch for msg ${pMsg.id}: ${payParsed.error || "Could not extract payment amount"}`,
          );
        }
      }
    } catch (err) {
      const errMsg = `Payment query error: ${(err as Error).message}`;
      warnings.push(errMsg);
      log("error", errMsg, subCtx);
    }
  }

  // 3. Status Lifecycle Calculation
  if (cycle.status !== "MISMATCH_REVIEW" && cycle.status !== "PAUSED" && cycle.status !== "ARCHIVED") {
    let total = cycle.statementTotal || subscription.defaultAmount || 0;
    let paid = cycle.paidAmount || 0;

    const isPrepaidSub =
      subscription.isPrepaid ||
      subscription.category === "Entertainment" ||
      (!subscription.dueDayOfMonth && !subscription.isEndOfMonthDue && !subscription.emailConfig?.paymentQuery);

    // For prepaid subscriptions (where the invoice email is also the payment receipt)
    if (isPrepaidSub && paid === 0 && total > 0) {
      paid = total;
      cycle.paidAmount = paid;
      cycle.lastPaymentDate = cycle.statementDate || new Date().toISOString().split("T")[0];
      cycle.dueDate = undefined;
    }

    const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);

    cycle.remainingBalance = remaining;

    if (total > 0 && paid >= total) {
      cycle.status = "FULLY_PAID";
    } else if (paid > 0 && paid < total) {
      cycle.status = "PARTIALLY_PAID";
    } else if (total > 0 && paid === 0) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      if (subscription.allowSkip && cycle.cycleMonth < currentMonth) {
        cycle.status = "SKIPPED";
        cycle.remainingBalance = 0;
      } else {
        cycle.status = "UNPAID";
      }
    } else if (total === 0 && paid > 0) {
      cycle.status = "FULLY_PAID";
    }
  } else {
    cycle.remainingBalance = Math.max(
      0,
      Math.round(((cycle.statementTotal || subscription.defaultAmount || 0) - cycle.paidAmount) * 100) /
        100,
    );
  }

  // Ensure due date follows end of month if configured
  if (!subscription.isPrepaid && subscription.isEndOfMonthDue && cycle.cycleMonth) {
    const [yStr, mStr] = cycle.cycleMonth.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    if (!isNaN(y) && !isNaN(m)) {
      const lastDay = new Date(y, m, 0).getDate();
      cycle.dueDate = `${cycle.cycleMonth}-${String(lastDay).padStart(2, "0")}`;
    }
  }

  cycle.updatedAt = new Date().toISOString();

  log("match", `Reconciled cycle ${cycle.cycleMonth}: Statement ₹${(cycle.statementTotal || 0).toLocaleString("en-IN")} - Paid ₹${(cycle.paidAmount || 0).toLocaleString("en-IN")} = Remaining ₹${(cycle.remainingBalance || 0).toLocaleString("en-IN")} [Status: ${cycle.status}]`, {
    ...subCtx,
    details: {
      cycleMonth: cycle.cycleMonth,
      statementTotal: cycle.statementTotal,
      paidAmount: cycle.paidAmount,
      remainingBalance: cycle.remainingBalance,
      status: cycle.status,
      dueDate: cycle.dueDate,
    },
  });

  // 4. Update Firestore
  const { db } = getFirebaseAdmin();
  const cleanCycle = sanitizeForFirestore(cycle);

  const subRef = db.collection("subscriptions").doc(subscription.id);
  await subRef.update({
    currentCycle: cleanCycle,
    updatedAt: new Date().toISOString(),
  });

  const cycleDocId = `${subscription.id}_${cycle.cycleMonth}`;
  const cycleRef = db.collection("subscription_cycles").doc(cycleDocId);
  await cycleRef.set(
    sanitizeForFirestore({
      ...cycle,
      id: cycleDocId,
      subscriptionId: subscription.id,
      subscriptionName: subscription.name,
      currency: subscription.currency,
      createdAt: new Date().toISOString(),
    }),
    { merge: true },
  );

  log("success", `Sync finished for ${subscription.name} (${newMessagesProcessed} new message(s) processed)`, {
    ...subCtx,
    details: { status: cycle.status, newMessagesProcessed },
  });

  return {
    subscriptionId: subscription.id,
    subscriptionName: subscription.name,
    success: true,
    status: cycle.status,
    statementTotal: cycle.statementTotal,
    paidAmount: cycle.paidAmount,
    remainingBalance: cycle.remainingBalance,
    newMessagesProcessed,
    sourceEmailsCount: cycle.sourceEmails?.length || 0,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Deep Historical Scan: Scans historical statement issuance and payment confirmation emails across multiple months
 */
export async function syncHistoricalSubscriptionWithGmail(
  subscription: Subscription,
  accessToken: string,
  maxStatements = 24,
  onLog?: SyncLogCallback,
): Promise<{
  subscriptionId: string;
  subscriptionName: string;
  success: boolean;
  cyclesFound: number;
  cycles: HistoricalCycle[];
  messagesScanned: number;
  warnings?: string[];
}> {
  const log = createSyncLogger(onLog);
  const subCtx = { subscriptionId: subscription.id, subscriptionName: subscription.name };

  log("info", `Starting Deep Historical Scan for ${subscription.name} (up to ${maxStatements} past statements)`, subCtx);

  const emailConfig = subscription.emailConfig;
  if (!emailConfig || !emailConfig.enabled) {
    log("info", `Email sync is not enabled for ${subscription.name}`, subCtx);
    return {
      subscriptionId: subscription.id,
      subscriptionName: subscription.name,
      success: true,
      cyclesFound: 0,
      cycles: [],
      messagesScanned: 0,
      warnings: ["Email sync is not enabled for this subscription."],
    };
  }

  const statementParserModule = emailConfig.statementParserModule || emailConfig.parserModule;
  const statementParser = getParserForModule(statementParserModule, emailConfig.customRegex);
  const statementConfig = emailConfig.statementParserConfig || emailConfig.parserConfig;

  const paymentParserModule = emailConfig.paymentParserModule || emailConfig.parserModule;
  const paymentParser = getParserForModule(paymentParserModule, emailConfig.customRegex);
  const paymentConfig = emailConfig.paymentParserConfig || emailConfig.parserConfig;

  const { db } = getFirebaseAdmin();
  const warnings: string[] = [];
  let totalMessagesScanned = 0;

  // 1. Fetch all matching historical statement emails (if statement query is configured)
  let statementMessages: any[] = [];
  if (emailConfig.statementQuery && emailConfig.statementQuery.trim()) {
    const q = emailConfig.statementQuery.trim();
    log("query", `Executing Historical Statement Query: "${q}" (limit: ${maxStatements})`, { ...subCtx, details: { query: q, limit: maxStatements } });
    try {
      statementMessages = await searchGmailMessages(accessToken, q, maxStatements);
      log("fetch", `Historical statement search returned ${statementMessages.length} message(s)`, { ...subCtx, details: { count: statementMessages.length } });
    } catch (err: any) {
      log("error", `Statement search failed: ${err.message}`, subCtx);
    }
  }
  totalMessagesScanned += statementMessages.length;

  // 2. Fetch all matching payment emails (if payment query is configured)
  let paymentMessages: any[] = [];
  if (emailConfig.paymentQuery && emailConfig.paymentQuery.trim()) {
    const pq = emailConfig.paymentQuery.trim();
    log("query", `Executing Historical Payment Query: "${pq}" (limit: ${Math.max(100, maxStatements * 2)})`, { ...subCtx, details: { query: pq } });
    try {
      paymentMessages = await searchGmailMessages(
        accessToken,
        pq,
        Math.max(100, maxStatements * 2),
      );
      log("fetch", `Historical payment search returned ${paymentMessages.length} message(s)`, { ...subCtx, details: { count: paymentMessages.length } });
    } catch (err: any) {
      log("error", `Payment search failed: ${err.message}`, subCtx);
    }
  }
  totalMessagesScanned += paymentMessages.length;

  // 3. Parse all payments, archive them, and index by date
  interface ParsedPaymentRecord {
    msgId: string;
    paidAmount: number;
    paymentDate: string;
    timestamp: number;
    archivedEmail: SourceEmailRecord;
    rawMatches?: Record<string, string>;
  }

  const parsedPayments: ParsedPaymentRecord[] = [];
  for (const pMsg of paymentMessages) {
    try {
      const msgDetail = await getGmailMessageDetails(accessToken, pMsg.id);
      const content = `${msgDetail.bodyText}\n${msgDetail.bodyHtml}`;
      const payParsed = paymentParser.parsePayment(content, msgDetail.subject, paymentConfig);

      if (payParsed.success && payParsed.paidAmount !== undefined) {
        const pDate =
          payParsed.paymentDate ||
          (msgDetail.internalDate
            ? new Date(parseInt(msgDetail.internalDate)).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0]);

        const ts = msgDetail.internalDate ? parseInt(msgDetail.internalDate) : new Date(pDate).getTime();
        const cycleMonth = pDate.slice(0, 7);

        // Archive payment email to Storage & Firestore
        const archivedEmail = await saveEmailSnapshot({
          userId: subscription.userId || "default_user",
          subscriptionId: subscription.id,
          subscriptionName: subscription.name,
          cycleMonth,
          messageId: pMsg.id,
          type: "PAYMENT",
          subject: msgDetail.subject,
          from: msgDetail.from,
          to: msgDetail.to,
          date: msgDetail.date || pDate,
          bodyHtml: msgDetail.bodyHtml,
          bodyText: msgDetail.bodyText,
          snippet: msgDetail.snippet,
          extractedAmount: payParsed.paidAmount,
          extractedDate: payParsed.paymentDate,
          accountOrCardDigits: payParsed.accountOrCardDigits,
          referenceId: payParsed.referenceId,
          rawMatches: payParsed.rawMatches,
        });

        log("parse", `Parsed historical payment: ₹${payParsed.paidAmount.toLocaleString("en-IN")} on ${pDate} | Msg: ${pMsg.id}`, {
          ...subCtx,
          details: { amount: payParsed.paidAmount, date: pDate, referenceId: payParsed.referenceId },
        });

        parsedPayments.push({
          msgId: pMsg.id,
          paidAmount: payParsed.paidAmount,
          paymentDate: pDate,
          timestamp: ts,
          archivedEmail,
          rawMatches: payParsed.rawMatches,
        });
      }
    } catch {
      // Continue next payment
    }
  }

  // 4. Deduplicate collected payments
  const dedupStrat =
    subscription.dedupStrategy ||
    subscription.emailConfig?.dedupStrategy ||
    "SAME_DAY_SAME_AMOUNT";

  const deduplicatedPayments: ParsedPaymentRecord[] = [];
  for (const p of parsedPayments) {
    const isDup = deduplicatedPayments.some((prev) => {
      if (dedupStrat === "SINGLE_PAYMENT_PER_CYCLE") {
        return prev.paymentDate.slice(0, 7) === p.paymentDate.slice(0, 7);
      }
      if (dedupStrat === "SAME_DAY_SAME_AMOUNT") {
        return (
          prev.paymentDate === p.paymentDate &&
          Math.abs(prev.paidAmount - p.paidAmount) < 0.01
        );
      }
      return false;
    });

    if (!isDup) {
      deduplicatedPayments.push(p);
    }
  }

  log("info", `Collected ${deduplicatedPayments.length} unique historical payment transactions`, subCtx);

  // 5. Reconcile monthly historical cycles
  const cyclesMap = new Map<string, HistoricalCycle>();

  if (statementMessages.length > 0) {
    // Mode A: Statement-Driven Cycles (e.g. Credit Cards, Utility Invoices)
    const parsedStatements: Array<{
      sMsg: any;
      msgDetail: any;
      stmtParsed: ParsedStatement;
      stmtDate: string;
      cycleMonth: string;
      dueDate?: string;
      archivedStatementEmail: SourceEmailRecord;
      isAdvanceDepositOrPrepaid: boolean;
      isPrepaidSub: boolean;
      stmtTime: number;
    }> = [];

    for (const sMsg of statementMessages) {
      try {
        const msgDetail = await getGmailMessageDetails(accessToken, sMsg.id);
        const content = `${msgDetail.bodyText}\n${msgDetail.bodyHtml}`;
        const stmtParsed = statementParser.parseStatement(content, msgDetail.subject, statementConfig);

        if (stmtParsed.success && stmtParsed.statementTotal !== undefined) {
          const actualMsgDate = msgDetail.internalDate
            ? new Date(parseInt(msgDetail.internalDate)).toISOString().split("T")[0]
            : msgDetail.date
            ? new Date(msgDetail.date).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0];

          const isPrepaidSub =
            subscription.isPrepaid ||
            subscription.category === "Entertainment" ||
            (!subscription.dueDayOfMonth && !subscription.isEndOfMonthDue && !subscription.emailConfig?.paymentQuery);

          const stmtDate = stmtParsed.statementDate || actualMsgDate;
          const cycleMonth = stmtDate.slice(0, 7);
          let dueDate: string | undefined;
          if (isPrepaidSub) {
            dueDate = undefined;
          } else if (stmtParsed.dueDate) {
            dueDate = stmtParsed.dueDate;
          } else if (subscription.isEndOfMonthDue) {
            const [yStr, mStr] = cycleMonth.split("-");
            const lastDay = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
            dueDate = `${cycleMonth}-${String(lastDay).padStart(2, "0")}`;
          } else if (subscription.dueDayOfMonth) {
            dueDate = `${cycleMonth}-${String(subscription.dueDayOfMonth).padStart(2, "0")}`;
          } else if (stmtDate) {
            dueDate = new Date(new Date(stmtDate).getTime() + 18 * 86400000).toISOString().split("T")[0];
          }

          // Archive statement email to Storage & Firestore
          const archivedStatementEmail = await saveEmailSnapshot({
            userId: subscription.userId || "default_user",
            subscriptionId: subscription.id,
            subscriptionName: subscription.name,
            cycleMonth,
            messageId: sMsg.id,
            type: "STATEMENT",
            subject: msgDetail.subject,
            from: msgDetail.from,
            to: msgDetail.to,
            date: msgDetail.date || stmtDate,
            bodyHtml: msgDetail.bodyHtml,
            bodyText: msgDetail.bodyText,
            snippet: msgDetail.snippet,
            extractedAmount: stmtParsed.statementTotal,
            extractedDate: stmtParsed.dueDate,
            accountOrCardDigits: stmtParsed.accountOrCardDigits,
            rawMatches: stmtParsed.rawMatches,
          });

          log("parse", `Parsed statement for cycle ${cycleMonth}: ₹${stmtParsed.statementTotal.toLocaleString("en-IN")} | Due: ${dueDate || "N/A"}`, {
            ...subCtx,
            details: { total: stmtParsed.statementTotal, cycleMonth, dueDate, stmtDate },
          });

          const isAdvanceDepositOrPrepaid =
            subscription.category === "Savings & Schemes" ||
            subscription.isPrepaid ||
            isPrepaidSub ||
            (stmtParsed.statementTotal !== undefined && deduplicatedPayments.some((p) => p.msgId === sMsg.id));

          parsedStatements.push({
            sMsg,
            msgDetail,
            stmtParsed,
            stmtDate,
            cycleMonth,
            dueDate,
            archivedStatementEmail,
            isAdvanceDepositOrPrepaid,
            isPrepaidSub,
            stmtTime: new Date(stmtDate).getTime(),
          });
        }
      } catch (err) {
        warnings.push(`Historical statement parse error: ${(err as Error).message}`);
      }
    }

    // Sort statements chronologically (oldest to newest)
    parsedStatements.sort((a, b) => a.stmtTime - b.stmtTime);

    for (let i = 0; i < parsedStatements.length; i++) {
      const stmt = parsedStatements[i];
      const nextStmt = parsedStatements[i + 1];

      const cycleStartTime = stmt.stmtTime - 1 * 86400000;
      const cycleEndTime = nextStmt
        ? nextStmt.stmtTime - 1
        : stmt.dueDate
        ? new Date(stmt.dueDate).getTime() + 12 * 86400000
        : stmt.stmtTime + 35 * 86400000;

      // Payments that belong to this statement cycle
      const cyclePayments = deduplicatedPayments.filter((p) => {
        if (p.msgId === stmt.sMsg.id) return true;
        return p.timestamp >= cycleStartTime && p.timestamp <= cycleEndTime;
      });

      const externalPayments = cyclePayments.filter((p) => p.msgId !== stmt.sMsg.id);
      let totalPaid = 0;
      if (stmt.isAdvanceDepositOrPrepaid && (stmt.stmtParsed.statementTotal || 0) > 0) {
        totalPaid = stmt.stmtParsed.statementTotal!;
      } else {
        if (externalPayments.length > 0) {
          totalPaid = Math.round(externalPayments.reduce((sum, p) => sum + p.paidAmount, 0) * 100) / 100;
        } else if (stmt.isPrepaidSub && (stmt.stmtParsed.statementTotal || 0) > 0) {
          totalPaid = stmt.stmtParsed.statementTotal!;
        }
      }

      const totalDue =
        (stmt.stmtParsed.statementTotal || 0) > 0
          ? stmt.stmtParsed.statementTotal!
          : subscription.defaultAmount > 0
          ? subscription.defaultAmount
          : totalPaid;

      const remaining = Math.max(0, Math.round((totalDue - totalPaid) * 100) / 100);

      let status: PaymentStatus = "UNPAID";
      if (totalPaid >= totalDue && totalDue > 0) status = "FULLY_PAID";
      else if (totalPaid > 0) status = "PARTIALLY_PAID";

      const processedMessageIds = Array.from(
        new Set([stmt.sMsg.id, ...cyclePayments.map((p) => p.msgId)]),
      );

      const sourceEmailMap = new Map<string, SourceEmailRecord>();
      sourceEmailMap.set(stmt.archivedStatementEmail.id, stmt.archivedStatementEmail);
      for (const p of cyclePayments) {
        sourceEmailMap.set(p.archivedEmail.id, p.archivedEmail);
      }
      const sourceEmails = Array.from(sourceEmailMap.values());

      const lastPayment =
        externalPayments.length > 0
          ? externalPayments[externalPayments.length - 1]
          : undefined;

      const cyclePaymentDate = lastPayment
        ? lastPayment.paymentDate
        : stmt.isAdvanceDepositOrPrepaid
        ? stmt.stmtDate
        : undefined;

      const cycleRecord: HistoricalCycle = {
        id: `${subscription.id}_${stmt.cycleMonth}`,
        subscriptionId: subscription.id,
        subscriptionName: subscription.name,
        currency: subscription.currency,
        cycleMonth: stmt.cycleMonth,
        statementDate: stmt.stmtDate,
        dueDate: stmt.dueDate,
        statementTotal: totalDue,
        paidAmount: totalPaid,
        remainingBalance: remaining,
        status,
        lastPaymentDate: cyclePaymentDate,
        processedMessageIds,
        sourceEmails,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      cyclesMap.set(stmt.cycleMonth, cycleRecord);

      await db
        .collection("subscription_cycles")
        .doc(cycleRecord.id)
        .set(sanitizeForFirestore(cycleRecord), { merge: true });

      log("match", `Reconciled historical cycle ${stmt.cycleMonth}: Total ₹${totalDue.toLocaleString("en-IN")} | Paid ₹${totalPaid.toLocaleString("en-IN")} | Status: ${status}`, {
        ...subCtx,
        details: { cycleMonth: stmt.cycleMonth, totalDue, totalPaid, status, sourceEmailsCount: sourceEmails.length },
      });
    }
  } else if (deduplicatedPayments.length > 0) {
    // Mode B: Payment-Driven Cycles
    const paymentsByMonth = new Map<string, ParsedPaymentRecord[]>();

    for (const p of deduplicatedPayments) {
      const ym = p.paymentDate.slice(0, 7);
      if (!paymentsByMonth.has(ym)) {
        paymentsByMonth.set(ym, []);
      }
      paymentsByMonth.get(ym)!.push(p);
    }

    for (const [ym, monthPayments] of paymentsByMonth.entries()) {
      const totalPaid =
        Math.round(monthPayments.reduce((sum, p) => sum + p.paidAmount, 0) * 100) / 100;
      
      const expectedTotal = subscription.defaultAmount > 0 ? subscription.defaultAmount : totalPaid;
      const remaining = Math.max(0, Math.round((expectedTotal - totalPaid) * 100) / 100);

      let status: PaymentStatus = "UNPAID";
      if (totalPaid >= expectedTotal && expectedTotal > 0) status = "FULLY_PAID";
      else if (totalPaid > 0) status = "PARTIALLY_PAID";

      const lastPayment = monthPayments[monthPayments.length - 1];
      let dueDate: string | undefined;
      if (subscription.isPrepaid) {
        dueDate = undefined;
      } else if (subscription.isEndOfMonthDue) {
        const [yStr, mStr] = ym.split("-");
        const lastDay = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
        dueDate = `${ym}-${String(lastDay).padStart(2, "0")}`;
      } else if (subscription.dueDayOfMonth) {
        dueDate = `${ym}-${String(subscription.dueDayOfMonth).padStart(2, "0")}`;
      }

      const cycleRecord: HistoricalCycle = {
        id: `${subscription.id}_${ym}`,
        subscriptionId: subscription.id,
        subscriptionName: subscription.name,
        currency: subscription.currency,
        cycleMonth: ym,
        statementDate: `${ym}-01`,
        dueDate,
        statementTotal: expectedTotal,
        paidAmount: totalPaid,
        remainingBalance: remaining,
        status,
        lastPaymentDate: lastPayment?.paymentDate,
        processedMessageIds: monthPayments.map((p) => p.msgId),
        sourceEmails: monthPayments.map((p) => p.archivedEmail),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      cyclesMap.set(ym, cycleRecord);

      await db
        .collection("subscription_cycles")
        .doc(cycleRecord.id)
        .set(sanitizeForFirestore(cycleRecord), { merge: true });

      log("match", `Reconciled payment-driven cycle ${ym}: Paid ₹${totalPaid.toLocaleString("en-IN")} | Status: ${status}`, {
        ...subCtx,
        details: { cycleMonth: ym, totalPaid, status },
      });
    }
  }

  const sortedCycles = Array.from(cyclesMap.values()).sort((a, b) =>
    b.cycleMonth.localeCompare(a.cycleMonth),
  );

  // Update subscription currentCycle with the most recent cycle found
  if (sortedCycles.length > 0) {
    const latest = sortedCycles[0];
    await db.collection("subscriptions").doc(subscription.id).update({
      currentCycle: sanitizeForFirestore(latest),
      updatedAt: new Date().toISOString(),
    });
  }

  log("success", `Historical scan complete for ${subscription.name}: Reconstructed ${sortedCycles.length} billing cycle(s)`, {
    ...subCtx,
    details: { cyclesCount: sortedCycles.length, messagesScanned: totalMessagesScanned },
  });

  return {
    subscriptionId: subscription.id,
    subscriptionName: subscription.name,
    success: true,
    cyclesFound: sortedCycles.length,
    cycles: sortedCycles,
    messagesScanned: totalMessagesScanned,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Runs a full synchronization for all automated subscriptions of a user
 */
export async function syncAllSubscriptions(
  userId = "default_user",
  onLog?: SyncLogCallback,
): Promise<{
  success: boolean;
  totalSubscriptions: number;
  syncedCount: number;
  totalNewMessages: number;
  results: SyncSubscriptionResult[];
  errors: string[];
}> {
  const log = createSyncLogger(onLog);
  log("info", `Initiating global Gmail sync for user: ${userId}`);

  const startTime = Date.now();
  const tokenRecord = await getValidGmailToken(userId);

  if (!tokenRecord) {
    const errText = "Gmail integration is not connected or token has expired. Please connect your Gmail account via OAuth.";
    log("error", errText);
    throw new Error(errText);
  }

  log("info", `OAuth token verified for ${tokenRecord.email || userId}`);

  const { db } = getFirebaseAdmin();

  // Support flexible user ID candidates (e.g. email, normalized email, token email, default_user)
  const candidateUserIds = Array.from(
    new Set([
      userId,
      userId.replace(/[^a-zA-Z0-9_-]/g, "_"),
      tokenRecord.email,
      "default_user",
    ]),
  ).filter(Boolean) as string[];

  let subsSnap = await db
    .collection("subscriptions")
    .where("userId", "in", candidateUserIds.slice(0, 10))
    .get();

  if (subsSnap.empty) {
    subsSnap = await db.collection("subscriptions").limit(100).get();
  }

  const subscriptions: Subscription[] = [];
  subsSnap.forEach((doc) => {
    const data = doc.data() as Subscription;
    const hasEmailConfig =
      data.emailConfig?.enabled ||
      Boolean(data.emailConfig?.statementQuery?.trim()) ||
      Boolean(data.emailConfig?.paymentQuery?.trim()) ||
      data.source === "EMAIL_AUTOMATED";

    if (hasEmailConfig) {
      subscriptions.push({ ...data, id: doc.id });
    }
  });

  log("info", `Found ${subscriptions.length} active email-configured subscription(s) to synchronize`);

  const results: SyncSubscriptionResult[] = [];
  const errors: string[] = [];
  let totalNewMessages = 0;

  let currentAccessToken = tokenRecord.accessToken;

  for (let idx = 0; idx < subscriptions.length; idx++) {
    const sub = subscriptions[idx];
    log("info", `[${idx + 1}/${subscriptions.length}] Processing ${sub.name}...`, { subscriptionId: sub.id, subscriptionName: sub.name });

    if (sub.currentCycle.status === "PAUSED" || sub.currentCycle.status === "ARCHIVED") {
      log("info", `Skipping ${sub.name} (Status is ${sub.currentCycle.status})`, { subscriptionId: sub.id, subscriptionName: sub.name });
      continue;
    }

    try {
      const res = await syncSubscriptionWithGmail(sub, currentAccessToken, onLog);
      results.push(res);
      totalNewMessages += res.newMessagesProcessed;
      if (res.warnings) {
        errors.push(...res.warnings.map((w) => `[${sub.name}] ${w}`));
      }
    } catch (err: any) {
      if (err.message && err.message.includes("401")) {
        log("warn", `Access token expired during ${sub.name}. Refreshing token...`, { subscriptionId: sub.id, subscriptionName: sub.name });
        const refreshed = await getValidGmailToken(userId, true);
        if (refreshed) {
          currentAccessToken = refreshed.accessToken;
          log("info", `Successfully refreshed access token. Retrying sync for ${sub.name}...`, { subscriptionId: sub.id, subscriptionName: sub.name });
          try {
            const retryRes = await syncSubscriptionWithGmail(sub, currentAccessToken, onLog);
            results.push(retryRes);
            totalNewMessages += retryRes.newMessagesProcessed;
            if (retryRes.warnings) {
              errors.push(...retryRes.warnings.map((w) => `[${sub.name}] ${w}`));
            }
            continue;
          } catch {
            // fall through to error
          }
        }
      }

      const msg = `[${sub.name}] Sync failed: ${err.message || "Unknown error"}`;
      errors.push(msg);
      log("error", msg, { subscriptionId: sub.id, subscriptionName: sub.name });
      results.push({
        subscriptionId: sub.id,
        subscriptionName: sub.name,
        success: false,
        status: sub.currentCycle.status,
        newMessagesProcessed: 0,
        error: msg,
      });
    }
  }

  // Update lastSyncAt on gmail_tokens
  try {
    await db.collection("gmail_tokens").doc(userId).update({
      lastSyncAt: new Date().toISOString(),
    });
  } catch {
    // optional update
  }

  const auditLog: SyncAuditLog = {
    id: `sync_${Date.now()}`,
    userId,
    timestamp: new Date().toISOString(),
    subscriptionsProcessed: subscriptions.length,
    statementsFound: results.filter((r) => r.statementTotal !== undefined).length,
    paymentsFound: results.filter((r) => r.paidAmount && r.paidAmount > 0).length,
    errorsCount: errors.length,
    durationMs: Date.now() - startTime,
    details: results.map((r) => ({
      subscriptionId: r.subscriptionId,
      subscriptionName: r.subscriptionName,
      status: r.status,
      message: r.error || (r.warnings ? r.warnings.join("; ") : undefined),
      messagesProcessed: r.newMessagesProcessed,
    })),
  };

  await db.collection("sync_audit_logs").doc(auditLog.id).set(auditLog);

  log("success", `Global sync complete! Processed ${subscriptions.length} subscriptions in ${((Date.now() - startTime) / 1000).toFixed(1)}s (${totalNewMessages} new emails parsed)`, {
    details: {
      totalSubscriptions: subscriptions.length,
      syncedCount: results.filter((r) => r.success).length,
      totalNewMessages,
      durationMs: Date.now() - startTime,
    },
  });

  return {
    success: true,
    totalSubscriptions: subscriptions.length,
    syncedCount: results.filter((r) => r.success).length,
    totalNewMessages,
    results,
    errors,
  };
}
