import { getFirebaseAdmin } from "../firebaseAdmin";
import { sanitizeForFirestore } from "../emailStorage";
import { Subscription, CycleState, HistoricalCycle } from "../subscriptionTypes";
import { getTnebAccount, getTnebBillsForConsumer } from "./storage";
import { TnebBillRecord, TnebConsumerAccount } from "./types";

/**
 * Updates any subscription linked to a TNEB consumer with the latest bill and historical cycles
 */
export async function syncTnebToSubscriptions(
  account: TnebConsumerAccount,
  bills: TnebBillRecord[],
): Promise<number> {
  const { db } = getFirebaseAdmin();
  const subSnap = await db
    .collection("subscriptions")
    .where("source", "==", "TNEB_MODULE")
    .get();

  let updatedCount = 0;

  for (const doc of subSnap.docs) {
    const sub = doc.data() as Subscription;
    if (sub.tnebConfig?.consumerNumber === account.consumerNumber) {
      const latestBill = bills.length > 0 ? bills[0] : account.latestBill;

      if (latestBill) {
        const isPaid = latestBill.isPaid || latestBill.amountPaid >= latestBill.totalCharges;
        const remaining = isPaid ? 0 : latestBill.amountToBePaid || Math.max(0, latestBill.totalCharges - latestBill.amountPaid);

        const currentCycle: CycleState = {
          cycleMonth: latestBill.cycleMonth,
          statementDate: latestBill.assessmentDate,
          dueDate: latestBill.dueDate,
          statementTotal: latestBill.totalCharges,
          paidAmount: latestBill.amountPaid,
          remainingBalance: remaining,
          status: isPaid ? "FULLY_PAID" : "UNPAID",
          lastPaymentDate: latestBill.paymentDate,
          processedMessageIds: latestBill.receiptNo ? [latestBill.receiptNo] : [],
          updatedAt: new Date().toISOString(),
        };

        await doc.ref.update({
          currentCycle: sanitizeForFirestore(currentCycle),
          defaultAmount: latestBill.totalCharges,
          dueDayOfMonth: latestBill.dueDate ? parseInt(latestBill.dueDate.split("-")[2], 10) : sub.dueDayOfMonth,
          "tnebConfig.tariffCode": account.tariffCode,
          "tnebConfig.section": account.section,
          "tnebConfig.meterNumber": account.meterNumber,
          updatedAt: new Date().toISOString(),
        });

        // Also backfill cycles subcollection
        const batch = db.batch();
        for (const bill of bills) {
          const bIsPaid = bill.isPaid || bill.amountPaid >= bill.totalCharges;
          const bRemaining = bIsPaid ? 0 : bill.amountToBePaid || Math.max(0, bill.totalCharges - bill.amountPaid);
          const histCycle: HistoricalCycle = {
            id: `${doc.id}_${bill.cycleMonth}`,
            subscriptionId: doc.id,
            subscriptionName: sub.name,
            currency: sub.currency || "INR",
            cycleMonth: bill.cycleMonth,
            statementDate: bill.assessmentDate,
            dueDate: bill.dueDate,
            statementTotal: bill.totalCharges,
            paidAmount: bill.amountPaid,
            remainingBalance: bRemaining,
            status: bIsPaid ? "FULLY_PAID" : "UNPAID",
            lastPaymentDate: bill.paymentDate,
            processedMessageIds: bill.receiptNo ? [bill.receiptNo] : [],
            createdAt: bill.createdAt || new Date().toISOString(),
            updatedAt: bill.updatedAt || new Date().toISOString(),
          };

          const cycleRef = doc.ref.collection("cycles").doc(bill.cycleMonth);
          batch.set(cycleRef, sanitizeForFirestore(histCycle), { merge: true });
        }
        await batch.commit();

        updatedCount++;
      }
    }
  }

  return updatedCount;
}

/**
 * Creates or links a Subscription for a specific TNEB Consumer Number
 */
