import { getFirebaseAdmin } from "../firebaseAdmin";
import {
  CycleState,
  PaymentStatus,
  RawSmsRecord,
  Subscription,
} from "../subscriptionTypes";
import { parseLoanSms } from "../parsers/loanSmsParser";

export interface SmsSyncResult {
  success: boolean;
  userId: string;
  totalSmsFound: number;
  matchedSmsCount: number;
  updatedSubscriptions: number;
  summaryText: string;
  details: Array<{
    subscriptionId: string;
    subscriptionName: string;
    cycleMonth: string;
    amountPaid: number;
    status: PaymentStatus;
    smsDate: string;
  }>;
}

/**
 * Reconciles stored raw SMS messages into active SMS_AUTOMATED subscriptions
 */
export async function runSmsSyncEngine(userId: string): Promise<SmsSyncResult> {
  const { db } = getFirebaseAdmin();

  // 1. Fetch all raw SMS for this user
  const smsSnap = await db
    .collection("raw_sms")
    .where("userId", "==", userId)
    .get();

  const smsRecords: RawSmsRecord[] = smsSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<RawSmsRecord, "id">),
  }));

  // Sort chronological
  smsRecords.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  // 2. Fetch all subscriptions for this user
  const subSnap = await db
    .collection("subscriptions")
    .where("userId", "==", userId)
    .get();

  const subscriptions: Subscription[] = subSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Subscription, "id">),
  }));

  const smsSubscriptions = subscriptions.filter(
    (s) =>
      s.source === "SMS_AUTOMATED" ||
      s.smsConfig?.enabled ||
      s.category === "Loans & EMIs" ||
      s.name.toLowerCase().includes("loan") ||
      s.name.toLowerCase().includes("emi"),
  );

  let matchedSmsCount = 0;
  let updatedSubsCount = 0;
  const syncDetails: SmsSyncResult["details"] = [];

  for (const sub of smsSubscriptions) {
    let subModified = false;
    const config = sub.smsConfig;
    let senderQuery = config?.senderQuery?.toLowerCase().trim() || "";

    // Auto-infer bank sender from name if not explicitly configured
    if (!senderQuery) {
      const subNameLower = sub.name.toLowerCase();
      if (subNameLower.includes("boi") || subNameLower.includes("bank of india")) {
        senderQuery = "boi";
      } else if (subNameLower.includes("hdfc")) {
        senderQuery = "hdfc";
      } else if (subNameLower.includes("sbi")) {
        senderQuery = "sbi";
      } else if (subNameLower.includes("icici")) {
        senderQuery = "icici";
      } else if (subNameLower.includes("canara") || subNameLower.includes("canbnk")) {
        senderQuery = "can";
      } else if (subNameLower.includes("axis")) {
        senderQuery = "axis";
      } else if (subNameLower.includes("kotak")) {
        senderQuery = "kotak";
      } else if (subNameLower.includes("bajaj")) {
        senderQuery = "bajaj";
      }
    }

    const filterKeywords = config?.filterKeywords || [
      "loan",
      "emi",
      "recovery",
      "loan rec",
      "debited(trf)",
      "debited",
    ];
    const loanDigits = config?.accountOrLoanDigits?.trim() || "";

    // Find SMS that matches this subscription
    const matchingSms = smsRecords.filter((sms) => {
      const sender = sms.sender.toLowerCase();
      const body = sms.body.toLowerCase();

      // Check sender match if senderQuery is defined (or in body prefix like "BOI -")
      if (senderQuery && !sender.includes(senderQuery) && !body.includes(`${senderQuery} -`) && !body.includes(`${senderQuery}:`)) {
        return false;
      }

      // Check loan account digits if defined
      if (loanDigits && !body.includes(loanDigits)) {
        return false;
      }

      // Check keywords
      const hasKeyword = filterKeywords.some((kw) =>
        body.includes(kw.toLowerCase().trim()),
      );

      return hasKeyword;
    });

    if (matchingSms.length === 0) continue;

    // Group matching SMS by cycle month YYYY-MM
    const cyclesMap = new Map<string, { sms: RawSmsRecord; parsed: ReturnType<typeof parseLoanSms> }[]>();

    for (const sms of matchingSms) {
      const parsed = parseLoanSms(sms.body, sms.sender, sms.timestamp);
      if (!parsed.isMatch || !parsed.amount || !parsed.cycleMonth) continue;

      matchedSmsCount++;
      const month = parsed.cycleMonth;
      if (!cyclesMap.has(month)) {
        cyclesMap.set(month, []);
      }
      cyclesMap.get(month)!.push({ sms, parsed });
    }

    // Process each cycle month
    for (const [month, items] of cyclesMap.entries()) {
      // Calculate total paid in this month
      let totalPaid = 0;
      let latestPaymentDate = "";
      const sourceSmsList: RawSmsRecord[] = [];

      for (const item of items) {
        totalPaid += item.parsed.amount || 0;
        if (item.parsed.date && (!latestPaymentDate || item.parsed.date > latestPaymentDate)) {
          latestPaymentDate = item.parsed.date;
        }
        sourceSmsList.push({
          ...item.sms,
          processed: true,
          matchedSubscriptionId: sub.id,
          extractedAmount: item.parsed.amount || undefined,
          extractedDate: item.parsed.date || undefined,
          accountReference: item.parsed.loanAccount || undefined,
        });
      }

      const expectedAmount = sub.defaultAmount || totalPaid;
      const status: PaymentStatus =
        totalPaid >= expectedAmount ? "FULLY_PAID" : totalPaid > 0 ? "PARTIALLY_PAID" : "UNPAID";

      let calculatedDueDate: string | undefined;
      if (sub.dueDayOfMonth) {
        const [yStr, mStr] = month.split("-");
        const maxDays = new Date(Number(yStr), Number(mStr), 0).getDate();
        const validDay = Math.min(sub.dueDayOfMonth, maxDays);
        calculatedDueDate = `${yStr}-${mStr}-${String(validDay).padStart(2, "0")}`;
      }

      const cycleState: CycleState = {
        cycleMonth: month,
        dueDate: calculatedDueDate,
        statementTotal: expectedAmount,
        paidAmount: totalPaid,
        remainingBalance: Math.max(0, expectedAmount - totalPaid),
        status,
        lastPaymentDate: latestPaymentDate || undefined,
        processedMessageIds: sourceSmsList.map((s) => s.id),
        sourceSms: sourceSmsList,
        updatedAt: new Date().toISOString(),
      };

      const cycleDocId = `${sub.id}_${month}`;
      const cycleRecord = {
        ...cycleState,
        id: cycleDocId,
        subscriptionId: sub.id,
        subscriptionName: sub.name,
        currency: sub.currency || "INR",
      };

      // 1. Save to subscription_cycles collection (queried by listHistoricalCycles)
      await db
        .collection("subscription_cycles")
        .doc(cycleDocId)
        .set(cycleRecord, { merge: true });

      // 2. Also save to subcollection for redundancy
      await db
        .collection("subscriptions")
        .doc(sub.id)
        .collection("cycles")
        .doc(month)
        .set(cycleRecord, { merge: true });

      // If current cycle month matches, update subscription currentCycle
      const currentMonthStr = new Date().toISOString().slice(0, 7);
      if (month === currentMonthStr || !sub.currentCycle || month >= (sub.currentCycle.cycleMonth || "")) {
        sub.currentCycle = cycleState;
        subModified = true;
      }

      syncDetails.push({
        subscriptionId: sub.id,
        subscriptionName: sub.name,
        cycleMonth: month,
        amountPaid: totalPaid,
        status,
        smsDate: latestPaymentDate,
      });
    }

    if (subModified) {
      await db.collection("subscriptions").doc(sub.id).update({
        currentCycle: sub.currentCycle,
        updatedAt: new Date().toISOString(),
      });
      updatedSubsCount++;
    }
  }

  return {
    success: true,
    userId,
    totalSmsFound: smsRecords.length,
    matchedSmsCount,
    updatedSubscriptions: updatedSubsCount,
    summaryText: `Synced ${smsRecords.length} raw SMS records. Reconciled ${matchedSmsCount} matching loan debits across ${updatedSubsCount} subscriptions.`,
    details: syncDetails,
  };
}
