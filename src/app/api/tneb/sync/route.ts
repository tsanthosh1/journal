import { NextRequest, NextResponse } from "next/server";
import { scrapeAndSyncTneb } from "@/lib/tneb/scraper";
import { TnebScrapeOptions } from "@/lib/tneb/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const isStream = request.nextUrl.searchParams.get("stream") === "true";

  let body: TnebScrapeOptions = {};
  try {
    body = await request.json();
  } catch {
    // empty payload is fine
  }

  if (isStream) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        sendEvent({
          type: "START",
          message: "Initiating Tamil Nadu EB portal sync...",
          timestamp: new Date().toISOString(),
        });

        try {
          const result = await scrapeAndSyncTneb(body, (level, message, details) => {
            sendEvent({
              type: "LOG",
              level,
              message,
              details,
              timestamp: new Date().toISOString(),
            });
          });

          sendEvent({
            type: "COMPLETE",
            result,
            timestamp: new Date().toISOString(),
          });
        } catch (err: any) {
          sendEvent({
            type: "ERROR",
            error: err.message || "Failed to execute TNEB scraping",
            timestamp: new Date().toISOString(),
          });
        } finally {
          controller.close();
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

  // Standard JSON response
  try {
    const result = await scrapeAndSyncTneb(body);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("TNEB sync error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Sync execution failed" },
      { status: 500 },
    );
  }
}
