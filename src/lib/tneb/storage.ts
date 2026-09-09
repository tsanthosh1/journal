import { getFirebaseAdmin } from "../firebaseAdmin";
import { sanitizeForFirestore } from "../emailStorage";
import { TnebBillRecord, TnebConfig, TnebConsumerAccount } from "./types";

function getUserTnebBase(db: FirebaseFirestore.Firestore, userId?: string) {
  const safeId = userId && userId !== "default_user" && userId !== "default-user" ? userId : "default_user";
  return db.collection("users").doc(safeId);
}

const DEFAULT_TNEB_CONFIG: TnebConfig = {
  trackedConsumers: [],
  syncAllFound: false,
  autoSyncEnabled: true,
  updatedAt: new Date().toISOString(),
};

/**
 * Saves TNEB account profile and historical bills to Firestore scoped under the user
 */
export async function saveTnebAccountAndBills(
  account: TnebConsumerAccount,
  bills: TnebBillRecord[],
  userId?: string,
): Promise<{ accountSaved: boolean; billsSavedCount: number }> {
  const { db } = getFirebaseAdmin();
  const userDoc = getUserTnebBase(db, userId);

  const cleanAccount = sanitizeForFirestore({
    ...account,
    userId,
    updatedAt: new Date().toISOString(),
  });

  const accountRef = userDoc.collection("tneb_accounts").doc(account.consumerNumber);
  await accountRef.set(cleanAccount, { merge: true });

  const batch = db.batch();
  let count = 0;

  for (const bill of bills) {
    const cleanBill = sanitizeForFirestore({
      ...bill,
      userId,
      updatedAt: new Date().toISOString(),
    });

    const billRef = userDoc.collection("tneb_bills").doc(bill.id);
    batch.set(billRef, cleanBill, { merge: true });
    count++;

    if (count % 400 === 0) {
      await batch.commit();
    }
  }

  await batch.commit();

  // Automatically update any linked Subscriptions
  try {
    const { syncTnebToSubscriptions } = await import("./subscriptionBridge");
    await syncTnebToSubscriptions(account, bills, userId);
  } catch (bridgeErr) {
    console.warn("Notice: subscription bridge sync skipped:", bridgeErr);
  }

  return { accountSaved: true, billsSavedCount: count };
}

/**
 * Retrieves all stored TNEB consumer accounts for the user
 */
export async function getAllTnebAccounts(userId?: string): Promise<TnebConsumerAccount[]> {
  if (!userId || userId === "default_user" || userId === "default-user") {
    return [];
  }

  const { db } = getFirebaseAdmin();
  const userDoc = getUserTnebBase(db, userId);
  const snap = await userDoc.collection("tneb_accounts").orderBy("consumerNumber", "asc").get();

  if (snap.empty) {
    // Migration: If this is the primary account (tsanthosh1/santhosh) and user subcollection is empty, migrate from legacy root
    if (userId.toLowerCase().includes("santhosh")) {
      const legacySnap = await db.collection("tneb_accounts").get();
      if (!legacySnap.empty) {
        const accounts: TnebConsumerAccount[] = [];
        const batch = db.batch();
        legacySnap.forEach((doc) => {
          const acc = doc.data() as TnebConsumerAccount;
          accounts.push(acc);
          batch.set(userDoc.collection("tneb_accounts").doc(doc.id), sanitizeForFirestore(acc), { merge: true });
        });
        await batch.commit();
        return accounts;
      }
    }
    return [];
  }

  const accounts: TnebConsumerAccount[] = [];
  snap.forEach((doc) => {
    accounts.push(doc.data() as TnebConsumerAccount);
  });

  return accounts;
}

/**
 * Retrieves a single TNEB consumer account by consumer number for the user
 */
export async function getTnebAccount(consumerNumber: string, userId?: string): Promise<TnebConsumerAccount | null> {
  if (!userId || userId === "default_user" || userId === "default-user") {
    return null;
  }

  const { db } = getFirebaseAdmin();
  const userDoc = getUserTnebBase(db, userId);
  const doc = await userDoc.collection("tneb_accounts").doc(consumerNumber).get();
  if (!doc.exists) return null;
  return doc.data() as TnebConsumerAccount;
}

/**
 * Retrieves all historical bills for a consumer sorted newest to oldest for the user
 */
export async function getTnebBillsForConsumer(consumerNumber: string, userId?: string): Promise<TnebBillRecord[]> {
  if (!userId || userId === "default_user" || userId === "default-user") {
    return [];
  }

  const { db } = getFirebaseAdmin();
  const userDoc = getUserTnebBase(db, userId);
  const snap = await userDoc
    .collection("tneb_bills")
    .where("consumerNumber", "==", consumerNumber)
    .get();

  if (snap.empty && userId.toLowerCase().includes("santhosh")) {
    // Migration check for primary account
    const legacySnap = await db
      .collection("tneb_bills")
      .where("consumerNumber", "==", consumerNumber)
      .get();
    if (!legacySnap.empty) {
      const bills: TnebBillRecord[] = [];
      const batch = db.batch();
      legacySnap.forEach((doc) => {
        const b = doc.data() as TnebBillRecord;
        bills.push(b);
        batch.set(userDoc.collection("tneb_bills").doc(doc.id), sanitizeForFirestore(b), { merge: true });
      });
      await batch.commit();
      bills.sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate));
      return bills;
    }
  }

  const bills: TnebBillRecord[] = [];
  snap.forEach((doc) => {
    bills.push(doc.data() as TnebBillRecord);
  });

  bills.sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate));
  return bills;
}

/**
 * Retrieves the user's saved TNEB configuration and tracked consumer list
 */
export async function getTnebConfig(userId?: string): Promise<TnebConfig> {
  if (!userId || userId === "default_user" || userId === "default-user") {
    return DEFAULT_TNEB_CONFIG;
  }

  const { db } = getFirebaseAdmin();
  const userDoc = getUserTnebBase(db, userId);
  const doc = await userDoc.collection("tneb_config").doc("settings").get();

  if (!doc.exists) {
    // Migration check for primary account
    if (userId.toLowerCase().includes("santhosh")) {
      const legacyDoc = await db.collection("tneb_config").doc("settings").get();
      if (legacyDoc.exists) {
        const legacyData = legacyDoc.data() as TnebConfig;
        await userDoc.collection("tneb_config").doc("settings").set(sanitizeForFirestore(legacyData), { merge: true });
        return legacyData;
      }
    }
    return DEFAULT_TNEB_CONFIG;
  }

  const data = doc.data() as Partial<TnebConfig>;
  return {
    ...DEFAULT_TNEB_CONFIG,
    ...data,
    trackedConsumers: data.trackedConsumers || DEFAULT_TNEB_CONFIG.trackedConsumers,
  };
}

/**
 * Saves or updates user's TNEB configuration and tracked consumer numbers
 */
export async function saveTnebConfig(config: Partial<TnebConfig>, userId?: string): Promise<TnebConfig> {
  if (!userId || userId === "default_user" || userId === "default-user") {
    throw new Error("Valid userId required to save TNEB configuration");
  }

  const { db } = getFirebaseAdmin();
  const userDoc = getUserTnebBase(db, userId);
  const current = await getTnebConfig(userId);
  const updated: TnebConfig = {
    ...current,
    ...config,
    updatedAt: new Date().toISOString(),
  };

  const clean = sanitizeForFirestore(updated);
  await userDoc.collection("tneb_config").doc("settings").set(clean, { merge: true });
  return updated;
}
