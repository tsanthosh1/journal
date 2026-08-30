import { getFirebaseAdmin } from "./firebaseAdmin";
import {
  CycleState,
  HistoricalCycle,
  PaymentStatus,
  Subscription,
} from "./subscriptionTypes";

function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);

  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      cleaned[key] = sanitizeForFirestore(val);
    }
  }
  return cleaned;
}

export async function listSubscriptions(userId = "default_user"): Promise<Subscription[]> {
  const { db } = getFirebaseAdmin();

  // Support flexible user ID matching (email, normalized email, and default_user)
  const possibleUserIds = Array.from(
    new Set([
      userId,
      userId.replace(/[^a-zA-Z0-9_-]/g, "_"),
      "default_user",
    ]),
  ).filter(Boolean);

  let snap = await db
    .collection("subscriptions")
    .where("userId", "in", possibleUserIds.slice(0, 10))
    .get();

  // Fallback: If no subscriptions found under user filters, fetch all subscriptions in Firestore
  if (snap.empty) {
    snap = await db.collection("subscriptions").limit(100).get();
  }

  const list: Subscription[] = [];
  snap.forEach((doc) => {
    list.push({ id: doc.id, ...(doc.data() as Omit<Subscription, "id">) });
  });

  // Sort by upcoming dueDate ascending
  return list.sort((a, b) => {
    const dA = a.currentCycle?.dueDate || "9999-99-99";
    const dB = b.currentCycle?.dueDate || "9999-99-99";
    return dA.localeCompare(dB);
  });
}

export async function getSubscription(id: string): Promise<Subscription | null> {
  const { db } = getFirebaseAdmin();
  const snap = await db.collection("subscriptions").doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<Subscription, "id">) };
}

export async function createSubscription(
  data: Omit<Subscription, "id" | "createdAt" | "updatedAt">,
): Promise<Subscription> {
  const { db } = getFirebaseAdmin();
  const docRef = db.collection("subscriptions").doc();

  const now = new Date().toISOString();
  const cycleMonth = data.currentCycle?.cycleMonth || now.slice(0, 7);

  const total = data.currentCycle?.statementTotal ?? data.defaultAmount ?? 0;
  const paid = data.currentCycle?.paidAmount ?? 0;
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);

  let status: PaymentStatus = data.currentCycle?.status || "UNPAID";
  if (!data.currentCycle?.status) {
    if (total > 0 && paid >= total) status = "FULLY_PAID";
    else if (paid > 0) status = "PARTIALLY_PAID";
    else status = "UNPAID";
  }

  let calculatedDueDate = data.currentCycle?.dueDate;
  if (!calculatedDueDate && data.dueDayOfMonth) {
    const [yStr, mStr] = cycleMonth.split("-");
    const maxDays = new Date(Number(yStr), Number(mStr), 0).getDate();
    const validDay = Math.min(data.dueDayOfMonth, maxDays);
    calculatedDueDate = `${yStr}-${mStr}-${String(validDay).padStart(2, "0")}`;
  } else if (!calculatedDueDate) {
    calculatedDueDate = new Date(Date.now() + 15 * 86400000).toISOString().split("T")[0];
  }

  const currentCycle: CycleState = {
    cycleMonth,
    dueDate: calculatedDueDate,
    statementDate: data.currentCycle?.statementDate,
    statementTotal: total,
    paidAmount: paid,
    remainingBalance: remaining,
    status,
    processedMessageIds: data.currentCycle?.processedMessageIds || [],
    updatedAt: now,
  };

  const subscription: Subscription = {
    id: docRef.id,
    userId: data.userId || "default_user",
    name: data.name,
    category: data.category,
    billingType: data.billingType,
    source: data.source,
    currency: data.currency || "INR",
    defaultAmount: data.defaultAmount || 0,
    billingCycle: data.billingCycle,
    dueDayOfMonth: data.dueDayOfMonth,
    notes: data.notes,
    emailConfig: data.emailConfig,
    smsConfig: data.smsConfig,
    currentCycle,
    createdAt: now,
    updatedAt: now,
  };

  const sanitized = sanitizeForFirestore(subscription);
  await docRef.set(sanitized);

  // Also create initial cycle record in subscription_cycles
  const cycleDocId = `${subscription.id}_${cycleMonth}`;
  const cycleRef = db.collection("subscription_cycles").doc(cycleDocId);
  const cycleRecord: HistoricalCycle = {
    id: cycleDocId,
    subscriptionId: subscription.id,
    subscriptionName: subscription.name,
    currency: subscription.currency,
    cycleMonth,
    dueDate: currentCycle.dueDate,
    statementDate: currentCycle.statementDate,
    statementTotal: currentCycle.statementTotal,
    paidAmount: currentCycle.paidAmount,
    remainingBalance: currentCycle.remainingBalance,
    status: currentCycle.status,
    lastPaymentDate: currentCycle.lastPaymentDate,
    processedMessageIds: currentCycle.processedMessageIds,
    createdAt: now,
    updatedAt: now,
  };

  await cycleRef.set(sanitizeForFirestore(cycleRecord));

  return subscription;
}

