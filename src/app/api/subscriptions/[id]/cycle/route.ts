import { NextRequest, NextResponse } from "next/server";
import { overrideSubscriptionCycle, deleteSubscriptionCycle } from "@/lib/serverSubscriptions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updated = await overrideSubscriptionCycle(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    return NextResponse.json({ subscription: updated });
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
  try {
    const { id } = await params;
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
