import { NextRequest, NextResponse } from "next/server";
import { getValidGmailToken } from "@/lib/gmail/oauth";
import { syncHistoricalSubscriptionWithGmail } from "@/lib/gmail/syncEngine";
import { getSubscription, listSubscriptions } from "@/lib/serverSubscriptions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = body.userId || "default_user";
    const subscriptionId = body.subscriptionId;
    const maxStatements = body.maxStatements || 24;

    const tokenRecord = await getValidGmailToken(userId);
    if (!tokenRecord) {
      return NextResponse.json(
        {
          error:
            "Gmail is not connected. Please connect your Google account via OAuth first.",
        },
        { status: 401 },
      );
    }

    if (subscriptionId) {
      const sub = await getSubscription(subscriptionId);
      if (!sub) {
        return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
      }

      const result = await syncHistoricalSubscriptionWithGmail(
        sub,
        tokenRecord.accessToken,
        maxStatements,
      );

      return NextResponse.json({ success: true, result });
    }

    // Otherwise sync historical for all automated subscriptions
    const allSubs = await listSubscriptions(userId);
    const automatedSubs = allSubs.filter((s) => s.source === "EMAIL_AUTOMATED");

    const results = [];
    let totalCycles = 0;

    for (const sub of automatedSubs) {
      try {
        const res = await syncHistoricalSubscriptionWithGmail(
          sub,
          tokenRecord.accessToken,
          maxStatements,
        );
        results.push(res);
        totalCycles += res.cyclesFound;
      } catch (err) {
        results.push({
          subscriptionId: sub.id,
          subscriptionName: sub.name,
          success: false,
          cyclesFound: 0,
          cycles: [],
          messagesScanned: 0,
          error: (err as Error).message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      subscriptionsScanned: automatedSubs.length,
      totalCyclesFound: totalCycles,
      results,
    });
  } catch (error) {
    console.error("POST /api/sync/historical error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Historical sync failed" },
      { status: 500 },
    );
  }
}
