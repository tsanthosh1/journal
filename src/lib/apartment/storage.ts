import fs from "fs";
import path from "path";
import os from "os";
import { getFirebaseAdmin } from "../firebaseAdmin";
import { sanitizeForFirestore } from "../subscriptionUtils";
import { HomefyBillRecord, HomefySession } from "./types";

const LOCAL_SESSION_FILE = path.join(os.homedir(), ".homefy_session.json");

/**
 * Reads Homefy session from Firestore, with fallback auto-import from ~/.homefy_session.json
 */
export async function getApartmentSession(userId: string = "default-user"): Promise<HomefySession | null> {
  const { db } = getFirebaseAdmin();
  const candidateIds = [
    userId,
    userId.replace(/[^a-zA-Z0-9_-]/g, "_"),
    userId.replace(/_/g, "-"),
    "default-user",
    "default_user",
  ];
  const uniqueCandidateIds = Array.from(new Set(candidateIds.filter(Boolean)));

  for (const uid of uniqueCandidateIds) {
    const docRef = db.collection("apartment_config").doc(uid);
    const snap = await docRef.get();
    if (snap.exists) {
      return snap.data() as HomefySession;
    }
  }

  // Check if ~/.homefy_session.json exists locally to auto-seed Firestore
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

        const targetDoc = db.collection("apartment_config").doc(userId);
        await targetDoc.set(sanitizeForFirestore(session), { merge: true });
        return session;
      }
    }
  } catch (err) {
    console.warn("Failed to auto-seed from ~/.homefy_session.json:", err);
  }

  return null;
}

/**
 * Saves/updates Homefy session in Firestore
 */
export async function saveApartmentSession(
  session: Partial<HomefySession>,
  userId: string = "default-user",
): Promise<HomefySession> {
  const { db } = getFirebaseAdmin();
  const docRef = db.collection("apartment_config").doc(userId);
  const snap = await docRef.get();
  const existing = snap.exists ? (snap.data() as HomefySession) : ({} as HomefySession);

  const updated: HomefySession = {
    ...existing,
    ...session,
    updatedAt: new Date().toISOString(),
  };

  await docRef.set(sanitizeForFirestore(updated), { merge: true });
  return updated;
}

/**
 * Clears the active session (logout)
 */
export async function clearApartmentSession(userId: string = "default-user"): Promise<void> {
  const { db } = getFirebaseAdmin();
  await db.collection("apartment_config").doc(userId).delete();
}

/**
 * Saves cached bills to Firestore collection `apartment_bills`
 */
export async function saveCachedApartmentBills(
  bills: HomefyBillRecord[],
  userId: string = "default-user",
): Promise<number> {
  const { db } = getFirebaseAdmin();
  const batch = db.batch();
  let count = 0;

  for (const bill of bills) {
    const cleanBill = sanitizeForFirestore({
      ...bill,
      userId,
      updatedAt: new Date().toISOString(),
    });

    const billRef = db.collection("apartment_bills").doc(bill.id);
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
 * Retrieves cached bills from Firestore
 */
export async function getCachedApartmentBills(
  userId: string = "default-user",
): Promise<HomefyBillRecord[]> {
  const { db } = getFirebaseAdmin();
  const candidateIds = [
    userId,
    userId.replace(/[^a-zA-Z0-9_-]/g, "_"),
    userId.replace(/_/g, "-"),
    "default-user",
    "default_user",
  ];
  const uniqueCandidateIds = Array.from(new Set(candidateIds.filter(Boolean)));

  for (const uid of uniqueCandidateIds) {
    const snap = await db
      .collection("apartment_bills")
      .where("userId", "==", uid)
      .get();
    if (!snap.empty) {
      const bills: HomefyBillRecord[] = [];
      snap.forEach((doc) => {
        bills.push(doc.data() as HomefyBillRecord);
      });
      bills.sort((a, b) => {
        const dateA = a.lastDate || a.createdAt || "";
        const dateB = b.lastDate || b.createdAt || "";
        return dateB.localeCompare(dateA);
      });
      return bills;
    }
  }

  // Fallback: if no bills found under the specific user filter, return all stored apartment bills
  const allSnap = await db.collection("apartment_bills").get();
  const bills: HomefyBillRecord[] = [];
  allSnap.forEach((doc) => {
    bills.push(doc.data() as HomefyBillRecord);
  });

  // Sort descending by lastDate or createdAt
  bills.sort((a, b) => {
    const dateA = a.lastDate || a.createdAt || "";
    const dateB = b.lastDate || b.createdAt || "";
    return dateB.localeCompare(dateA);
  });

  return bills;
}
