import { getFirebaseAdmin } from "../firebaseAdmin";
import { formatPropNo, formatCmcNo, formatAddress, formatReceiptDate, parseReceiptAmount } from "./client";
import {
  ChennaiWaterSession,
  ChennaiWaterProperty,
  ChennaiWaterReceipt,
} from "./types";

const CONFIG_DOC_ID = "current_session";
const CONFIG_COLLECTION = "chennai_water_config";
const PROPERTIES_COLLECTION = "chennai_water_properties";
const RECEIPTS_COLLECTION = "chennai_water_receipts";

// Helper to get scoped user document

function getUserChennaiWaterDoc(db: FirebaseFirestore.Firestore, userId?: string) {
  const safeId = userId && userId !== "default_user" && userId !== "default-user" ? userId : "default_user";
  return db.collection("users").doc(safeId);
}

/**
 * Retrieves the stored CMWSSB session from Firestore scoped under the user.
 */
export async function getChennaiWaterSession(userId?: string): Promise<ChennaiWaterSession | null> {
  const { db } = getFirebaseAdmin();
  const userDoc = getUserChennaiWaterDoc(db, userId);
  const snap = await userDoc.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).get();
  if (!snap.exists) {
    return null;
  }
  const raw = snap.data() as ChennaiWaterSession;
  return {
    ...raw,
    activeBillNo: formatPropNo(raw.activeBillNo),
    activeCmcNo: formatCmcNo(raw.activeCmcNo),
    address: formatAddress(raw.address),
  };
}

/**
 * Saves or updates CMWSSB session in Firestore scoped under the user.
 */
export async function saveChennaiWaterSession(
  session: Partial<ChennaiWaterSession>,
  userId?: string
): Promise<void> {
  const { db } = getFirebaseAdmin();
  const userDoc = getUserChennaiWaterDoc(db, userId);
  const existing = await getChennaiWaterSession(userId);
  const merged: ChennaiWaterSession = {
    mobileOrEmail: session.mobileOrEmail || existing?.mobileOrEmail || "",
    registeredCustomerId: session.registeredCustomerId || existing?.registeredCustomerId,
    token: session.token || existing?.token,
    activePropertyId: session.activePropertyId || existing?.activePropertyId || "",
    activeBillNo: formatPropNo(session.activeBillNo || existing?.activeBillNo || ""),
    activeCmcNo: formatCmcNo(session.activeCmcNo || existing?.activeCmcNo || ""),
    customerName: session.customerName || existing?.customerName || "",
    address: formatAddress(session.address || existing?.address || ""),
    updatedAt: new Date().toISOString(),
  };

  await userDoc.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).set(merged, { merge: true });
}

/**
 * Clears stored CMWSSB session scoped under the user.
 */
export async function clearChennaiWaterSession(userId?: string): Promise<void> {
  const { db } = getFirebaseAdmin();
  const userDoc = getUserChennaiWaterDoc(db, userId);
  await userDoc.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).delete();
}

/**
 * Retrieves cached properties from Firestore scoped under the user.
 */
export async function getStoredProperties(userId?: string): Promise<ChennaiWaterProperty[]> {
  const { db } = getFirebaseAdmin();
  const userDoc = getUserChennaiWaterDoc(db, userId);
  const snap = await userDoc.collection(PROPERTIES_COLLECTION).get();
  if (snap.empty) {
    return [];
  }
  return snap.docs.map((d) => {
    const p = d.data() as ChennaiWaterProperty;
    return {
      ...p,
      prop_no: formatPropNo(p.prop_no),
      cmc_no: formatCmcNo(p.cmc_no),
      addr: formatAddress(p.addr),
    };
  });
}

/**
 * Saves properties to Firestore scoped under the user.
 */
export async function saveProperties(properties: ChennaiWaterProperty[], userId?: string): Promise<void> {
  const { db } = getFirebaseAdmin();
  const userDoc = getUserChennaiWaterDoc(db, userId);
  const batch = db.batch();
  for (const prop of properties) {
    const docRef = userDoc.collection(PROPERTIES_COLLECTION).doc(String(prop.id));
    batch.set(
      docRef,
      {
        ...prop,
        prop_no: formatPropNo(prop.prop_no),
        cmc_no: formatCmcNo(prop.cmc_no),
        addr: formatAddress(prop.addr),
      },
      { merge: true }
    );
  }
  await batch.commit();
}

/**
 * Retrieves receipts from Firestore scoped under the user.
 */
export async function getStoredReceipts(propertyId?: string | number, userId?: string): Promise<ChennaiWaterReceipt[]> {
  const { db } = getFirebaseAdmin();
  const userDoc = getUserChennaiWaterDoc(db, userId);
  const snap = await userDoc.collection(RECEIPTS_COLLECTION).get();
  if (snap.empty) {
    return [];
  }

  const currentSnap = await userDoc.collection(RECEIPTS_COLLECTION).get();
  let receipts = currentSnap.docs.map((d) => {
    const r = d.data() as ChennaiWaterReceipt;
    return {
      ...r,
      receipt_dt: formatReceiptDate(r),
      amount: parseReceiptAmount(r),
      prop_no: formatPropNo(r.prop_no),
      cmc_no: formatCmcNo(r.cmc_no),
    };
  });
  // Deduplicate by receipt_no
  const seenNos = new Set<string>();
  receipts = receipts.filter((r) => {
    if (!r.receipt_no) return false;
    if (seenNos.has(r.receipt_no)) return false;
    seenNos.add(r.receipt_no);
    return true;
  });

  if (propertyId) {
    receipts = receipts.filter((r) => !r.customer_id || String(r.customer_id) === String(propertyId));
  }
  // Sort descending by date (handling DD/MM/YYYY or ISO)
  receipts.sort((a, b) => {
    const parseDateToComparable = (dtStr?: string) => {
      if (!dtStr) return "";
      if (dtStr.includes("/")) {
        const [d, m, y] = dtStr.split("/");
        return `${y}-${m}-${d}`;
      }
      return dtStr;
    };
    return parseDateToComparable(b.receipt_dt).localeCompare(parseDateToComparable(a.receipt_dt));
  });
  return receipts;
}

/**
 * Saves receipts to Firestore scoped under the user.
 */
export async function saveReceipts(receipts: ChennaiWaterReceipt[], userId?: string): Promise<void> {
  const { db } = getFirebaseAdmin();
  const userDoc = getUserChennaiWaterDoc(db, userId);
  const batch = db.batch();
  for (const r of receipts) {
    const docRef = userDoc.collection(RECEIPTS_COLLECTION).doc(String(r.id));
    batch.set(
      docRef,
      {
        ...r,
        receipt_dt: formatReceiptDate(r),
        amount: parseReceiptAmount(r),
        prop_no: formatPropNo(r.prop_no),
        cmc_no: formatCmcNo(r.cmc_no),
      },
      { merge: true }
    );
  }
  await batch.commit();
}
