import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { RawSmsRecord } from "@/lib/subscriptionTypes";
import { runSmsSyncEngine } from "@/lib/sms/smsSyncEngine";

interface IncomingSmsPayload {
  userId?: string;
  sender: string;
  body: string;
  timestamp: number;
}

export async function POST(request: NextRequest) {
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

    const defaultUserId = data.userId || "default_user";
    const batch = db.batch();
    let newOrUpdatedCount = 0;
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

      batch.set(docRef, record, { merge: true });
      newOrUpdatedCount++;
    }

    await batch.commit();

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

    return NextResponse.json({
      success: true,
      ingestedCount: newOrUpdatedCount,
      syncSummary,
      message: `Successfully ingested ${newOrUpdatedCount} SMS messages.`,
    });
  } catch (error) {
    console.error("POST /api/sync/sms error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to ingest SMS messages" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "default_user";
    const limitParam = parseInt(searchParams.get("limit") || "50", 10);

    const { db } = getFirebaseAdmin();
    const snap = await db
      .collection("raw_sms")
      .where("userId", "==", userId)
      .limit(limitParam)
      .get();

    const messages = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({
      success: true,
      totalCount: snap.size,
      messages,
    });
  } catch (error) {
    console.error("GET /api/sync/sms error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch SMS records" },
      { status: 500 },
    );
  }
}
