import { NextRequest } from "next/server";
import { runUnifiedSync, UnifiedSyncSource } from "@/lib/sync/unifiedSyncOrchestrator";
import { SyncLogEvent } from "@/lib/gmail/syncLogger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const userId = body.userId || "default_user";
  const subscriptionId = body.subscriptionId;
  const mode = body.mode || "current"; // "current" | "historical"
  const maxStatements = body.maxStatements || 24;

  // Optional source filtering: "all" | "gmail" | "sms" | "tneb" | "apartment" or array of sources
  let sources: UnifiedSyncSource[] = ["GMAIL", "SMS", "TNEB", "APARTMENT", "CHENNAI_WATER"];
  if (body.sources && Array.isArray(body.sources)) {
    sources = body.sources.map((s: string) => s.toUpperCase() as UnifiedSyncSource);
  } else if (body.source) {
    const s = String(body.source).toUpperCase();
    if (s === "GMAIL" || s === "SMS" || s === "TNEB" || s === "APARTMENT" || s === "CHENNAI_WATER") {
      sources = [s as UnifiedSyncSource];
    }
  }

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
        const result = await runUnifiedSync(
          {
            userId,
            sources,
            subscriptionId,
            mode,
            maxStatements,
          },
          (logEvent) => sendEvent(logEvent),
        );

        sendEvent({ type: "done", data: result });
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
