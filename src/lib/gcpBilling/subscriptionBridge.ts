import { getFirebaseAdmin } from "../firebaseAdmin";
import { sanitizeForFirestore, getCycleDocId, areUserIdsEquivalent } from "../subscriptionUtils";
import { Subscription, CycleState, HistoricalCycle } from "../subscriptionTypes";
import {
  getCycleOverridesForSubscription,
  applyCycleOverride,
} from "../serverCycleOverrides";
import { getGcpHistoricalInvoices } from "./historicalStorage";
import { getGcpBillingConfigs } from "./storage";

/**
 * Checks if a Google Cloud subscription is already linked for the given user,
 * cleaning up any duplicates found across candidate user IDs.
 */
export async function getLinkedGcpSubscription(userId: string): Promise<Subscription | null> {
  const { db } = getFirebaseAdmin();
  const snap = await db
    .collection("subscriptions")
    .where("source", "==", "GCP_BILLING_MODULE")
    .get();

  const matchingDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

  for (const doc of snap.docs) {
    const sub = doc.data() as Subscription;
    if (areUserIdsEquivalent(sub.userId, userId)) {
      matchingDocs.push(doc);
    }
  }

  if (matchingDocs.length === 0) return null;

  // If duplicate documents exist, keep the best one and delete the rest
  if (matchingDocs.length > 1) {
    console.log(`[GCP Subscription Bridge] Found ${matchingDocs.length} duplicates for ${userId}, cleaning up...`);
    const canonicalIndex = matchingDocs.findIndex((d) => d.data().userId === userId);
    const keepDoc = canonicalIndex >= 0 ? matchingDocs[canonicalIndex] : matchingDocs[0];

    for (let i = 0; i < matchingDocs.length; i++) {
      if (matchingDocs[i].id !== keepDoc.id) {
        await matchingDocs[i].ref.delete();
      }
    }

    return { ...(keepDoc.data() as Subscription), id: keepDoc.id };
  }

  const single = matchingDocs[0];
  return { ...(single.data() as Subscription), id: single.id };
}

/**
 * Creates or updates a canonical Subscription for Google Cloud Platform Billing,
 * and backfills all historical invoices as monthly cycles.
 */