export async function createSubscriptionForTnebConsumer(
  consumerNumber: string,
  nickname?: string,
  userId: string = "default-user",
): Promise<Subscription> {
  const { db } = getFirebaseAdmin();
  const [account, bills] = await Promise.all([
    getTnebAccount(consumerNumber),
    getTnebBillsForConsumer(consumerNumber),
  ]);

  const latestBill = bills.length > 0 ? bills[0] : account?.latestBill;
  const todayIso = new Date().toISOString();
  const currentMonthStr = todayIso.slice(0, 7);

  // Check if a subscription already exists with this consumer number
  const existingSnap = await db
    .collection("subscriptions")
    .where("source", "==", "TNEB_MODULE")
    .get();

  for (const doc of existingSnap.docs) {
    const s = doc.data() as Subscription;
    if (s.tnebConfig?.consumerNumber === consumerNumber) {
      if (nickname && nickname !== s.name) {
        await doc.ref.update({ name: nickname, "tnebConfig.nickname": nickname });
      }
      return { ...s, id: doc.id };
    }
  }

  // Create new Subscription
  const isPaid = latestBill ? (latestBill.isPaid || latestBill.amountPaid >= latestBill.totalCharges) : true;
  const statementTotal = latestBill?.totalCharges || 0;
  const paidAmount = latestBill?.amountPaid || 0;
  const remainingBalance = isPaid ? 0 : (latestBill?.amountToBePaid || Math.max(0, statementTotal - paidAmount));

  const currentCycle: CycleState = {
    cycleMonth: latestBill?.cycleMonth || currentMonthStr,
    statementDate: latestBill?.assessmentDate,
    dueDate: latestBill?.dueDate,
    statementTotal,
    paidAmount,
    remainingBalance,
    status: isPaid ? "FULLY_PAID" : "UNPAID",
    lastPaymentDate: latestBill?.paymentDate,
    processedMessageIds: latestBill?.receiptNo ? [latestBill.receiptNo] : [],
    updatedAt: todayIso,
  };

  const displayName = nickname
    ? nickname
    : account?.consumerName
    ? `TNEB - ${account.consumerName}`
    : `TNEB EB #${consumerNumber}`;

  const subData: Omit<Subscription, "id"> = {
    userId,
    name: displayName,
    category: "Utilities",
    billingType: "BILL_GENERATED",
    source: "TNEB_MODULE",
    currency: "INR",
    defaultAmount: statementTotal,
    billingCycle: "CUSTOM",
    dueDayOfMonth: latestBill?.dueDate ? parseInt(latestBill.dueDate.split("-")[2], 10) : 9,
    notes: `Tamil Nadu Electricity Board Service #${consumerNumber} • Tariff: ${account?.tariffCode || "LA1A"} • Section: ${account?.section || ""}`,
    color: "#f59e0b", // Amber
    tnebConfig: {
      consumerNumber,
      nickname,
      tariffCode: account?.tariffCode,
      section: account?.section,
      meterNumber: account?.meterNumber,
      autoSyncWithEbModule: true,
    },
    currentCycle,
    createdAt: todayIso,
    updatedAt: todayIso,
  };

  const cleanSub = sanitizeForFirestore(subData);
  const docRef = await db.collection("subscriptions").add(cleanSub);

  // Add historical cycles
  if (bills.length > 0) {
    const batch = db.batch();
    for (const bill of bills) {
      const bIsPaid = bill.isPaid || bill.amountPaid >= bill.totalCharges;
      const histCycle: HistoricalCycle = {
        id: `${docRef.id}_${bill.cycleMonth}`,
        subscriptionId: docRef.id,
        subscriptionName: displayName,
        currency: "INR",
        cycleMonth: bill.cycleMonth,
        statementDate: bill.assessmentDate,
        dueDate: bill.dueDate,
        statementTotal: bill.totalCharges,
        paidAmount: bill.amountPaid,
        remainingBalance: bIsPaid ? 0 : (bill.amountToBePaid || Math.max(0, bill.totalCharges - bill.amountPaid)),
        status: bIsPaid ? "FULLY_PAID" : "UNPAID",
        lastPaymentDate: bill.paymentDate,
        processedMessageIds: bill.receiptNo ? [bill.receiptNo] : [],
        createdAt: bill.createdAt || todayIso,
        updatedAt: bill.updatedAt || todayIso,
      };

      const cycleRef = docRef.collection("cycles").doc(bill.cycleMonth);
      batch.set(cycleRef, sanitizeForFirestore(histCycle), { merge: true });
    }
    await batch.commit();
  }

  return { id: docRef.id, ...subData };
}
