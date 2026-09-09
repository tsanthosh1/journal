import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse } from "@/lib/serverAuth";
import { createSubscriptionForChennaiWater } from "@/lib/chennaiWater/subscriptionBridge";

export async function POST(req: NextRequest) {
  if (!await isAuthorizedUser(req)) {
    return unauthorizedResponse();
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { billNumber, customNickname, userId = "default-user" } = body;

    const subscription = await createSubscriptionForChennaiWater(
      billNumber,
      customNickname,
      userId
    );

    return NextResponse.json({
      success: true,
      message: `Linked Chennai Metro Water (${subscription.chennaiWaterConfig?.billNumber || "CMWSSB"}) to subscriptions.`,
      subscription,
    });
  } catch (error: any) {
    console.error("Link Chennai Water Subscription error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to link subscription." },
      { status: 500 }
    );
  }
}