export async function updateSubscription(
  id: string,
  data: Partial<Subscription>,
): Promise<Subscription> {
  const { db } = getFirebaseAdmin();
  const docRef = db.collection("subscriptions").doc(id);

  const existing = await getSubscription(id);
  if (!existing) {
    throw new Error(`Subscription with ID ${id} not found.`);
  }

  let updatedCycle = data.currentCycle || existing.currentCycle;
  if (data.dueDayOfMonth && updatedCycle?.cycleMonth) {
    const [yStr, mStr] = updatedCycle.cycleMonth.split("-");
    const maxDays = new Date(Number(yStr), Number(mStr), 0).getDate();
    const validDay = Math.min(data.dueDayOfMonth, maxDays);
    const newDueDate = `${yStr}-${mStr}-${String(validDay).padStart(2, "0")}`;
    updatedCycle = {
      ...updatedCycle,
      dueDate: newDueDate,
    };
  }

  const updated: Subscription = {
    ...existing,
    ...data,
    currentCycle: updatedCycle,
    updatedAt: new Date().toISOString(),
  };

  const sanitized = sanitizeForFirestore(updated);
  await docRef.update(sanitized);

  return updated;
}

export async function deleteSubscription(id: string): Promise<void> {
  const { db } = getFirebaseAdmin();
  await db.collection("subscriptions").doc(id).delete();

  // Delete all sub-cycles associated with this subscription
  const cyclesSnap = await db
    .collection("subscription_cycles")
    .where("subscriptionId", "==", id)
    .get();

  const batch = db.batch();
  cyclesSnap.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}

export async function listHistoricalCycles(subscriptionId: string): Promise<HistoricalCycle[]> {
  const { db } = getFirebaseAdmin();
  const subscription = await getSubscription(subscriptionId);

  // Query primary subscription_cycles collection
  const snap1 = await db
    .collection("subscription_cycles")
    .where("subscriptionId", "==", subscriptionId)
    .get();

  // Query subcollection subscriptions/{id}/cycles
  const snap2 = await db
    .collection("subscriptions")
    .doc(subscriptionId)
    .collection("cycles")
    .get();

  const isPrepaidSub =
    subscription?.isPrepaid ||
    subscription?.category === "Entertainment" ||
    (!subscription?.dueDayOfMonth &&
      subscription?.billingType === "BILL_GENERATED" &&
      !subscription?.emailConfig?.paymentQuery);

  const cycleMap = new Map<string, HistoricalCycle>();

  const processDoc = (docId: string, data: any) => {
    const month = data.cycleMonth;
    if (!month) return;

    let paidAmount = data.paidAmount || 0;
    let statementTotal = data.statementTotal || 0;
    let remainingBalance = data.remainingBalance;
    let status = data.status;

    if (isPrepaidSub && paidAmount === 0 && statementTotal > 0) {
      paidAmount = statementTotal;
      remainingBalance = 0;
      status = "FULLY_PAID";
    }

    let cycleDueDate = data.dueDate;
    if (!cycleDueDate && !isPrepaidSub && subscription?.dueDayOfMonth) {
      const [yStr, mStr] = month.split("-");
      const maxDays = new Date(Number(yStr), Number(mStr), 0).getDate();
      const validDay = Math.min(subscription.dueDayOfMonth, maxDays);
      cycleDueDate = `${yStr}-${mStr}-${String(validDay).padStart(2, "0")}`;
    }

    cycleMap.set(month, {
      id: docId,
      subscriptionId,
      subscriptionName: subscription?.name || data.subscriptionName || "",
      currency: subscription?.currency || data.currency || "INR",
      cycleMonth: month,
      dueDate: isPrepaidSub ? undefined : cycleDueDate,
      statementDate: data.statementDate,
      statementTotal,
      paidAmount,
      remainingBalance: remainingBalance ?? Math.max(0, statementTotal - paidAmount),
      status: status || (paidAmount >= statementTotal && statementTotal > 0 ? "FULLY_PAID" : "UNPAID"),
      lastPaymentDate: data.lastPaymentDate,
      processedMessageIds: data.processedMessageIds || [],
      sourceEmails: data.sourceEmails,
      sourceSms: data.sourceSms,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    });
  };

  snap2.forEach((doc) => processDoc(doc.id, doc.data()));
  snap1.forEach((doc) => processDoc(doc.id, doc.data()));

  // Also include currentCycle if present and not in cycleMap
  if (subscription?.currentCycle?.cycleMonth) {
    const curMonth = subscription.currentCycle.cycleMonth;
    if (!cycleMap.has(curMonth)) {
      processDoc(`${subscriptionId}_${curMonth}`, subscription.currentCycle);
    }
  }

  const list = Array.from(cycleMap.values());
  return list.sort((a, b) => b.cycleMonth.localeCompare(a.cycleMonth));
}

