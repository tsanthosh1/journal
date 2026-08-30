import { NextRequest, NextResponse } from "next/server";
import { getValidGmailToken } from "@/lib/gmail/oauth";
import { syncAllSubscriptions, syncSubscriptionWithGmail } from "@/lib/gmail/syncEngine";
import { getSubscription } from "@/lib/serverSubscriptions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = body.userId || "default_user";
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

      const result = await syncSubscriptionWithGmail(sub, tokenRecord.accessToken);
      return NextResponse.json({ success: true, result });
    }

    const summary = await syncAllSubscriptions(userId);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("POST /api/sync/gmail error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Sync failed" },
      { status: 500 },
    );
  }
}
