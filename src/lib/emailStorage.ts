import { getFirebaseAdmin, getFirebaseStorageBucketName } from "./firebaseAdmin";
import { SourceEmailRecord } from "./subscriptionTypes";

export interface EmailArchiveInput {
  userId: string;
  subscriptionId: string;
  subscriptionName?: string;
  cycleMonth?: string;
  messageId: string;
  type: "STATEMENT" | "PAYMENT";
  subject: string;
  from?: string;
  to?: string;
  date: string;
  bodyHtml?: string;
  bodyText?: string;
  snippet?: string;
  extractedAmount?: number;
  extractedDate?: string;
  accountOrCardDigits?: string;
  referenceId?: string;
  rawMatches?: Record<string, string>;
}

/**
 * Deeply strips undefined properties from an object so Firestore operations never reject it
 */
export function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_, value) => (value === undefined ? null : value)),
  );
}

/**
 * Saves a copy of the parsed email into Firebase Storage and Firestore metadata collection
 */
export async function saveEmailSnapshot(
  input: EmailArchiveInput,
): Promise<SourceEmailRecord> {
  const { db, storage } = getFirebaseAdmin();
  const bucketName = getFirebaseStorageBucketName();
  let storagePath: string | undefined;

  const storageFilename = `emails/${input.userId}/${input.subscriptionId}/${input.messageId}.json`;

  // 1. Save full JSON payload to Firebase Storage (if bucket is configured)
  if (bucketName) {
    try {
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(storageFilename);
      const payloadString = JSON.stringify(
        {
          id: input.messageId,
          subscriptionId: input.subscriptionId,
          subscriptionName: input.subscriptionName || null,
          type: input.type,
          subject: input.subject || "",
          from: input.from || null,
          to: input.to || null,
          date: input.date,
          bodyHtml: input.bodyHtml || null,
          bodyText: input.bodyText || null,
          extractedAmount: input.extractedAmount ?? null,
          extractedDate: input.extractedDate || null,
          accountOrCardDigits: input.accountOrCardDigits || null,
          referenceId: input.referenceId || null,
          rawMatches: input.rawMatches || {},
          archivedAt: new Date().toISOString(),
        },
        null,
        2,
      );

      await file.save(payloadString, {
        contentType: "application/json",
        metadata: {
          subscriptionId: input.subscriptionId,
          messageId: input.messageId,
          type: input.type,
        },
      });

      storagePath = storageFilename;
    } catch (err) {
      console.warn("Could not save email to Firebase Storage (proceeding with Firestore):", err);
    }
  }

  // 2. Create the SourceEmailRecord
  const now = new Date().toISOString();
  const emailRecord: SourceEmailRecord = {
    id: input.messageId,
    subscriptionId: input.subscriptionId,
    subscriptionName: input.subscriptionName || "",
    cycleMonth: input.cycleMonth || "",
    type: input.type,
    subject: input.subject || "No Subject",
    from: input.from || "",
    to: input.to || "",
    date: input.date || now,
    storagePath: storagePath || "",
    bodySnippet: input.snippet || (input.bodyText ? input.bodyText.slice(0, 280) : ""),
    bodyHtml: input.bodyHtml || "",
    bodyText: input.bodyText || "",
    extractedAmount: input.extractedAmount !== undefined ? input.extractedAmount : undefined,
    extractedDate: input.extractedDate || "",
    accountOrCardDigits: input.accountOrCardDigits || "",
    referenceId: input.referenceId || "",
    rawMatches: input.rawMatches || {},
    createdAt: now,
  };

  // 3. Save to Firestore `parsed_email_records` collection for quick retrieval
  try {
    const cleanDoc = sanitizeForFirestore(emailRecord);
    await db
      .collection("parsed_email_records")
      .doc(input.messageId)
      .set(cleanDoc, { merge: true });
  } catch (err) {
    console.error("Error saving email record to Firestore:", err);
  }

  return emailRecord;
}

/**
 * Retrieves a parsed email record from Firestore by message ID
 */
export async function getEmailRecord(messageId: string): Promise<SourceEmailRecord | null> {
  const { db } = getFirebaseAdmin();
  const snap = await db.collection("parsed_email_records").doc(messageId).get();
  if (!snap.exists) return null;
  return snap.data() as SourceEmailRecord;
}

/**
 * Retrieves all stored emails for a subscription
 */
export async function listEmailsForSubscription(
  subscriptionId: string,
): Promise<SourceEmailRecord[]> {
  const { db } = getFirebaseAdmin();
  const snap = await db
    .collection("parsed_email_records")
    .where("subscriptionId", "==", subscriptionId)
    .get();

  const list: SourceEmailRecord[] = [];
  snap.forEach((doc) => {
    list.push(doc.data() as SourceEmailRecord);
  });

  return list.sort((a, b) => b.date.localeCompare(a.date));
}
