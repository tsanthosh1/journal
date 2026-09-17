import { getFirebaseAdmin } from "./firebaseAdmin";
import { CycleOverride, CycleState } from "./subscriptionTypes";
import {
  getCycleDocId,
  sanitizeForFirestore,
  computeRemainingBalance,
} from "./subscriptionUtils";

export const OVERRIDES_COLLECTION = "cycle_overrides";

/**
 * Saves or updates a manual cycle override record in the separate `cycle_overrides` collection.
 */
export async function saveCycleOverride(
  subscriptionId: string,
  cycleMonth: string,
  updates: Partial<CycleOverride>,
): Promise<CycleOverride> {
  const { db } = getFirebaseAdmin();
  const docId = getCycleDocId(subscriptionId, cycleMonth);
  const docRef = db.collection(OVERRIDES_COLLECTION).doc(docId);
  const now = new Date().toISOString();

  const snap = await docRef.get();
  const existing = snap.exists ? (snap.data() as CycleOverride) : null;

  const record: CycleOverride = {
    id: docId,
    subscriptionId,
    cycleMonth,
    ...(existing || {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.statementTotal !== undefined ? { statementTotal: updates.statementTotal } : {}),
    ...(updates.paidAmount !== undefined ? { paidAmount: updates.paidAmount } : {}),
    ...(updates.remainingBalance !== undefined ? { remainingBalance: updates.remainingBalance } : {}),
    ...(updates.dueDate !== undefined ? { dueDate: updates.dueDate } : {}),
    ...(updates.statementDate !== undefined ? { statementDate: updates.statementDate } : {}),
    ...(updates.lastPaymentDate !== undefined ? { lastPaymentDate: updates.lastPaymentDate } : {}),
    ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await docRef.set(sanitizeForFirestore(record), { merge: true });
  return record;
}

/**
 * Retrieves a single manual cycle override record by subscriptionId and cycleMonth.
 */
export async function getCycleOverride(
  subscriptionId: string,
  cycleMonth: string,
): Promise<CycleOverride | null> {
  const { db } = getFirebaseAdmin();
  const docId = getCycleDocId(subscriptionId, cycleMonth);
  const snap = await db.collection(OVERRIDES_COLLECTION).doc(docId).get();
  if (!snap.exists) return null;
  return snap.data() as CycleOverride;
}

/**
 * Batch retrieves all cycle overrides for a given subscription, keyed by cycleMonth.
 */
export async function getCycleOverridesForSubscription(
  subscriptionId: string,
): Promise<Map<string, CycleOverride>> {
  const { db } = getFirebaseAdmin();
  const map = new Map<string, CycleOverride>();

  const snap = await db
    .collection(OVERRIDES_COLLECTION)
    .where("subscriptionId", "==", subscriptionId)
    .get();

  snap.forEach((doc) => {
    const data = doc.data() as CycleOverride;
    if (data.cycleMonth) {
      map.set(data.cycleMonth, data);
    }
  });

  return map;
}

/**
 * Deletes a manual cycle override record.
 */
export async function deleteCycleOverride(
  subscriptionId: string,
  cycleMonth: string,
): Promise<void> {
  const { db } = getFirebaseAdmin();
  const docId = getCycleDocId(subscriptionId, cycleMonth);
  await db.collection(OVERRIDES_COLLECTION).doc(docId).delete();
}

/**
 * Deletes all manual cycle overrides associated with a subscription.
 */
export async function deleteCycleOverridesForSubscription(
  subscriptionId: string,
): Promise<void> {
  const { db } = getFirebaseAdmin();
  const snap = await db
    .collection(OVERRIDES_COLLECTION)
    .where("subscriptionId", "==", subscriptionId)
    .get();

  if (snap.empty) return;

  const batch = db.batch();
  snap.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}

/**
 * Pure function: applies saved override fields on top of automated cycle state.
 * Preserves automated discovery data (source SMS, message IDs, emails) while giving precedence
 * to user-specified manual fields.
 */
export function applyCycleOverride<T extends CycleState>(
  cycle: T,
  override?: CycleOverride | null,
): T {
  if (!override) return cycle;

  const total =
    override.statementTotal !== undefined ? override.statementTotal : cycle.statementTotal;
  const paid =
    override.paidAmount !== undefined ? override.paidAmount : cycle.paidAmount;
  const remaining =
    override.remainingBalance !== undefined
      ? override.remainingBalance
      : override.statementTotal !== undefined || override.paidAmount !== undefined
      ? computeRemainingBalance(total, paid)
      : cycle.remainingBalance;

  return {
    ...cycle,
    ...(override.status !== undefined ? { status: override.status } : {}),
    ...(override.statementTotal !== undefined ? { statementTotal: override.statementTotal } : {}),
    ...(override.paidAmount !== undefined ? { paidAmount: override.paidAmount } : {}),
    remainingBalance: remaining,
    ...(override.dueDate !== undefined ? { dueDate: override.dueDate } : {}),
    ...(override.statementDate !== undefined ? { statementDate: override.statementDate } : {}),
    ...(override.lastPaymentDate !== undefined ? { lastPaymentDate: override.lastPaymentDate } : {}),
    isManuallyOverridden: true,
    manualOverride: override,
  };
}
