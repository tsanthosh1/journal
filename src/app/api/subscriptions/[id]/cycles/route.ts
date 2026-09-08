import { NextRequest, NextResponse } from "next/server";
import { listHistoricalCycles } from "@/lib/serverSubscriptions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const cycles = await listHistoricalCycles(id);
    return NextResponse.json(
      { cycles },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("GET /api/subscriptions/[id]/cycles error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch historical cycles" },
      { status: 500 },
    );
  }
}