export async function createOrLinkSubscriptionForGcp(
  userId: string,
  customNickname?: string
): Promise<Subscription> {
  const { db } = getFirebaseAdmin();
  const [invoices, configs] = await Promise.all([
    getGcpHistoricalInvoices(userId),
    getGcpBillingConfigs(userId),
  ]);

  const activeConfig = configs.find((c) => c.isDefault) || configs[0];
  const currency = activeConfig?.currency || "INR";

  // Sort invoices ascending by month (YYYYMM)
  const sortedInvoices = [...invoices].sort((a, b) =>
    a.invoiceMonth.localeCompare(b.invoiceMonth)
  );
  const latestInvoice = sortedInvoices[sortedInvoices.length - 1];

  const todayIso = new Date().toISOString();
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Next month calculation: GCP invoices preceding month on the 1st of the following month
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthDueDate = `${nextMonthStr}-01`;

  // Check if an existing GCP subscription already exists
  const existingSub = await getLinkedGcpSubscription(userId);

  const displayName = customNickname || existingSub?.name || "Google Cloud Platform";
  const defaultAmount = latestInvoice?.netCost || 137.58;

  // Determine current cycle state
  const isLatestCurrentMonth = latestInvoice && latestInvoice.invoiceMonth === currentMonthStr.replace("-", "");
  const currentCycle: CycleState = {
    cycleMonth: currentMonthStr,
    statementDate: isLatestCurrentMonth ? latestInvoice.invoiceDate : `${currentMonthStr}-30`,
    dueDate: isLatestCurrentMonth && latestInvoice.dueDate ? latestInvoice.dueDate : nextMonthDueDate,
    statementTotal: isLatestCurrentMonth ? latestInvoice.netCost : (existingSub?.currentCycle?.statementTotal || 0),
    paidAmount: isLatestCurrentMonth ? latestInvoice.netCost : 0,
    remainingBalance: 0,
    status: isLatestCurrentMonth ? "FULLY_PAID" : "UNPAID",
    lastPaymentDate: isLatestCurrentMonth ? latestInvoice.invoiceDate : existingSub?.currentCycle?.lastPaymentDate,
    processedMessageIds: isLatestCurrentMonth && latestInvoice.invoiceNumber ? [latestInvoice.invoiceNumber] : [],
    updatedAt: todayIso,
  };

  let subscriptionId = existingSub?.id;

  if (existingSub) {
    // Update existing subscription
    await db
      .collection("subscriptions")
      .doc(existingSub.id)
      .update({
        name: displayName,
        defaultAmount,
        currency,
        dueDayOfMonth: 1,
        isEndOfMonthDue: true,
        statementDayOfMonth: 30,
        currentCycle: sanitizeForFirestore(currentCycle),
        "gcpBillingConfig.configId": activeConfig?.id,
        "gcpBillingConfig.autoSyncWithGcpBilling": true,
        updatedAt: todayIso,
      });
  } else {
    // Create new Subscription
    const subData: Omit<Subscription, "id"> = {
      userId,
      name: displayName,
      category: "Software & Tools",
      billingType: "BILL_GENERATED",
      source: "GCP_BILLING_MODULE",
      currency,
      defaultAmount,
      billingCycle: "MONTHLY",
      dueDayOfMonth: 1, // Billed on the 1st of each month for previous month
      isEndOfMonthDue: true,
      statementDayOfMonth: 30,
      notes: "Google Cloud Platform & BigQuery Billing • Automated export & historical invoice reconciliation",
      color: "#06b6d4", // Cyan
      gcpBillingConfig: {
        configId: activeConfig?.id,
        billingAccountId: activeConfig?.billingAccountId,
        datasetId: activeConfig?.datasetId,
        autoSyncWithGcpBilling: true,
      },
      currentCycle,
      createdAt: todayIso,
      updatedAt: todayIso,
    };

    const cleanSub = sanitizeForFirestore(subData);
    const docRef = await db.collection("subscriptions").add(cleanSub);
    subscriptionId = docRef.id;
  }

  // Backfill all historical invoices into canonical subscription_cycles
  if (subscriptionId && sortedInvoices.length > 0) {
    const overridesMap = await getCycleOverridesForSubscription(subscriptionId);
    const batch = db.batch();

    for (const inv of sortedInvoices) {
      if (!inv.invoiceMonth || inv.invoiceMonth.length < 6) continue;
      const cycleMonth = `${inv.invoiceMonth.slice(0, 4)}-${inv.invoiceMonth.slice(4, 6)}`;
      const cycleDocId = getCycleDocId(subscriptionId, cycleMonth);

      const baseHistCycle: HistoricalCycle = {
        id: cycleDocId,
        subscriptionId,
        subscriptionName: displayName,
        currency: inv.currency || currency,
        cycleMonth,
        statementDate: inv.invoiceDate || `${cycleMonth}-01`,
        dueDate: inv.dueDate || inv.invoiceDate || `${cycleMonth}-01`,
        statementTotal: inv.netCost,
        paidAmount: inv.netCost,
        remainingBalance: 0,
        status: "FULLY_PAID",
        lastPaymentDate: inv.invoiceDate || `${cycleMonth}-01`,
        processedMessageIds: inv.invoiceNumber ? [inv.invoiceNumber] : [],
        createdAt: inv.importedAt || todayIso,
        updatedAt: todayIso,
      };

      const histCycle = overridesMap.has(cycleMonth)
        ? applyCycleOverride(baseHistCycle, overridesMap.get(cycleMonth)!)
        : baseHistCycle;

      const cycleRef = db.collection("subscription_cycles").doc(cycleDocId);
      batch.set(cycleRef, sanitizeForFirestore(histCycle), { merge: true });
    }

    await batch.commit();
  }

  const resultSnap = await db.collection("subscriptions").doc(subscriptionId!).get();
  return { id: resultSnap.id, ...(resultSnap.data() as Omit<Subscription, "id">) };
}
