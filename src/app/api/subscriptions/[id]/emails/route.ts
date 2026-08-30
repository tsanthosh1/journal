import { NextRequest, NextResponse } from "next/server";
import { listEmailsForSubscription } from "@/lib/emailStorage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const emails = await listEmailsForSubscription(id);
    return NextResponse.json({ emails });
  } catch (error) {
    console.error("GET /api/subscriptions/[id]/emails error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch source emails" },
      { status: 500 },
    );
  }
}
