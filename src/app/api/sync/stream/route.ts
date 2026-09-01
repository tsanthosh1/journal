import { NextRequest } from "next/server";
import { getValidGmailToken } from "@/lib/gmail/oauth";
import {
  syncAllSubscriptions,
  syncHistoricalSubscriptionWithGmail,
  syncSubscriptionWithGmail,
} from "@/lib/gmail/syncEngine";
import { getSubscription } from "@/lib/serverSubscriptions";
import { SyncLogEvent } from "@/lib/gmail/syncLogger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const userId = body.userId || "default_user";
  const subscriptionId = body.subscriptionId;
  const mode = body.mode || "current"; // "current" | "historical"
  const maxStatements = body.maxStatements || 24;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: SyncLogEvent | { type: "done"; data: any }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Controller might have been closed by client
        }
      };

      try {
        const tokenRecord = await getValidGmailToken(userId);
        if (!tokenRecord) {
          sendEvent({
            id: `err_${Date.now()}`,
            timestamp: new Date().toISOString(),
            level: "error",
            message:
              "Gmail is not connected. Please click 'Gmail Sync ⚡' in the top bar to connect your Google account.",
          });
          controller.close();
          return;
        }

        if (subscriptionId) {
          const sub = await getSubscription(subscriptionId);
          if (!sub) {
            sendEvent({
              id: `err_${Date.now()}`,
              timestamp: new Date().toISOString(),
              level: "error",
              message: `Subscription with ID "${subscriptionId}" was not found.`,
            });
            controller.close();
            return;
          }

          if (mode === "historical") {
            const result = await syncHistoricalSubscriptionWithGmail(
              sub,
              tokenRecord.accessToken,
              maxStatements,
              (logEvent) => sendEvent(logEvent),
            );
            sendEvent({ type: "done", data: result });
          } else {
            const result = await syncSubscriptionWithGmail(
              sub,
              tokenRecord.accessToken,
              (logEvent) => sendEvent(logEvent),
            );
            sendEvent({ type: "done", data: result });
          }
        } else {
          // Global sync for all subscriptions
          const result = await syncAllSubscriptions(userId, (logEvent) =>
            sendEvent(logEvent),
          );
          sendEvent({ type: "done", data: result });
        }
      } catch (err: any) {
        sendEvent({
          id: `err_${Date.now()}`,
          timestamp: new Date().toISOString(),
          level: "error",
          message: `Sync Stream Error: ${err.message || "Unknown error"}`,
        });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
