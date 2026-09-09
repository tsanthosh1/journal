import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse } from "@/lib/serverAuth";
import { createSubscriptionForApartmentCategory } from "@/lib/apartment/subscriptionBridge";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { categoryName, customNickname } = body;

    if (!categoryName || !categoryName.trim()) {
      return NextResponse.json(
        { success: false, error: "categoryName is required (e.g. 'Maintenance Bill', 'Water Bill', or 'ALL')" },
        { status: 400 },
      );
    }

    const subscription = await createSubscriptionForApartmentCategory(
      categoryName.trim(),
      customNickname?.trim(),
    );

    return NextResponse.json({
      success: true,
      message: `Apartment bill '${categoryName}' successfully linked to Subscriptions: ${subscription.name}`,
      subscription,
    });
  } catch (err: any) {
    console.error("Error in POST /api/apartment/link-subscription:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to link apartment subscription" },
      { status: 500 },
    );
  }
}
