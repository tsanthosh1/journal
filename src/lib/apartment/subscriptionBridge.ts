import { getFirebaseAdmin } from "../firebaseAdmin";
import { sanitizeForFirestore, getCycleDocId } from "../subscriptionUtils";
import { Subscription, CycleState, HistoricalCycle } from "../subscriptionTypes";
import { HomefyBillRecord, HomefySession } from "./types";
import { getApartmentSession, getCachedApartmentBills } from "./storage";
import { fetchHomefyBills } from "./client";

/**
 * Normalizes a bill status into the Subscription PaymentStatus
 */
function mapHomefyStatusToPaymentStatus(status?: string, paidRequest?: any[]): "FULLY_PAID" | "UNPAID" | "PARTIALLY_PAID" {
  const s = (status || "").toUpperCase();
  if (s === "PAID" || s.includes("APPROVAL") || s.includes("PENDING APPROVAL") || s === "APPROVED") {
    return "FULLY_PAID";
  }
  if (paidRequest && paidRequest.length > 0) {
    return "FULLY_PAID";
  }
  return "UNPAID";
}

/**
 * Extracts a cycleMonth string "YYYY-MM" from a HomefyBillRecord
 */
function extractCycleMonth(bill: HomefyBillRecord): string {
  if (bill.cycleMonth && /^\d{4}-\d{2}$/.test(bill.cycleMonth)) {
    return bill.cycleMonth;
  }
  if (bill.maintenance?.startDate) {
    return bill.maintenance.startDate.slice(0, 7);
  }
  if (bill.lastDate) {
    return bill.lastDate.slice(0, 7);
  }
  if (bill.createdAt) {
    return bill.createdAt.slice(0, 7);
  }
  return new Date().toISOString().slice(0, 7);
}

/**
 * Synchronizes apartment bills to linked APARTMENT_MODULE subscriptions
 */
