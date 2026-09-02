import { NextRequest, NextResponse } from "next/server";
import { createSubscriptionForTnebConsumer } from "@/lib/tneb/subscriptionBridge";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { consumerNumber, nickname } = body;

    if (!consumerNumber || !consumerNumber.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing required field: consumerNumber" },
        { status: 400 },
      );
    }

    const subscription = await createSubscriptionForTnebConsumer(
      consumerNumber.trim(),
      nickname?.trim(),
    );

    return NextResponse.json({
      success: true,
      message: `TNEB Consumer #${consumerNumber} successfully linked as Subscription: ${subscription.name}`,
      subscription,
    });
  } catch (error: any) {
    console.error("Error linking TNEB subscription:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to link subscription" },
      { status: 500 },
    );
  }
}