export async function overrideCycleState(
  subscriptionId: string,
  updates: Partial<CycleState>,
): Promise<Subscription> {
  const { db } = getFirebaseAdmin();
  const subscription = await getSubscription(subscriptionId);
  if (!subscription) {
    throw new Error(`Subscription with ID ${subscriptionId} not found.`);
  }

  const current = subscription.currentCycle;
  const targetMonth = updates.cycleMonth || current?.cycleMonth || new Date().toISOString().slice(0, 7);
  const now = new Date().toISOString();

  // Try to load existing cycle data for targetMonth
  const cycleDocId = `${subscriptionId}_${targetMonth}`;
  const existingCycleSnap = await db.collection("subscription_cycles").doc(cycleDocId).get();
  const existingData = existingCycleSnap.exists ? (existingCycleSnap.data() as CycleState) : current;

  const total = updates.statementTotal ?? existingData.statementTotal ?? subscription.defaultAmount ?? 0;
  const paid = updates.paidAmount ?? existingData.paidAmount ?? 0;
  const remaining = updates.remainingBalance ?? Math.max(0, Math.round((total - paid) * 100) / 100);

  let status = updates.status || existingData.status;
  if (!updates.status) {
    if (total > 0 && paid >= total) status = "FULLY_PAID";
    else if (paid > 0) status = "PARTIALLY_PAID";
    else status = "UNPAID";
  }

  let cycleDueDate = updates.dueDate ?? existingData.dueDate;
  if (!cycleDueDate && subscription.dueDayOfMonth) {
    const [yStr, mStr] = targetMonth.split("-");
    const maxDays = new Date(Number(yStr), Number(mStr), 0).getDate();
    const validDay = Math.min(subscription.dueDayOfMonth, maxDays);
    cycleDueDate = `${yStr}-${mStr}-${String(validDay).padStart(2, "0")}`;
  }

  const mergedCycle: CycleState = {
    ...existingData,
    ...updates,
    cycleMonth: targetMonth,
    dueDate: cycleDueDate,
    statementTotal: total,
    paidAmount: paid,
    remainingBalance: remaining,
    status,
    updatedAt: now,
  };

  const cycleRecord = {
    ...mergedCycle,
    id: cycleDocId,
    subscriptionId,
    subscriptionName: subscription.name,
    currency: subscription.currency,
    updatedAt: now,
  };

  // 1. Save to global subscription_cycles
  await db
    .collection("subscription_cycles")
    .doc(cycleDocId)
    .set(sanitizeForFirestore(cycleRecord), { merge: true });

  // 2. Save to subcollection subscriptions/{id}/cycles/{month}
  await db
    .collection("subscriptions")
    .doc(subscriptionId)
    .collection("cycles")
    .doc(targetMonth)
    .set(sanitizeForFirestore(cycleRecord), { merge: true });

  // 3. If targetMonth is current cycle or newer, update currentCycle on subscription
  let updatedSub = subscription;
  if (!current?.cycleMonth || targetMonth >= current.cycleMonth) {
    updatedSub = await updateSubscription(subscriptionId, {
      currentCycle: mergedCycle,
    });
  }

  return updatedSub;
}

export async function deleteSubscriptionCycle(
  subscriptionId: string,
  cycleMonth: string,
): Promise<Subscription> {
  const { db } = getFirebaseAdmin();
  const subscription = await getSubscription(subscriptionId);
  if (!subscription) {
    throw new Error(`Subscription with ID ${subscriptionId} not found.`);
  }

  const cycleDocId = `${subscriptionId}_${cycleMonth}`;
  await db.collection("subscription_cycles").doc(cycleDocId).delete();
  await db
    .collection("subscriptions")
    .doc(subscriptionId)
    .collection("cycles")
    .doc(cycleMonth)
    .delete();

  let updatedSub = subscription;
  if (subscription.currentCycle?.cycleMonth === cycleMonth) {
    const remainingCycles = await listHistoricalCycles(subscriptionId);
    const latestRemaining = remainingCycles[0];
    const fallbackMonth = new Date().toISOString().slice(0, 7);

    const newCurrent: CycleState = latestRemaining
      ? {
          cycleMonth: latestRemaining.cycleMonth,
          statementDate: latestRemaining.statementDate,
          dueDate: latestRemaining.dueDate,
          statementTotal: latestRemaining.statementTotal || 0,
          paidAmount: latestRemaining.paidAmount || 0,
          remainingBalance: latestRemaining.remainingBalance || 0,
          status: latestRemaining.status || "UNPAID",
          lastPaymentDate: latestRemaining.lastPaymentDate,
          sourceEmails: latestRemaining.sourceEmails,
          sourceSms: latestRemaining.sourceSms,
          processedMessageIds: latestRemaining.processedMessageIds || [],
          updatedAt: new Date().toISOString(),
        }
      : {
          cycleMonth: fallbackMonth,
          status: "UNPAID",
          statementTotal: subscription.defaultAmount || 0,
          paidAmount: 0,
          remainingBalance: subscription.defaultAmount || 0,
          processedMessageIds: [],
          updatedAt: new Date().toISOString(),
        };

    updatedSub = await updateSubscription(subscriptionId, {
      currentCycle: newCurrent,
    });
  }

  return updatedSub;
}

export { overrideCycleState as overrideSubscriptionCycle };
