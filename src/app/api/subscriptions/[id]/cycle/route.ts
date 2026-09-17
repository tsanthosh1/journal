import { NextRequest, NextResponse } from "next/server";
import {
  overrideSubscriptionCycle,
  deleteSubscriptionCycle,
  getSubscription,
} from "@/lib/serverSubscriptions";
import { getVerifiedUser, unauthorizedResponse } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getVerifiedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const subscription = await getSubscription(id);
    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    if (subscription.userId && !user.candidateUserIds.includes(subscription.userId)) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    const updated = await overrideSubscriptionCycle(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    return NextResponse.json(
      { subscription: updated },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("POST /api/subscriptions/[id]/cycle error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to override cycle" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getVerifiedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const subscription = await getSubscription(id);
    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    if (subscription.userId && !user.candidateUserIds.includes(subscription.userId)) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    if (!month) {
      return NextResponse.json({ error: "Missing cycle month query parameter" }, { status: 400 });
    }

    const updated = await deleteSubscriptionCycle(id, month);
    return NextResponse.json({ subscription: updated, deletedMonth: month });
  } catch (error) {
    console.error("DELETE /api/subscriptions/[id]/cycle error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to delete cycle" },
      { status: 500 },
    );
  }
}
