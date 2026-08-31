import { getFirebaseAdmin } from "../firebaseAdmin";
import { sanitizeForFirestore, saveEmailSnapshot } from "../emailStorage";
import { getParserForConfig } from "../parsers";
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
): Promise<SyncSubscriptionResult> {
  const emailConfig = subscription.emailConfig;
  if (!emailConfig || !emailConfig.enabled) {
    return {
      subscriptionId: subscription.id,
      subscriptionName: subscription.name,
      success: true,
      status: subscription.currentCycle.status,
      newMessagesProcessed: 0,
      warnings: ["Email sync disabled for this subscription."],
    };
  }

  const parser = getParserForConfig(emailConfig);
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
    try {
      const statementMessages = await searchGmailMessages(
        accessToken,
        emailConfig.statementQuery.trim(),
        5,
      );

      if (statementMessages.length > 0) {
        const latestMsgSummary = statementMessages[0];
        const msgDetail = await getGmailMessageDetails(accessToken, latestMsgSummary.id);

        const content = `${msgDetail.bodyText}\n${msgDetail.bodyHtml}`;
        const stmtParsed = parser.parseStatement(content, msgDetail.subject);

        if (stmtParsed.success && stmtParsed.statementTotal !== undefined) {
          cycle.statementTotal = stmtParsed.statementTotal;
          if (stmtParsed.dueDate) {
            cycle.dueDate = stmtParsed.dueDate;
          }

          // Use parsed statementDate or fallback to the email message's actual internal date
          const actualMsgDate = msgDetail.internalDate
            ? new Date(parseInt(msgDetail.internalDate)).toISOString().split("T")[0]
            : msgDetail.date
            ? new Date(msgDetail.date).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0];

          cycle.statementDate = stmtParsed.statementDate || actualMsgDate;
          const ym = (stmtParsed.statementDate || actualMsgDate).slice(0, 7);
          if (ym) cycle.cycleMonth = ym;

          // Save copy of source statement email to Firebase Storage & Firestore
          const archivedEmail = await saveEmailSnapshot({
            userId: subscription.userId || "default_user",
            subscriptionId: subscription.id,
            subscriptionName: subscription.name,
            cycleMonth: cycle.cycleMonth,
            messageId: latestMsgSummary.id,
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

          // Replace or add to cycle.sourceEmails
          if (!cycle.sourceEmails) cycle.sourceEmails = [];
          const existingIdx = cycle.sourceEmails.findIndex((e) => e.id === latestMsgSummary.id);
          if (existingIdx >= 0) {
            cycle.sourceEmails[existingIdx] = archivedEmail;
          } else {
            // Keep only statement emails and valid payments in cycle.sourceEmails
            cycle.sourceEmails = cycle.sourceEmails.filter((e) => e.type !== "STATEMENT");
            cycle.sourceEmails.unshift(archivedEmail);
          }

          if (!cycle.processedMessageIds.includes(latestMsgSummary.id)) {
            cycle.processedMessageIds.push(latestMsgSummary.id);
            newMessagesProcessed++;
          }
        } else {
          warnings.push(
            `Statement parser mismatch: ${stmtParsed.error || "Could not extract statement amount"}`,
          );
          cycle.lastError = stmtParsed.error;
          cycle.status = "MISMATCH_REVIEW";
        }
      }
    } catch (err) {
      warnings.push(`Statement query error: ${(err as Error).message}`);
    }
  }

  // 2. Execute Payment Query (if configured)
  if (emailConfig.paymentQuery && emailConfig.paymentQuery.trim()) {
    try {
      const paymentMessages = await searchGmailMessages(
        accessToken,
        emailConfig.paymentQuery.trim(),
        15,
      );

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
        const payParsed = parser.parsePayment(content, msgDetail.subject);

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

          if (!cycle.sourceEmails) cycle.sourceEmails = [];
          if (!cycle.sourceEmails.some((e) => e.id === pMsg.id)) {
            cycle.sourceEmails.push(archivedEmail);
          }

          cycle.processedMessageIds.push(pMsg.id);
          newMessagesProcessed++;
        } else {
          warnings.push(
            `Payment parser mismatch for msg ${pMsg.id}: ${payParsed.error || "Could not extract payment amount"}`,
          );
        }
      }
    } catch (err) {
      warnings.push(`Payment query error: ${(err as Error).message}`);
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
): Promise<{
  subscriptionId: string;
  subscriptionName: string;
  success: boolean;
  cyclesFound: number;
  cycles: HistoricalCycle[];
  messagesScanned: number;
  warnings?: string[];
}> {
  const emailConfig = subscription.emailConfig;
  if (!emailConfig || !emailConfig.enabled) {
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

  const parser = getParserForConfig(emailConfig);
  const { db } = getFirebaseAdmin();
  const warnings: string[] = [];
  let totalMessagesScanned = 0;

  // 1. Fetch all matching historical statement emails (if statement query is configured)
  const statementMessages =
    emailConfig.statementQuery && emailConfig.statementQuery.trim()
      ? await searchGmailMessages(accessToken, emailConfig.statementQuery.trim(), maxStatements)
      : [];
  totalMessagesScanned += statementMessages.length;

  // 2. Fetch all matching payment emails (if payment query is configured)
  const paymentMessages =
    emailConfig.paymentQuery && emailConfig.paymentQuery.trim()
      ? await searchGmailMessages(
          accessToken,
          emailConfig.paymentQuery.trim(),
          Math.max(100, maxStatements * 2),
        )
      : [];
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
      const payParsed = parser.parsePayment(content, msgDetail.subject);

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
        const stmtParsed = parser.parseStatement(content, msgDetail.subject);

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

      // Exact cycle payment window:
      // Starts on statement date (minus 1 day for same-day settlements)
      // Ends when the next statement is generated (or dueDate + 12 days for the latest statement)
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
    }
  } else if (deduplicatedPayments.length > 0) {
    // Mode B: Payment-Driven Cycles (e.g. Vehicle Cleaning, Maid, Fixed Recurring, Gold Schemes with no separate statement email)
    // Group all found payments by their billing month (YYYY-MM)
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
      
      // Expected statement amount: defaultAmount or highest payment amount
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
export async function syncAllSubscriptions(userId = "default_user"): Promise<{
  success: boolean;
  totalSubscriptions: number;
  syncedCount: number;
  totalNewMessages: number;
  results: SyncSubscriptionResult[];
  errors: string[];
}> {
  const startTime = Date.now();
  const tokenRecord = await getValidGmailToken(userId);

  if (!tokenRecord) {
    throw new Error(
      "Gmail integration is not connected or token has expired. Please connect your Gmail account via OAuth.",
    );
  }

  const { db } = getFirebaseAdmin();
  const subsSnap = await db
    .collection("subscriptions")
    .where("userId", "==", userId)
    .where("source", "==", "EMAIL_AUTOMATED")
    .get();

  const subscriptions: Subscription[] = [];
  subsSnap.forEach((doc) => {
    subscriptions.push({ id: doc.id, ...(doc.data() as Omit<Subscription, "id">) });
  });

  const results: SyncSubscriptionResult[] = [];
  const errors: string[] = [];
  let totalNewMessages = 0;

  for (const sub of subscriptions) {
    if (sub.currentCycle.status === "PAUSED" || sub.currentCycle.status === "ARCHIVED") {
      continue;
    }

    try {
      const res = await syncSubscriptionWithGmail(sub, tokenRecord.accessToken);
      results.push(res);
      totalNewMessages += res.newMessagesProcessed;
      if (res.warnings) {
        errors.push(...res.warnings.map((w) => `[${sub.name}] ${w}`));
      }
    } catch (err) {
      const msg = `[${sub.name}] Sync failed: ${(err as Error).message}`;
      errors.push(msg);
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
  await saveGmailTokens(userId, {
    accessToken: tokenRecord.accessToken,
    expiryDate: Date.now() + 3600000,
  });
  await db.collection("gmail_tokens").doc(userId).update({
    lastSyncAt: new Date().toISOString(),
  });

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

  return {
    success: true,
    totalSubscriptions: subscriptions.length,
    syncedCount: results.filter((r) => r.success).length,
    totalNewMessages,
    results,
    errors,
  };
}
