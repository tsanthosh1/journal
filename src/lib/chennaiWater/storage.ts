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

// Initial seed data extracted from official CMWSSB portal export
export const INITIAL_PROPERTY_SEED: ChennaiWaterProperty = {
  id: "193097538",
  prop_no: "15-193-097538",
  cmc_no: "15-193-56648-000",
  c_name: "",
  addr: "",
  mobile_no: "",
  status: "Active",
  annual_value: "₹11,960.00",
  eff_from_term: "24-25/II (Oct-Mar)",
  half_year_tax: "₹419.00",
  cat_desc: "201 - Domestic-F-UM@30",
  cat_eff_term: "2024/01",
  total_dues: 0,
  credit_balance: 0,
  tax_due: 0,
  charges_due: 0,
  advance_amount: 0,
};

export const INITIAL_RECEIPTS_SEED: ChennaiWaterReceipt[] = [
  {
    id: "rec_26_27_123821",
    receipt_no: "26-27/BBP/123821",
    receipt_dt: "17/05/2026",
    type: "Receipt",
    payment_mode: "BBPS",
    amount: 36.0,
    customer_id: "193097538",
    prop_no: "15-193-097538",
    cmc_no: "15-193-56648-000",
  },
  {
    id: "rec_26_27_65600",
    receipt_no: "26-27/BBP/65600",
    receipt_dt: "28/04/2026",
    type: "Receipt",
    payment_mode: "BBPS",
    amount: 1028.0,
    customer_id: "193097538",
    prop_no: "15-193-097538",
    cmc_no: "15-193-56648-000",
  },
  {
    id: "rec_25_26_211440",
    receipt_no: "25-26/BBP/211440",
    receipt_dt: "30/11/2025",
    type: "Receipt",
    payment_mode: "BBPS",
    amount: 1049.0,
    customer_id: "193097538",
    prop_no: "15-193-097538",
    cmc_no: "15-193-56648-000",
  },
  {
    id: "rec_25_26_12434",
    receipt_no: "25-26/BBP/12434",
    receipt_dt: "03/04/2025",
    type: "Receipt",
    payment_mode: "BBPS",
    amount: 1028.0,
    customer_id: "193097538",
    prop_no: "15-193-097538",
    cmc_no: "15-193-56648-000",
  },
  {
    id: "rec_24_25_1183570",
    receipt_no: "24-25/OLP/1183570",
    receipt_dt: "24/03/2025",
    type: "Receipt",
    payment_mode: "OLP",
    amount: 1952.0,
    customer_id: "193097538",
    prop_no: "15-193-097538",
    cmc_no: "15-193-56648-000",
  },
  {
    id: "rec_23_24_605817",
    receipt_no: "23-24/OLP/605817",
    receipt_dt: "15/10/2023",
    type: "Receipt",
    payment_mode: "OLP",
    amount: 395.0,
    customer_id: "193097538",
    prop_no: "15-193-097538",
    cmc_no: "15-193-56648-000",
  },
  {
    id: "rec_23_24_698",
    receipt_no: "23-24/W193/1/698",
    receipt_dt: "04/07/2023",
    type: "Receipt",
    payment_mode: "CHQ",
    amount: 395.0,
    customer_id: "193097538",
    prop_no: "15-193-097538",
    cmc_no: "15-193-56648-000",
  },
  {
    id: "rec_22_23_7650",
    receipt_no: "22-23/Z15/1/7650",
    receipt_dt: "24/02/2023",
    type: "Receipt",
    payment_mode: "CHQ",
    amount: 395.0,
    customer_id: "193097538",
    prop_no: "15-193-097538",
    cmc_no: "15-193-56648-000",
  },
];

function getUserChennaiWaterDoc(db: FirebaseFirestore.Firestore, userId?: string) {
  const safeId = userId && userId !== "default_user" && userId !== "default-user" ? userId : "default_user";
  return db.collection("users").doc(safeId);
}

function isDeveloperUser(userId?: string): boolean {
  if (!userId) return false;
  const lower = userId.toLowerCase();
  return lower.includes("santhosh") || lower.includes("tsanthosh");
}

/**
 * Retrieves the stored CMWSSB session from Firestore scoped under the user.
 */
export async function getChennaiWaterSession(userId?: string): Promise<ChennaiWaterSession | null> {
  const { db } = getFirebaseAdmin();
  const userDoc = getUserChennaiWaterDoc(db, userId);
  const snap = await userDoc.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).get();
  if (!snap.exists) {
    if (isDeveloperUser(userId)) {
      const legacySnap = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).get();
      if (legacySnap.exists) {
        const raw = legacySnap.data() as ChennaiWaterSession;
        const session: ChennaiWaterSession = {
          ...raw,
          activeBillNo: formatPropNo(raw.activeBillNo),
          activeCmcNo: formatCmcNo(raw.activeCmcNo),
          address: formatAddress(raw.address),
        };
        await userDoc.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID).set(session);
        return session;
      }
    }
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
    if (isDeveloperUser(userId)) {
      const legacySnap = await db.collection(PROPERTIES_COLLECTION).get();
      if (!legacySnap.empty) {
        const batch = db.batch();
        const migrated: ChennaiWaterProperty[] = [];
        for (const doc of legacySnap.docs) {
          const p = doc.data() as ChennaiWaterProperty;
          batch.set(userDoc.collection(PROPERTIES_COLLECTION).doc(String(p.id)), p);
          migrated.push(p);
        }
        await batch.commit();
        return migrated;
      }
      await userDoc.collection(PROPERTIES_COLLECTION).doc(String(INITIAL_PROPERTY_SEED.id)).set(INITIAL_PROPERTY_SEED);
      return [INITIAL_PROPERTY_SEED];
    }
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
    if (isDeveloperUser(userId)) {
      const legacySnap = await db.collection(RECEIPTS_COLLECTION).get();
      if (!legacySnap.empty) {
        const batch = db.batch();
        for (const doc of legacySnap.docs) {
          batch.set(userDoc.collection(RECEIPTS_COLLECTION).doc(doc.id), doc.data());
        }
        await batch.commit();
      } else {
        const batch = db.batch();
        for (const r of INITIAL_RECEIPTS_SEED) {
          batch.set(userDoc.collection(RECEIPTS_COLLECTION).doc(String(r.id)), r);
        }
        await batch.commit();
        return INITIAL_RECEIPTS_SEED;
      }
    } else {
      return [];
    }
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
