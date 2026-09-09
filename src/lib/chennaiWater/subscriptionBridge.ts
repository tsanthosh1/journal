import { getFirebaseAdmin } from "../firebaseAdmin";
import { sanitizeForFirestore, getCycleDocId } from "../subscriptionUtils";
import { Subscription, CycleState, HistoricalCycle } from "../subscriptionTypes";
import { ChennaiWaterReceipt } from "./types";
import {
  getChennaiWaterSession,
  getStoredProperties,
  getStoredReceipts,
  INITIAL_PROPERTY_SEED,
} from "./storage";

/**
 * Extracts a "YYYY-MM" string from receipt_dt (e.g. "17/05/2026" or "2026-05-17")
 */
function extractReceiptCycleMonth(receiptDate: string): string {
  if (!receiptDate) return new Date().toISOString().slice(0, 7);
  if (receiptDate.includes("/")) {
    const parts = receiptDate.split("/");
    if (parts.length === 3) {
      const year = parts[2].trim();
      const month = parts[1].trim().padStart(2, "0");
      return `${year}-${month}`;
    }
  }
  if (/^\d{4}-\d{2}/.test(receiptDate)) {
    return receiptDate.slice(0, 7);
  }
  return new Date().toISOString().slice(0, 7);
}

/**
 * Backfills past CMWSSB receipts into canonical subscription_cycles
 */
