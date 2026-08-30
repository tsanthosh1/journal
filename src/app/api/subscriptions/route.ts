import { NextRequest, NextResponse } from "next/server";
import {
  createSubscription,
  listSubscriptions,
} from "@/lib/serverSubscriptions";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "default_user";

    const subscriptions = await listSubscriptions(userId);
    return NextResponse.json({ subscriptions });
  } catch (error) {
    console.error("GET /api/subscriptions error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch subscriptions" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || !body.category || !body.billingType) {
      return NextResponse.json(
        { error: "Missing required fields: name, category, billingType" },
        { status: 400 },
      );
    }

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
