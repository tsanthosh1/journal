import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";
import { getValidGmailToken } from "@/lib/gmail/oauth";
import { syncAllSubscriptions, syncSubscriptionWithGmail } from "@/lib/gmail/syncEngine";
import { SyncLogCallback, SyncLogEvent } from "@/lib/gmail/syncLogger";
import { getSubscription } from "@/lib/serverSubscriptions";
import { saveSyncLogFile, SyncLogDetailEvent } from "@/lib/sync/syncFileLogger";

export async function POST(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse();
  }

  const startTime = Date.now();
  const collectedEvents: SyncLogDetailEvent[] = [];
  const onLog: SyncLogCallback = (event: SyncLogEvent) => {
    collectedEvents.push({
      timestamp: event.timestamp || new Date().toISOString(),
      level: event.level,
      message: event.message,
      details: event.details,
    });
  };

  try {
    const body = await request.json().catch(() => ({}));
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || body.userId || "default_user";
    const subscriptionId = body.subscriptionId;

    if (subscriptionId) {
      const sub = await getSubscription(subscriptionId);
      if (!sub) {
        return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
      }

      const tokenRecord = await getValidGmailToken(userId);
      if (!tokenRecord) {
        return NextResponse.json(
          {
            error:
              "Gmail is not connected. Please connect your Gmail account via OAuth first.",
          },
          { status: 401 },
        );
      }

      const result = await syncSubscriptionWithGmail(sub, tokenRecord.accessToken, onLog);
      saveSyncLogFile({
        actionName: `Gmail Sync - ${sub.name}`,
        logName: `${sub.name} Gmail Sync`,
        userId,
        status: result.success ? "SUCCESS" : "FAILED",
        summary: result.success ? `Processed ${result.newMessagesProcessed} new message(s)` : (result.error || "Sync failed"),
        durationMs: Date.now() - startTime,
        events: collectedEvents,
        stats: { subscriptionId: sub.id, result },
      });
      return NextResponse.json({ success: true, result });
    }

    const summary = await syncAllSubscriptions(userId, onLog);
    saveSyncLogFile({
      actionName: "Gmail Sync All",
      logName: `Gmail Full Sync (${summary.syncedCount}/${summary.totalSubscriptions})`,
      userId,
      status: summary.errors.length > 0 ? (summary.syncedCount > 0 ? "WARNING" : "FAILED") : "SUCCESS",
      summary: `Synced ${summary.syncedCount} of ${summary.totalSubscriptions} subscriptions. Found ${summary.totalNewMessages} messages.`,
      durationMs: Date.now() - startTime,
      events: collectedEvents,
      stats: summary,
    });
    return NextResponse.json(summary);
  } catch (error) {
    console.error("POST /api/sync/gmail error:", error);
    saveSyncLogFile({
      actionName: "Gmail Sync",
      status: "FAILED",
      summary: (error as Error).message || "Sync failed",
      durationMs: Date.now() - startTime,
      events: collectedEvents,
    });
    return NextResponse.json(
      { error: (error as Error).message || "Sync failed" },
      { status: 500 },
    );
  }
}