export async function syncPastReceiptsToCanonicalCycles(
  subscriptionId: string,
  receipts: ChennaiWaterReceipt[],
  subscriptionName: string = "Chennai Metro Water"
): Promise<number> {
  const { db } = getFirebaseAdmin();
  if (!receipts || receipts.length === 0) return 0;

  const batch = db.batch();
  let count = 0;

  for (const r of receipts) {
    const cycleMonth = extractReceiptCycleMonth(r.receipt_dt);
    const cycleDocId = getCycleDocId(subscriptionId, cycleMonth);
    const amt = Number(r.amount || 0);

    let parsedIsoDate: string | undefined = undefined;
    if (r.receipt_dt && r.receipt_dt.includes("/")) {
      const [day, month, year] = r.receipt_dt.split("/");
      parsedIsoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const histCycle: HistoricalCycle = {
      id: cycleDocId,
      subscriptionId,
      subscriptionName,
      currency: "INR",
      cycleMonth,
      statementDate: parsedIsoDate,
      dueDate: parsedIsoDate,
      statementTotal: amt,
      paidAmount: amt,
      remainingBalance: 0,
      status: "FULLY_PAID",
      lastPaymentDate: parsedIsoDate,
      processedMessageIds: r.receipt_no ? [r.receipt_no] : [],
      updatedAt: new Date().toISOString(),
      createdAt: parsedIsoDate || new Date().toISOString(),
    };

    const ref = db.collection("subscription_cycles").doc(cycleDocId);
    batch.set(ref, sanitizeForFirestore(histCycle), { merge: true });
    count++;
  }

  await batch.commit();
  return count;
}

/**
 * Creates or updates a canonical Subscription for Chennai Metro Water
 */
export async function createSubscriptionForChennaiWater(
  billNumber?: string,
  customNickname?: string,
  userId: string = "default-user"
): Promise<Subscription> {
  const { db } = getFirebaseAdmin();
  const session = await getChennaiWaterSession(userId);
  const properties = await getStoredProperties(userId);
  const activeBill = billNumber || session?.activeBillNo || properties[0]?.prop_no;

  if (!activeBill) {
    throw new Error("No Chennai Water property or bill number found for this account.");
  }

  const prop =
    properties.find((p) => p.prop_no === activeBill) ||
    properties[0];

  if (!prop) {
    throw new Error("No matching Chennai Water property found.");
  }

  const receipts = await getStoredReceipts(prop.id, userId);
  const latestReceipt = receipts[0];

  const todayIso = new Date().toISOString();
  const currentMonthStr = todayIso.slice(0, 7);

  // Check if subscription already exists for this bill number
  const subSnap = await db
    .collection("subscriptions")
    .where("source", "==", "CHENNAI_WATER_MODULE")
    .get();

  let existingSubDoc = subSnap.docs.find((d) => {
    const s = d.data() as Subscription;
    return (!s.userId || s.userId === userId) && s.chennaiWaterConfig?.billNumber === activeBill;
  });

  const latestReceiptCycleMonth = latestReceipt
    ? extractReceiptCycleMonth(latestReceipt.receipt_dt)
    : currentMonthStr;

  const halfYearTaxNum =
    typeof prop.half_year_tax === "string"
      ? parseFloat(prop.half_year_tax.replace(/[^0-9.]/g, "")) || 419
      : Number(prop.half_year_tax || 419);

  const defaultAmt = latestReceipt?.amount || halfYearTaxNum || 1028;

  const currentCycle: CycleState = {
    cycleMonth: latestReceiptCycleMonth,
    statementDate: todayIso.split("T")[0],
    dueDate: undefined,
    statementTotal: defaultAmt,
    paidAmount: defaultAmt,
    remainingBalance: 0,
    status: "FULLY_PAID",
    lastPaymentDate: todayIso.split("T")[0],
    processedMessageIds: latestReceipt?.receipt_no ? [latestReceipt.receipt_no] : [],
    updatedAt: todayIso,
  };

  const name =
    customNickname ||
    `Chennai Metro Water (${activeBill})`;

  if (existingSubDoc) {
    const sub = existingSubDoc.data() as Subscription;
    await existingSubDoc.ref.update({
      name,
      currentCycle: sanitizeForFirestore(currentCycle),
      defaultAmount: defaultAmt,
      updatedAt: todayIso,
      chennaiWaterConfig: {
        billNumber: activeBill,
        existingBillNumber: prop.cmc_no || "15-193-56648-000",
        componentType: "TAX_AND_CHARGES",
        autoSyncWithMetroWaterModule: true,
      },
    });

    await syncPastReceiptsToCanonicalCycles(existingSubDoc.id, receipts, name);
    return { ...sub, id: existingSubDoc.id, currentCycle };
  }

  // Create new subscription
  const newSubRef = db.collection("subscriptions").doc();
  const newSub: Subscription = {
    id: newSubRef.id,
    userId,
    name,
    category: "Utilities",
    billingType: "BILL_GENERATED",
    source: "CHENNAI_WATER_MODULE",
    currency: "INR",
    defaultAmount: defaultAmt,
    billingCycle: "HALF_YEARLY",
    dueDayOfMonth: 15,
    notes: `CMWSSB Metro Water & Sewerage Tax. Annual Value: ${prop.annual_value || "₹11,960.00"}. Half Year Tax: ${prop.half_year_tax || "₹419.00"}. Address: ${prop.addr || ""}`,
    icon: "💧",
    color: "#0284c7",
    chennaiWaterConfig: {
      billNumber: activeBill,
      existingBillNumber: prop.cmc_no || "15-193-56648-000",
      componentType: "TAX_AND_CHARGES",
      autoSyncWithMetroWaterModule: true,
    },
    currentCycle,
    createdAt: todayIso,
    updatedAt: todayIso,
  };

  await newSubRef.set(sanitizeForFirestore(newSub));
  await syncPastReceiptsToCanonicalCycles(newSubRef.id, receipts, name);

  return newSub;
}

/**
 * Synchronizes Metro Water receipts and dues into all linked CHENNAI_WATER_MODULE subscriptions
 */
export async function syncChennaiWaterToSubscriptions(
  userId: string = "default-user"
): Promise<number> {
  const { db } = getFirebaseAdmin();
  const subSnap = await db
    .collection("subscriptions")
    .where("source", "==", "CHENNAI_WATER_MODULE")
    .get();

  if (subSnap.empty) return 0;

  const receipts = await getStoredReceipts(undefined, userId);
  let updatedCount = 0;

  for (const doc of subSnap.docs) {
    const sub = doc.data() as Subscription;
    if (userId && sub.userId && sub.userId !== userId) {
      continue;
    }
    const billNo = sub.chennaiWaterConfig?.billNumber;

    const matchingReceipts = receipts.filter(
      (r) => !billNo || r.prop_no === billNo
    );

    if (matchingReceipts.length > 0) {
      const latest = matchingReceipts[0];
      const cycleMonth = extractReceiptCycleMonth(latest.receipt_dt);
      const amt = latest.amount || sub.defaultAmount;

      const currentCycle: CycleState = {
        cycleMonth,
        statementDate: sub.currentCycle?.statementDate,
        dueDate: sub.currentCycle?.dueDate,
        statementTotal: amt,
        paidAmount: amt,
        remainingBalance: 0,
        status: "FULLY_PAID",
        lastPaymentDate: latest.receipt_dt,
        processedMessageIds: latest.receipt_no ? [latest.receipt_no] : [],
        updatedAt: new Date().toISOString(),
      };

      await doc.ref.update({
        currentCycle: sanitizeForFirestore(currentCycle),
        updatedAt: new Date().toISOString(),
      });

      await syncPastReceiptsToCanonicalCycles(doc.id, matchingReceipts, sub.name);
      updatedCount++;
    }
  }

  return updatedCount;
}
