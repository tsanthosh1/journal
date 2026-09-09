import { getFirebaseAdmin } from "./firebaseAdmin";
import {
  CycleState,
  HistoricalCycle,
  PaymentStatus,
  Subscription,
  calculatePrepaidRenewalInfo,
} from "./subscriptionTypes";
import {
  sanitizeForFirestore,
  isPrepaidSubscription,
  isFixedTenure,
  calculateDueDate,
  computePaymentStatus,
  computeRemainingBalance,
  getCurrentCycleMonth,
  getCycleDocId,
} from "./subscriptionUtils";

export async function ensureSubscriptionCurrentMonth(
  sub: Subscription,
  db: FirebaseFirestore.Firestore,
): Promise<Subscription> {
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const current = sub.currentCycle;

  // 0. Prepaid Validity Check: If current cycle's prepaid period is still active, do NOT roll over!
  const isPrepaid = isPrepaidSubscription(sub);

  if (isPrepaid && current && (current.statementDate || current.lastPaymentDate)) {
    const pInfo = calculatePrepaidRenewalInfo(current, sub.billingCycle, sub.dueDayOfMonth);
    if (pInfo.daysRemaining !== undefined && pInfo.daysRemaining >= 0) {
      // Prepaid subscription is still within its active validity period (e.g. Aug 17 to Sep 16)
      return sub;
    }
  }

  // If currentCycle is missing or from a past month, roll forward to current calendar month
  if (!current || !current.cycleMonth || current.cycleMonth < currentMonthStr) {
    // 1. Archive the previous cycle to subscription_cycles if it has actual data
    if (current && current.cycleMonth && ((current.statementTotal && current.statementTotal > 0) || (current.paidAmount && current.paidAmount > 0) || (current.sourceEmails && current.sourceEmails.length > 0))) {
      try {
        const oldCycleId = `${sub.id}_${current.cycleMonth}`;
        const oldCycleRef = db.collection("subscription_cycles").doc(oldCycleId);
        const oldSnap = await oldCycleRef.get();
        if (!oldSnap.exists) {
          const oldRecord: HistoricalCycle = {
            id: oldCycleId,
            subscriptionId: sub.id,
            subscriptionName: sub.name,
            currency: sub.currency || "INR",
            cycleMonth: current.cycleMonth,
            dueDate: current.dueDate,
            statementDate: current.statementDate,
            statementTotal: current.statementTotal || 0,
            paidAmount: current.paidAmount || 0,
            remainingBalance: current.remainingBalance ?? Math.max(0, (current.statementTotal || 0) - (current.paidAmount || 0)),
            status: current.status || "UNPAID",
            lastPaymentDate: current.lastPaymentDate,
            processedMessageIds: current.processedMessageIds || [],
            sourceEmails: current.sourceEmails,
            sourceSms: current.sourceSms,
            createdAt: current.updatedAt || new Date().toISOString(),
            updatedAt: current.updatedAt || new Date().toISOString(),
          };
          await oldCycleRef.set(sanitizeForFirestore(oldRecord));
        }
      } catch (err) {
        console.warn(`Could not archive old cycle for subscription ${sub.id}:`, err);
      }
    }

    // 2. Compute new Due Date for current calendar month
    const calculatedDueDate = calculateDueDate(currentMonthStr, sub);

    // 3. Compute Statement Total and Paid Amounts
    const isFixed = isFixedTenure(sub);

    const statementTotal = isFixed || isPrepaid ? sub.defaultAmount || 0 : 0;
    const paidAmount = isPrepaid ? statementTotal : 0;
    const remainingBalance = isPrepaid ? 0 : statementTotal;
    const status: PaymentStatus = isPrepaid ? "FULLY_PAID" : "UNPAID";

    const newCycle: CycleState = {
      cycleMonth: currentMonthStr,
      dueDate: calculatedDueDate,
      statementDate: `${currentMonthStr}-01`,
      statementTotal,
      paidAmount,
      remainingBalance,
      status,
      processedMessageIds: [],
      sourceEmails: [],
      sourceSms: [],
      updatedAt: new Date().toISOString(),
    };

    const updatedSub: Subscription = {
      ...sub,
      currentCycle: newCycle,
      updatedAt: new Date().toISOString(),
    };

    // 4. Update Firestore
    try {
      await db.collection("subscriptions").doc(sub.id).update({
        currentCycle: sanitizeForFirestore(newCycle),
        updatedAt: new Date().toISOString(),
      });

      const newCycleId = getCycleDocId(sub.id, currentMonthStr);
      const newCycleRecord: HistoricalCycle = {
        id: newCycleId,
        subscriptionId: sub.id,
        subscriptionName: sub.name,
        currency: sub.currency || "INR",
        cycleMonth: currentMonthStr,
        dueDate: calculatedDueDate,
        statementDate: `${currentMonthStr}-01`,
        statementTotal,
        paidAmount,
        remainingBalance,
        status,
        processedMessageIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.collection("subscription_cycles").doc(newCycleId).set(sanitizeForFirestore(newCycleRecord), { merge: true });
    } catch (err) {
      console.error(`Failed to update subscription ${sub.id} currentCycle rollover:`, err);
    }

    return updatedSub;
  }

  return sub;
}

export async function listSubscriptions(userId = "default_user"): Promise<Subscription[]> {
  const { db } = getFirebaseAdmin();

  // Support flexible user ID matching (email, normalized email, default_user, and default-user)
  const possibleUserIds = Array.from(
    new Set([
      userId,
      userId.replace(/[^a-zA-Z0-9_-]/g, "_"),
      "default_user",
      "default-user",
      "tsanthosh.online@gmail.com",
      "tsanthosh_online_gmail_com",
    ]),
  ).filter(Boolean);

  let snap = await db
    .collection("subscriptions")
    .where("userId", "in", possibleUserIds.slice(0, 10))
    .get();

  // No insecure fallback — return empty if no subscriptions match the user
  if (snap.empty) {
    return [];
  }

  const rawList: Subscription[] = [];
  snap.forEach((doc) => {
    rawList.push({ id: doc.id, ...(doc.data() as Omit<Subscription, "id">) });
  });

  // Pure read: do not perform write-side-effects during read operations
  return rawList.sort((a, b) => {
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
    statementDayOfMonth: data.statementDayOfMonth,
    statementDate: data.statementDate,
    isEndOfMonthDue: data.isEndOfMonthDue,
    allowSkip: data.allowSkip,
    isPrepaid: data.isPrepaid,
    isAdvancePayment: data.isAdvancePayment,
    imageUrl: data.imageUrl,
    icon: data.icon,
    color: data.color,
    notes: data.notes,
    emailConfig: data.emailConfig,
    smsConfig: data.smsConfig,
    tnebConfig: data.tnebConfig,
    apartmentConfig: data.apartmentConfig,
    chennaiWaterConfig: data.chennaiWaterConfig,
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

  // Single source of truth: subscription_cycles collection
  const snap = await db
    .collection("subscription_cycles")
    .where("subscriptionId", "==", subscriptionId)
    .get();

  const isPrepaidSub = subscription ? isPrepaidSubscription(subscription) : false;

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
      cycleDueDate = calculateDueDate(month, subscription);
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
      remainingBalance: remainingBalance ?? computeRemainingBalance(statementTotal, paidAmount),
      status: status || computePaymentStatus(statementTotal, paidAmount, { isPrepaid: isPrepaidSub }),
      lastPaymentDate: data.lastPaymentDate,
      processedMessageIds: data.processedMessageIds || [],
      sourceEmails: data.sourceEmails,
      sourceSms: data.sourceSms,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    });
  };

  snap.forEach((doc) => processDoc(doc.id, doc.data()));

  // Also include currentCycle if present and has actual data
  if (subscription?.currentCycle?.cycleMonth) {
    const curMonth = subscription.currentCycle.cycleMonth;
    const curCycle = subscription.currentCycle;
    const hasData =
      (curCycle.statementTotal && curCycle.statementTotal > 0) ||
      (curCycle.paidAmount && curCycle.paidAmount > 0) ||
      (curCycle.sourceEmails && curCycle.sourceEmails.length > 0) ||
      (curCycle.sourceSms && curCycle.sourceSms.length > 0) ||
      isFixedTenure(subscription);

    if (!cycleMap.has(curMonth) && hasData) {
      processDoc(getCycleDocId(subscriptionId, curMonth), curCycle);
    }
  }

  const list = Array.from(cycleMap.values()).filter(
    (c) =>
      (c.statementTotal && c.statementTotal > 0) ||
      (c.paidAmount && c.paidAmount > 0) ||
      (c.sourceEmails && c.sourceEmails.length > 0) ||
      (subscription ? isFixedTenure(subscription) : false),
  );
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
  const targetMonth = updates.cycleMonth || current?.cycleMonth || getCurrentCycleMonth();
  const now = new Date().toISOString();

  // Try to load existing cycle data for targetMonth
  const cycleDocId = getCycleDocId(subscriptionId, targetMonth);
  const existingCycleSnap = await db.collection("subscription_cycles").doc(cycleDocId).get();
  const existingData = existingCycleSnap.exists ? (existingCycleSnap.data() as CycleState) : current;

  const total = updates.statementTotal ?? existingData.statementTotal ?? subscription.defaultAmount ?? 0;
  const paid = updates.paidAmount ?? existingData.paidAmount ?? 0;
  const remaining = updates.remainingBalance ?? computeRemainingBalance(total, paid);

  const status = updates.status || computePaymentStatus(total, paid, { currentStatus: existingData.status });

  let cycleDueDate = updates.dueDate ?? existingData.dueDate;
  if (!cycleDueDate) {
    cycleDueDate = calculateDueDate(targetMonth, subscription);
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

  // Single source of truth: subscription_cycles collection
  await db
    .collection("subscription_cycles")
    .doc(cycleDocId)
    .set(sanitizeForFirestore(cycleRecord), { merge: true });

  // Update currentCycle on subscription if targetMonth is current or newer
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

  const cycleDocId = getCycleDocId(subscriptionId, cycleMonth);
  // Single source of truth: only delete from subscription_cycles
  await db.collection("subscription_cycles").doc(cycleDocId).delete();

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
