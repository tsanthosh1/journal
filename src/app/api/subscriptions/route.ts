import { NextRequest, NextResponse } from "next/server";
import {
  createSubscription,
  listSubscriptions,
} from "@/lib/serverSubscriptions";
import { getVerifiedUser, unauthorizedResponse } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const user = await getVerifiedUser(request);
  if (!user) {
    return unauthorizedResponse("Authentication required to access subscriptions", {
      subscriptions: [],
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get("userId");
    const targetUserId =
      requestedUserId && user.candidateUserIds.includes(requestedUserId)
        ? requestedUserId
        : user.primaryUserId;

    const subscriptions = await listSubscriptions(targetUserId);
    return NextResponse.json(
      { subscriptions },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error) {
    console.error("GET /api/subscriptions error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch subscriptions" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getVerifiedUser(request);
  if (!user) {
    return unauthorizedResponse("Authentication required to create subscription");
  }

  try {
    const body = await request.json();

    if (!body.name || !body.category || !body.billingType) {
      return NextResponse.json(
        { error: "Missing required fields: name, category, billingType" },
        { status: 400 },
      );
    }

    // Force ownership to authenticated user
    body.userId = user.primaryUserId;

    const subscription = await createSubscription(body);
    return NextResponse.json({ subscription }, { status: 201 });
  } catch (error) {
    console.error("POST /api/subscriptions error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to create subscription" },
      { status: 500 },
    );
  }
}
