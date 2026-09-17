import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";
import {
  createOrLinkSubscriptionForGcp,
  getLinkedGcpSubscription,
} from "@/lib/gcpBilling/subscriptionBridge";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse("Authentication required");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    const subscription = await getLinkedGcpSubscription(userId);

    return NextResponse.json({
      success: true,
      linked: Boolean(subscription),
      subscription,
    });
  } catch (error: any) {
    console.error("[GCP Billing Link GET Error]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to check GCP billing link" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse("Authentication required");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    let nickname: string | undefined;
    try {
      const body = await request.json();
      nickname = body?.nickname;
    } catch {
      // Body is optional
    }

    const subscription = await createOrLinkSubscriptionForGcp(userId, nickname);

    return NextResponse.json({
      success: true,
      message: `Google Cloud Platform successfully linked as Subscription: ${subscription.name}`,
      subscription,
    });
  } catch (error: any) {
    console.error("[GCP Billing Link POST Error]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to link GCP billing subscription" },
      { status: 500 }
    );
  }
}