export async function syncApartmentBillsToSubscriptions(
  bills: HomefyBillRecord[],
  userId: string = "default-user",
  targetSubscriptionId?: string,
): Promise<number> {
  const { db } = getFirebaseAdmin();
  const subSnap = await db
    .collection("subscriptions")
    .where("source", "==", "APARTMENT_MODULE")
    .get();

  let updatedCount = 0;

  for (const doc of subSnap.docs) {
    if (targetSubscriptionId && doc.id !== targetSubscriptionId) {
      continue;
    }

    const sub = doc.data() as Subscription;
    if (userId && sub.userId && sub.userId !== userId) {
      continue;
    }
    const catFilter = sub.apartmentConfig?.categoryFilter || "ALL";

    // Filter matching bills
    const matchingBills = bills.filter((b) => {
      if (catFilter === "ALL") return true;
      const bCat = (b.category?.name || "Maintenance Bill").toLowerCase();
      const filterLower = catFilter.toLowerCase();
      if (filterLower.includes("maintenance")) {
        return bCat.includes("maintenance");
      }
      if (filterLower.includes("water") || filterLower.includes("corpus")) {
        return bCat.includes("water") || bCat.includes("corpus");
      }
      return bCat === filterLower;
    });

    if (matchingBills.length === 0) continue;

    // Group matching bills by cycleMonth (e.g. "2026-09")
    const monthGroups = new Map<string, HomefyBillRecord[]>();
    for (const bill of matchingBills) {
      const m = extractCycleMonth(bill);
      if (!monthGroups.has(m)) monthGroups.set(m, []);
      monthGroups.get(m)!.push(bill);
    }

    const sortedMonths = Array.from(monthGroups.keys()).sort().reverse();
    if (sortedMonths.length === 0) continue;

    const latestCycleMonth = sortedMonths[0];
    const latestBills = monthGroups.get(latestCycleMonth) || [];

    // Combine amounts for the latest cycle month
    const latestTotal = latestBills.reduce((sum, b) => sum + (b.totalAmount || b.amount || 0), 0);
    const latestPaid = latestBills.reduce((sum, b) => {
      const isPaid = mapHomefyStatusToPaymentStatus(b.status, b.paidRequest) === "FULLY_PAID";
      return sum + (isPaid ? (b.totalAmount || b.amount || 0) : 0);
    }, 0);
    const latestRemaining = Math.max(0, latestTotal - latestPaid);
    const latestStatus: "FULLY_PAID" | "UNPAID" | "PARTIALLY_PAID" =
      latestRemaining === 0 && latestTotal > 0
        ? "FULLY_PAID"
        : latestPaid > 0
        ? "PARTIALLY_PAID"
        : "UNPAID";

    const latestDueDates = latestBills.map((b) => b.lastDate).filter(Boolean).sort().reverse();
    const latestDueDateStr = latestDueDates[0] ? latestDueDates[0].split("T")[0] : undefined;

    const latestCreatedDates = latestBills.map((b) => b.createdAt).filter(Boolean).sort();
    const latestStatementDateStr = latestCreatedDates[0] ? latestCreatedDates[0].split("T")[0] : undefined;

    const latestPaidDates = latestBills
      .map((b) => b.paidRequest?.[0]?.date)
      .filter(Boolean)
      .sort()
      .reverse();
    const latestPaymentDateStr = latestPaidDates[0] ? latestPaidDates[0].split("T")[0] : undefined;

    const latestProcessedIds = latestBills
      .map((b) => b.billId || b.id)
      .filter(Boolean) as string[];

    const currentCycle: CycleState = {
      cycleMonth: latestCycleMonth,
      statementDate: latestStatementDateStr,
      dueDate: latestDueDateStr,
      statementTotal: latestTotal,
      paidAmount: latestPaid,
      remainingBalance: latestRemaining,
      status: latestStatus,
      lastPaymentDate: latestPaymentDateStr,
      processedMessageIds: latestProcessedIds,
      updatedAt: new Date().toISOString(),
    };

    const parsedDueDay = latestDueDateStr ? parseInt(latestDueDateStr.split("-")[2], 10) : undefined;
    const dueDay = parsedDueDay && !isNaN(parsedDueDay) ? parsedDueDay : sub.dueDayOfMonth;

    await doc.ref.update({
      currentCycle: sanitizeForFirestore(currentCycle),
      defaultAmount: latestTotal > 0 ? latestTotal : sub.defaultAmount,
      dueDayOfMonth: dueDay,
      updatedAt: new Date().toISOString(),
    });

    // Backfill historical cycles into subscription_cycles (single source of truth)
    const batch = db.batch();
    for (const [bMonth, mBills] of monthGroups.entries()) {
      const bTotal = mBills.reduce((sum, b) => sum + (b.totalAmount || b.amount || 0), 0);
      const bPaid = mBills.reduce((sum, b) => {
        const isPaid = mapHomefyStatusToPaymentStatus(b.status, b.paidRequest) === "FULLY_PAID";
        return sum + (isPaid ? (b.totalAmount || b.amount || 0) : 0);
      }, 0);
      const bRemaining = Math.max(0, bTotal - bPaid);
      const bStatus: "FULLY_PAID" | "UNPAID" | "PARTIALLY_PAID" =
        bRemaining === 0 && bTotal > 0
          ? "FULLY_PAID"
          : bPaid > 0
          ? "PARTIALLY_PAID"
          : "UNPAID";

      const mDueDates = mBills.map((b) => b.lastDate).filter(Boolean).sort().reverse();
      const mDueDateStr = mDueDates[0] ? mDueDates[0].split("T")[0] : undefined;

      const mCreatedDates = mBills.map((b) => b.createdAt).filter(Boolean).sort();
      const mStatementDateStr = mCreatedDates[0] ? mCreatedDates[0].split("T")[0] : undefined;

      const mPaidDates = mBills
        .map((b) => b.paidRequest?.[0]?.date)
        .filter(Boolean)
        .sort()
        .reverse();
      const mPaymentDateStr = mPaidDates[0] ? mPaidDates[0].split("T")[0] : undefined;

      const mIds = mBills.map((b) => b.billId || b.id).filter(Boolean) as string[];

      const cycleDocId = getCycleDocId(doc.id, bMonth);
      const histCycle: HistoricalCycle = {
        id: cycleDocId,
        subscriptionId: doc.id,
        subscriptionName: sub.name,
        currency: sub.currency || "INR",
        cycleMonth: bMonth,
        statementDate: mStatementDateStr,
        dueDate: mDueDateStr,
        statementTotal: bTotal,
        paidAmount: bPaid,
        remainingBalance: bRemaining,
        status: bStatus,
        lastPaymentDate: mPaymentDateStr,
        processedMessageIds: mIds,
        createdAt: mCreatedDates[0] || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const cycleRef = db.collection("subscription_cycles").doc(cycleDocId);
      batch.set(cycleRef, sanitizeForFirestore(histCycle), { merge: true });
    }
    await batch.commit();

    updatedCount++;
  }

  return updatedCount;
}

/**
 * Creates or links a Subscription for a specific Apartment Bill Category
 */
export async function createSubscriptionForApartmentCategory(
  categoryName: string, // e.g. "Maintenance Bill", "Water Bill", "Corpus Fund", "ALL"
  customNickname?: string,
  userId: string = "default-user",
): Promise<Subscription> {
  const { db } = getFirebaseAdmin();
  const session = await getApartmentSession(userId);

  // Load bills (from live API or cached)
  let bills: HomefyBillRecord[] = [];
  if (session?.swappedToken) {
    try {
      bills = await fetchHomefyBills(session.swappedToken, "ALL");
    } catch (e) {
      console.warn("Falling back to cached apartment bills:", e);
      bills = await getCachedApartmentBills(userId);
    }
  } else {
    bills = await getCachedApartmentBills(userId);
  }

  // Filter bills for the given category
  const matchingBills = bills.filter((b) => {
    if (categoryName === "ALL") return true;
    const bCat = (b.category?.name || "Maintenance Bill").toLowerCase();
    const filterLower = categoryName.toLowerCase();
    if (filterLower.includes("maintenance")) {
      return bCat.includes("maintenance");
    }
    if (filterLower.includes("water") || filterLower.includes("corpus")) {
      return bCat.includes("water") || bCat.includes("corpus");
    }
    return bCat === filterLower;
  });

  // Group by cycleMonth
  const monthGroups = new Map<string, HomefyBillRecord[]>();
  for (const bill of matchingBills) {
    const m = extractCycleMonth(bill);
    if (!monthGroups.has(m)) monthGroups.set(m, []);
    monthGroups.get(m)!.push(bill);
  }

  const sortedMonths = Array.from(monthGroups.keys()).sort().reverse();
  const latestMonth = sortedMonths[0] || new Date().toISOString().slice(0, 7);
  const latestBills = monthGroups.get(latestMonth) || [];

  const aptName = session?.apartmentName || "Apartment";
  const flatNo = session?.flatNumber || "";
  const todayIso = new Date().toISOString();

  // Check if subscription already exists for this category
  const existingSnap = await db
    .collection("subscriptions")
    .where("source", "==", "APARTMENT_MODULE")
    .get();

  for (const doc of existingSnap.docs) {
    const s = doc.data() as Subscription;
    if (userId && s.userId && s.userId !== userId) {
      continue;
    }
    if (
      s.apartmentConfig?.categoryFilter?.toLowerCase() === categoryName.toLowerCase() &&
      (!s.apartmentConfig?.apartmentId || s.apartmentConfig.apartmentId === session?.apartmentId)
    ) {
      if (customNickname && customNickname !== s.name) {
        await doc.ref.update({ name: customNickname });
      }
      return { ...s, id: doc.id };
    }
  }

  // Create new Subscription with combined month totals
  const latestTotal = latestBills.reduce((sum, b) => sum + (b.totalAmount || b.amount || 0), 0);
  const latestPaid = latestBills.reduce((sum, b) => {
    const isPaid = mapHomefyStatusToPaymentStatus(b.status, b.paidRequest) === "FULLY_PAID";
    return sum + (isPaid ? (b.totalAmount || b.amount || 0) : 0);
  }, 0);
  const latestRemaining = Math.max(0, latestTotal - latestPaid);
  const latestStatus: "FULLY_PAID" | "UNPAID" | "PARTIALLY_PAID" =
    latestRemaining === 0 && latestTotal > 0
      ? "FULLY_PAID"
      : latestPaid > 0
      ? "PARTIALLY_PAID"
      : "UNPAID";

  const latestDueDates = latestBills.map((b) => b.lastDate).filter(Boolean).sort().reverse();
  const latestDueDateStr = latestDueDates[0] ? latestDueDates[0].split("T")[0] : undefined;
  const latestCreatedDates = latestBills.map((b) => b.createdAt).filter(Boolean).sort();
  const latestStatementDateStr = latestCreatedDates[0] ? latestCreatedDates[0].split("T")[0] : undefined;
  const latestPaidDates = latestBills
    .map((b) => b.paidRequest?.[0]?.date)
    .filter(Boolean)
    .sort()
    .reverse();
  const latestPaymentDateStr = latestPaidDates[0] ? latestPaidDates[0].split("T")[0] : undefined;
  const latestProcessedIds = latestBills.map((b) => b.billId || b.id).filter(Boolean) as string[];

  const currentCycle: CycleState = {
    cycleMonth: latestMonth,
    statementDate: latestStatementDateStr,
    dueDate: latestDueDateStr,
    statementTotal: latestTotal,
    paidAmount: latestPaid,
    remainingBalance: latestRemaining,
    status: latestStatus,
    lastPaymentDate: latestPaymentDateStr,
    processedMessageIds: latestProcessedIds,
    updatedAt: todayIso,
  };

  const displayName = customNickname
    ? customNickname
    : categoryName === "ALL"
    ? `${aptName} - All Bills`
    : `${aptName} - ${categoryName}`;

  const billingCycle = categoryName.toLowerCase().includes("maintenance")
    ? "QUARTERLY"
    : "MONTHLY";

  const dueDay = latestDueDateStr ? parseInt(latestDueDateStr.split("-")[2], 10) : 5;

  const subData: Omit<Subscription, "id"> = {
    userId,
    name: displayName,
    category: "Housing & Rent",
    billingType: "BILL_GENERATED",
    source: "APARTMENT_MODULE",
    currency: "INR",
    defaultAmount: latestTotal,
    billingCycle,
    dueDayOfMonth: !isNaN(dueDay) ? dueDay : 5,
    notes: `Homefy Apartment Bill • Flat: ${flatNo} • Society: ${aptName}`,
    color: "#6366f1", // Indigo
    apartmentConfig: {
      apartmentId: session?.apartmentId,
      apartmentName: aptName,
      flatNumber: flatNo,
      categoryFilter: categoryName,
      autoSyncWithApartmentModule: true,
    },
    currentCycle,
    createdAt: todayIso,
    updatedAt: todayIso,
  };

  const cleanSub = sanitizeForFirestore(subData);
  const docRef = await db.collection("subscriptions").add(cleanSub);

  // Backfill historical cycles to subscription_cycles
  if (monthGroups.size > 0) {
    const batch = db.batch();
    for (const [bMonth, mBills] of monthGroups.entries()) {
      const bTotal = mBills.reduce((sum, b) => sum + (b.totalAmount || b.amount || 0), 0);
      const bPaid = mBills.reduce((sum, b) => {
        const isPaid = mapHomefyStatusToPaymentStatus(b.status, b.paidRequest) === "FULLY_PAID";
        return sum + (isPaid ? (b.totalAmount || b.amount || 0) : 0);
      }, 0);
      const bRemaining = Math.max(0, bTotal - bPaid);
      const bStatus: "FULLY_PAID" | "UNPAID" | "PARTIALLY_PAID" =
        bRemaining === 0 && bTotal > 0
          ? "FULLY_PAID"
          : bPaid > 0
          ? "PARTIALLY_PAID"
          : "UNPAID";

      const mDueDates = mBills.map((b) => b.lastDate).filter(Boolean).sort().reverse();
      const mDueDateStr = mDueDates[0] ? mDueDates[0].split("T")[0] : undefined;

      const mCreatedDates = mBills.map((b) => b.createdAt).filter(Boolean).sort();
      const mStatementDateStr = mCreatedDates[0] ? mCreatedDates[0].split("T")[0] : undefined;

      const mPaidDates = mBills
        .map((b) => b.paidRequest?.[0]?.date)
        .filter(Boolean)
        .sort()
        .reverse();
      const mPaymentDateStr = mPaidDates[0] ? mPaidDates[0].split("T")[0] : undefined;

      const mIds = mBills.map((b) => b.billId || b.id).filter(Boolean) as string[];

      const cycleDocId = getCycleDocId(docRef.id, bMonth);
      const histCycle: HistoricalCycle = {
        id: cycleDocId,
        subscriptionId: docRef.id,
        subscriptionName: displayName,
        currency: "INR",
        cycleMonth: bMonth,
        statementDate: mStatementDateStr,
        dueDate: mDueDateStr,
        statementTotal: bTotal,
        paidAmount: bPaid,
        remainingBalance: bRemaining,
        status: bStatus,
        lastPaymentDate: mPaymentDateStr,
        processedMessageIds: mIds,
        createdAt: mCreatedDates[0] || todayIso,
        updatedAt: todayIso,
      };

      const cycleRef = db.collection("subscription_cycles").doc(cycleDocId);
      batch.set(cycleRef, sanitizeForFirestore(histCycle), { merge: true });
    }
    await batch.commit();
  }

  return { id: docRef.id, ...subData };
}
