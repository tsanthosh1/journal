import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";
import { createHash } from "crypto";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { RawSmsRecord } from "@/lib/subscriptionTypes";
import { runSmsSyncEngine } from "@/lib/sms/smsSyncEngine";
import { saveSyncLogFile } from "@/lib/sync/syncFileLogger";

interface IncomingSmsPayload {
  userId?: string;
  sender: string;
  body: string;
  timestamp: number;
}

export async function POST(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse();
  }

  try {
    const data = await request.json();
    const { db } = getFirebaseAdmin();

    const messages: IncomingSmsPayload[] = Array.isArray(data.messages)
      ? data.messages
      : Array.isArray(data)
      ? data
      : [data];

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "No SMS messages provided in payload" },
        { status: 400 },
      );
    }

    const verifiedUserId = await getVerifiedUserId(request);
    const defaultUserId = verifiedUserId || data.userId || "default_user";
    const docsToCommit: { docRef: FirebaseFirestore.DocumentReference; record: RawSmsRecord }[] = [];
    let effectiveUserId = defaultUserId;

    for (const msg of messages) {
      if (!msg.body || !msg.sender) continue;

      const sender = msg.sender.trim();
      const body = msg.body.trim();
      const timestamp = msg.timestamp || Date.now();
      const userId = msg.userId || defaultUserId;
      if (userId && userId !== "default_user") {
        effectiveUserId = userId;
      }

      // Generate deterministic SHA-256 fingerprint ID
      const hash = createHash("sha256")
        .update(`${sender}_${timestamp}_${body}`)
        .digest("hex")
        .slice(0, 32);

      const docRef = db.collection("raw_sms").doc(hash);
      const isoDate = new Date(timestamp).toISOString();

      const record: RawSmsRecord = {
        id: hash,
        userId,
        sender,
        body,
        timestamp,
        date: isoDate,
        processed: false,
        createdAt: new Date().toISOString(),
      };

      docsToCommit.push({ docRef, record });
    }

    // Chunk Firestore batch writes (Firestore limit is 500 operations per batch)
    const BATCH_SIZE = 400;
    for (let i = 0; i < docsToCommit.length; i += BATCH_SIZE) {
      const chunk = docsToCommit.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const { docRef, record } of chunk) {
        batch.set(docRef, record, { merge: true });
      }
      await batch.commit();
    }

    const newOrUpdatedCount = docsToCommit.length;

    // Automatically trigger sync reconciliation in background
    let syncSummary = null;
    if (effectiveUserId) {
      try {
        const syncResult = await runSmsSyncEngine(effectiveUserId);
        syncSummary = syncResult.summaryText;
      } catch (err) {
        console.warn("Background SMS reconciliation error:", err);
      }
    }

    saveSyncLogFile({
      actionName: "SMS Ingestion Batch",
      logName: `SMS Ingestion (${newOrUpdatedCount} msgs)`,
      userId: effectiveUserId,
      status: "SUCCESS",
      summary: `Ingested ${newOrUpdatedCount} bank SMS messages into raw_sms collection. ${syncSummary || ""}`,
      events: [
        {
          timestamp: new Date().toISOString(),
          level: "info",
          message: `Received payload with ${messages.length} raw SMS messages for user ${effectiveUserId}`,
        },
        {
          timestamp: new Date().toISOString(),
          level: "save",
          message: `Committed ${newOrUpdatedCount} SMS documents to Firestore in chunked batches`,
          details: { sampleSenders: Array.from(new Set(docsToCommit.map((d) => d.record.sender))).slice(0, 8) },
        },
        ...(syncSummary
          ? [
              {
                timestamp: new Date().toISOString(),
                level: "success" as const,
                message: `Background loan reconciliation: ${syncSummary}`,
              },
            ]
          : []),
      ],
      stats: {
        ingestedCount: newOrUpdatedCount,
        syncSummary,
      },
    });

    return NextResponse.json({
      success: true,
      ingestedCount: newOrUpdatedCount,
      syncSummary,
      message: `Successfully ingested ${newOrUpdatedCount} SMS messages.`,
    });
  } catch (error) {
    console.error("POST /api/sync/sms error:", error);
    saveSyncLogFile({
      actionName: "SMS Ingestion Batch",
      logName: "SMS Ingestion Error",
      userId: "unknown",
      status: "FAILED",
      summary: (error as Error).message || "Failed to ingest SMS messages",
      events: [
        {
          timestamp: new Date().toISOString(),
          level: "error",
          message: (error as Error).message || "Failed to ingest SMS messages",
        },
      ],
    });
    return NextResponse.json(
      { error: (error as Error).message || "Failed to ingest SMS messages" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || searchParams.get("userId") || "default_user";
    const limitParam = parseInt(searchParams.get("limit") || "100", 10);

    const { db } = getFirebaseAdmin();
    const snap = await db
      .collection("raw_sms")
      .where("userId", "==", userId)
      .get();

    const messages = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Ensure sorted by timestamp descending (newest first)
    messages.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

    const pagedMessages = messages.slice(0, limitParam);

    return NextResponse.json({
      success: true,
      totalCount: messages.length,
      messages: pagedMessages,
    });
  } catch (error) {
    console.error("GET /api/sync/sms error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch SMS records" },
      { status: 500 },
    );
  }
}
