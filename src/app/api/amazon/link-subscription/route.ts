import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";
import {
  syncKindleUnlimitedSubscription,
  getKindleSubscriptionStatus,
} from "@/lib/amazon/subscriptionBridge";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedUser(request))) {
    return unauthorizedResponse("Authentication required to check Kindle subscription status");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    const status = await getKindleSubscriptionStatus(userId);
    return NextResponse.json({ success: true, ...status });
  } catch (error: any) {
    console.error("GET /api/amazon/link-subscription error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to check subscription status" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorizedUser(request))) {
    return unauthorizedResponse("Authentication required to link Kindle subscription");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    const result = await syncKindleUnlimitedSubscription(userId);
    return NextResponse.json({
      success: true,
      message: `Kindle Unlimited successfully linked to Subscriptions with ${result.syncedCyclesCount} past cycles!`,
      subscription: result.subscription,
      syncedCyclesCount: result.syncedCyclesCount,
    });
  } catch (error: any) {
    console.error("POST /api/amazon/link-subscription error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to link Kindle subscription" },
      { status: 500 },
    );
  }
}
