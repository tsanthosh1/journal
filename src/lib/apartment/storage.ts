import fs from "fs";
import path from "path";
import os from "os";
import { getFirebaseAdmin } from "../firebaseAdmin";
import { sanitizeForFirestore } from "../subscriptionUtils";
import { HomefyBillRecord, HomefySession } from "./types";

const LOCAL_SESSION_FILE = path.join(os.homedir(), ".homefy_session.json");

function getUserApartmentBase(db: FirebaseFirestore.Firestore, userId?: string) {
  const safeId = userId && userId !== "default_user" && userId !== "default-user" ? userId : "default_user";
  return db.collection("users").doc(safeId);
}

/**
 * Reads Homefy session from Firestore for the specific user
 */
export async function getApartmentSession(userId?: string): Promise<HomefySession | null> {
  if (!userId || userId === "default_user" || userId === "default-user") {
    return null;
  }

  const { db } = getFirebaseAdmin();
  const userDoc = getUserApartmentBase(db, userId);

  // Check user-scoped subcollection first
  const subDoc = await userDoc.collection("apartment_config").doc("session").get();
  if (subDoc.exists) {
    return subDoc.data() as HomefySession;
  }

  // Check root apartment_config/{userId}
  const rootDoc = await db.collection("apartment_config").doc(userId).get();
  if (rootDoc.exists) {
    const sessionData = rootDoc.data() as HomefySession;
    // Migrate to user subcollection
    await userDoc.collection("apartment_config").doc("session").set(sanitizeForFirestore(sessionData), { merge: true });
    return sessionData;
  }

  // Migration for primary developer account (santhosh) from ~/.homefy_session.json
  if (userId.toLowerCase().includes("santhosh")) {
    try {
      if (fs.existsSync(LOCAL_SESSION_FILE)) {
        const raw = fs.readFileSync(LOCAL_SESSION_FILE, "utf-8");
        const localData = JSON.parse(raw);
        if (localData.swapped_token || localData.base_token) {
          const session: HomefySession = {
            mobile: localData.mobile || "",
            countryCode: localData.country_code || "+91",
            baseToken: localData.base_token,
            swappedToken: localData.swapped_token,
            activeRequestId: localData.active_request_id,
            apartmentId: localData.apartment_id,
            apartmentName: localData.apartment_name,
            flatNumber: localData.flat,
            role: localData.role,
            otpToken: localData.otp_token,
            updatedAt: new Date().toISOString(),
          };

          await userDoc.collection("apartment_config").doc("session").set(sanitizeForFirestore(session), { merge: true });
          return session;
        }
      }
    } catch (err) {
      console.warn("Failed to auto-seed from ~/.homefy_session.json:", err);
    }
  }

  return null;
}

/**
 * Saves/updates Homefy session in Firestore for the user
 */
export async function saveApartmentSession(
  session: Partial<HomefySession>,
  userId?: string,
): Promise<HomefySession> {
  if (!userId || userId === "default_user" || userId === "default-user") {
    throw new Error("Valid userId required to save apartment session");
  }

  const { db } = getFirebaseAdmin();
  const userDoc = getUserApartmentBase(db, userId);
  const existing = (await getApartmentSession(userId)) || ({} as HomefySession);

  const updated: HomefySession = {
    ...existing,
    ...session,
    updatedAt: new Date().toISOString(),
  };

  const clean = sanitizeForFirestore(updated);
  await userDoc.collection("apartment_config").doc("session").set(clean, { merge: true });
  await db.collection("apartment_config").doc(userId).set(clean, { merge: true });
  return updated;
}

/**
 * Clears the active session (logout) for the user
 */
export async function clearApartmentSession(userId?: string): Promise<void> {
  if (!userId || userId === "default_user" || userId === "default-user") {
    return;
  }

  const { db } = getFirebaseAdmin();
  const userDoc = getUserApartmentBase(db, userId);
  await userDoc.collection("apartment_config").doc("session").delete();
  await db.collection("apartment_config").doc(userId).delete();
}

/**
 * Saves cached bills to Firestore scoped to the user
 */
export async function saveCachedApartmentBills(
  bills: HomefyBillRecord[],
  userId?: string,
): Promise<number> {
  if (!userId || userId === "default_user" || userId === "default-user") {
    return 0;
  }

  const { db } = getFirebaseAdmin();
  const userDoc = getUserApartmentBase(db, userId);
  const batch = db.batch();
  let count = 0;

  for (const bill of bills) {
    const cleanBill = sanitizeForFirestore({
      ...bill,
      userId,
      updatedAt: new Date().toISOString(),
    });

    const billRef = userDoc.collection("apartment_bills").doc(bill.id);
    batch.set(billRef, cleanBill, { merge: true });
    count++;

    if (count % 400 === 0) {
      await batch.commit();
    }
  }

  await batch.commit();
  return count;
}

/**
 * Retrieves cached bills from Firestore for the specific user
 */
export async function getCachedApartmentBills(
  userId?: string,
): Promise<HomefyBillRecord[]> {
  if (!userId || userId === "default_user" || userId === "default-user") {
    return [];
  }

  const { db } = getFirebaseAdmin();
  const userDoc = getUserApartmentBase(db, userId);

  // Check user subcollection first
  const subSnap = await userDoc.collection("apartment_bills").get();
  if (!subSnap.empty) {
    const bills: HomefyBillRecord[] = [];
    subSnap.forEach((doc) => {
      bills.push(doc.data() as HomefyBillRecord);
    });
    bills.sort((a, b) => {
      const dateA = a.lastDate || a.createdAt || "";
      const dateB = b.lastDate || b.createdAt || "";
      return dateB.localeCompare(dateA);
    });
    return bills;
  }

  // Check legacy root collection with user filter
  const candidateIds = [
    userId,
    userId.replace(/[^a-zA-Z0-9_-]/g, "_"),
    userId.replace(/_/g, "-"),
  ];
  const uniqueCandidateIds = Array.from(new Set(candidateIds.filter(Boolean)));

  for (const uid of uniqueCandidateIds) {
    const snap = await db
      .collection("apartment_bills")
      .where("userId", "==", uid)
      .get();
    if (!snap.empty) {
      const bills: HomefyBillRecord[] = [];
      const batch = db.batch();
      snap.forEach((doc) => {
        const b = doc.data() as HomefyBillRecord;
        bills.push(b);
        batch.set(userDoc.collection("apartment_bills").doc(doc.id), sanitizeForFirestore(b), { merge: true });
      });
      await batch.commit();
      bills.sort((a, b) => {
        const dateA = a.lastDate || a.createdAt || "";
        const dateB = b.lastDate || b.createdAt || "";
        return dateB.localeCompare(dateA);
      });
      return bills;
    }
  }

  // Return empty list if no bills found for this user. NEVER dump all bills!
  return [];
}
