import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse } from "@/lib/serverAuth";
import { runSmsSyncEngine } from "@/lib/sms/smsSyncEngine";
import { saveSyncLogFile } from "@/lib/sync/syncFileLogger";

export async function POST(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const userId = body.userId || searchParams.get("userId") || "default_user";

    if (!userId || userId === "default_user") {
      return NextResponse.json(
        { error: "Valid userId is required for SMS processing" },
        { status: 400 },
      );
    }

    const startTime = Date.now();
    const result = await runSmsSyncEngine(userId);

    // Save sync trace to server file storage
    saveSyncLogFile({
      actionName: "SMS Loan Reconciliation",
      logName: `SMS Reconciliation (${result.matchedSmsCount} matched)`,
      userId,
      status: result.success ? "SUCCESS" : "FAILED",
      summary: result.summaryText || `Reconciled ${result.matchedSmsCount} SMS records`,
      durationMs: Date.now() - startTime,
      events: [
        {
          timestamp: new Date().toISOString(),
          level: "info",
          message: `Fetched ${result.totalSmsFound} raw SMS records from database for user ${userId}`,
        },
        {
          timestamp: new Date().toISOString(),
          level: "match",
          message: `Matched ${result.matchedSmsCount} bank loan debits against active subscriptions`,
          details: { matchedCount: result.matchedSmsCount },
        },
        ...result.details.map((d) => ({
          timestamp: new Date().toISOString(),
          level: "save" as const,
          message: `Reconciled ${d.subscriptionName} (${d.cycleMonth}): ₹${d.amountPaid.toLocaleString()} [${d.status}] from SMS on ${d.smsDate || "N/A"}`,
          details: d,
        })),
        {
          timestamp: new Date().toISOString(),
          level: "success",
          message: result.summaryText,
        },
      ],
      stats: {
        totalSmsFound: result.totalSmsFound,
        matchedSmsCount: result.matchedSmsCount,
        updatedSubscriptions: result.updatedSubscriptions,
        cycleDetails: result.details,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/sync/sms/process error:", error);
    saveSyncLogFile({
      actionName: "SMS Loan Reconciliation",
      logName: "SMS Reconciliation Error",
      userId: "unknown",
      status: "FAILED",
      summary: (error as Error).message || "Failed to process SMS messages",
      events: [
        {
          timestamp: new Date().toISOString(),
          level: "error",
          message: (error as Error).message || "Failed to process SMS messages",
        },
      ],
    });
    return NextResponse.json(
      { error: (error as Error).message || "Failed to process SMS messages" },
      { status: 500 },
    );
  }
}
