import { getFirebaseAdmin } from "../firebaseAdmin";
import { sanitizeForFirestore, saveEmailSnapshot } from "../emailStorage";
import { getParserForModule } from "../parsers";
import {
  HistoricalCycle,
  ParsedStatement,
  PaymentStatus,
  SourceEmailRecord,
  Subscription,
} from "../subscriptionTypes";
import {
  isPrepaidSubscription,
  isAdvancePaymentSubscription,
} from "../subscriptionUtils";
import { getGmailMessageDetails, searchGmailMessages } from "./apiClient";
import { createSyncLogger, SyncLogCallback } from "./syncLogger";

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
    subscription.smsConfig?.dedupStrategy ||
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

          const isPrepaidSub = isPrepaidSubscription(subscription);

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

          const isAdvanceDepositOrPrepaid = isAdvancePaymentSubscription(subscription) ||
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
