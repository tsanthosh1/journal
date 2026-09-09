import { NextRequest, NextResponse } from "next/server";
import {
  deleteSubscription,
  getSubscription,
  listHistoricalCycles,
  updateSubscription,
} from "@/lib/serverSubscriptions";
import { getVerifiedUser, unauthorizedResponse } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
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
    if (searchParams.get("includeHistory") === "true") {
      const history = await listHistoricalCycles(id);
      return NextResponse.json(
        { subscription, history },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        },
      );
    }

    return NextResponse.json(
      { subscription },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("GET /api/subscriptions/[id] error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch subscription" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getVerifiedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const existing = await getSubscription(id);

    if (!existing) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    if (existing.userId && !user.candidateUserIds.includes(existing.userId)) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    const body = await request.json();
    delete body.userId;

    const updated = await updateSubscription(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    return NextResponse.json({ subscription: updated });
  } catch (error) {
    console.error("PUT /api/subscriptions/[id] error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to update subscription" },
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
    const existing = await getSubscription(id);

    if (!existing) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    if (existing.userId && !user.candidateUserIds.includes(existing.userId)) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    await deleteSubscription(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/subscriptions/[id] error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to delete subscription" },
      { status: 500 },
    );
  }
}
