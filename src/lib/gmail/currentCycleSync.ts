import { getFirebaseAdmin } from "../firebaseAdmin";
import { sanitizeForFirestore, saveEmailSnapshot } from "../emailStorage";
import { getParserForModule } from "../parsers";
import {
  CycleState,
  PaymentStatus,
  Subscription,
} from "../subscriptionTypes";
import {
  isPrepaidSubscription,
  computeRemainingBalance,
  getCycleDocId,
} from "../subscriptionUtils";
import { getGmailMessageDetails, searchGmailMessages } from "./apiClient";
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

            if (!subscription.statementDayOfMonth && cycle.statementDate) {
              const day = parseInt(cycle.statementDate.slice(8, 10), 10);
              if (!isNaN(day) && day >= 1 && day <= 31) {
                subscription.statementDayOfMonth = day;
              }
            }

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
            subscription.smsConfig?.dedupStrategy ||
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
            isDuplicate: isDuplicatePayment,
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

    const isPrepaidSub = isPrepaidSubscription(subscription);

    // For prepaid subscriptions (where the invoice email is also the payment receipt)
    if (isPrepaidSub && paid === 0 && total > 0) {
      paid = total;
      cycle.paidAmount = paid;
      cycle.lastPaymentDate = cycle.statementDate || new Date().toISOString().split("T")[0];
      cycle.dueDate = undefined;
    }

    const remaining = computeRemainingBalance(total, paid);

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

  const cycleDocId = getCycleDocId(subscription.id, cycle.cycleMonth);
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
