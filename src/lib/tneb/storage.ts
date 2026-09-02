import { getFirebaseAdmin } from "../firebaseAdmin";
import { sanitizeForFirestore } from "../emailStorage";
import { TnebBillRecord, TnebConfig, TnebConsumerAccount } from "./types";

/**
 * Saves TNEB account profile and historical bills to Firestore with merge semantics
 */
export async function saveTnebAccountAndBills(
  account: TnebConsumerAccount,
  bills: TnebBillRecord[],
): Promise<{ accountSaved: boolean; billsSavedCount: number }> {
  const { db } = getFirebaseAdmin();

  const cleanAccount = sanitizeForFirestore({
    ...account,
    updatedAt: new Date().toISOString(),
  });

  const accountRef = db.collection("tneb_accounts").doc(account.consumerNumber);
  await accountRef.set(cleanAccount, { merge: true });

  const batch = db.batch();
  let count = 0;

  for (const bill of bills) {
    const cleanBill = sanitizeForFirestore({
      ...bill,
      updatedAt: new Date().toISOString(),
    });

    const billRef = db.collection("tneb_bills").doc(bill.id);
    batch.set(billRef, cleanBill, { merge: true });
    count++;

    // Firestore batch limit is 500
    if (count % 400 === 0) {
      await batch.commit();
    }
  }

  await batch.commit();

  // Automatically update any linked Subscriptions
  try {
    const { syncTnebToSubscriptions } = await import("./subscriptionBridge");
    await syncTnebToSubscriptions(account, bills);
  } catch (bridgeErr) {
    console.warn("Notice: subscription bridge sync skipped:", bridgeErr);
  }

  return { accountSaved: true, billsSavedCount: count };
}

/**
 * Retrieves all stored TNEB consumer accounts
 */
export async function getAllTnebAccounts(): Promise<TnebConsumerAccount[]> {
  const { db } = getFirebaseAdmin();
  const snap = await db.collection("tneb_accounts").orderBy("consumerNumber", "asc").get();

  const accounts: TnebConsumerAccount[] = [];
  snap.forEach((doc) => {
    accounts.push(doc.data() as TnebConsumerAccount);
  });

  return accounts;
}

/**
 * Retrieves a single TNEB consumer account by consumer number
 */
export async function getTnebAccount(consumerNumber: string): Promise<TnebConsumerAccount | null> {
  const { db } = getFirebaseAdmin();
  const doc = await db.collection("tneb_accounts").doc(consumerNumber).get();
  if (!doc.exists) return null;
  return doc.data() as TnebConsumerAccount;
}

/**
 * Retrieves all historical bills for a consumer sorted newest to oldest
 */
export async function getTnebBillsForConsumer(consumerNumber: string): Promise<TnebBillRecord[]> {
  const { db } = getFirebaseAdmin();
  const snap = await db
    .collection("tneb_bills")
    .where("consumerNumber", "==", consumerNumber)
    .get();

  const bills: TnebBillRecord[] = [];
  snap.forEach((doc) => {
    bills.push(doc.data() as TnebBillRecord);
  });

  // Sort chronologically descending
  bills.sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate));

  return bills;
}

const DEFAULT_TNEB_CONFIG: TnebConfig = {
  trackedConsumers: [
    {
      consumerNumber: "09299011890",
      nickname: "Thoraipakkam Home",
      addressSnippet: "60, 9th Cross Street, Okkiyam Thoraipakkam",
      enabled: true,
      addedAt: new Date().toISOString(),
    },
    {
      consumerNumber: "024310032538",
      nickname: "Kandamangalam",
      addressSnippet: "126/1C, Natesan Naghar, Kandamangalam",
      enabled: true,
      addedAt: new Date().toISOString(),
    },
  ],
  syncAllFound: false,
  autoSyncEnabled: true,
  updatedAt: new Date().toISOString(),
};

/**
 * Retrieves the user's saved TNEB configuration and tracked consumer list
 */
export async function getTnebConfig(): Promise<TnebConfig> {
  const { db } = getFirebaseAdmin();
  const doc = await db.collection("tneb_config").doc("settings").get();
  if (!doc.exists) {
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
export async function saveTnebConfig(config: Partial<TnebConfig>): Promise<TnebConfig> {
  const { db } = getFirebaseAdmin();
  const current = await getTnebConfig();
  const updated: TnebConfig = {
    ...current,
    ...config,
    updatedAt: new Date().toISOString(),
  };

  const clean = sanitizeForFirestore(updated);
  await db.collection("tneb_config").doc("settings").set(clean, { merge: true });
  return updated;
}
