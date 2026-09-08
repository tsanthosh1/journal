import { NextRequest, NextResponse } from "next/server";
import { getSyncLogById } from "@/lib/sync/syncFileLogger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const log = getSyncLogById(id);

    if (!log) {
      return NextResponse.json(
        { error: `Sync log with ID "${id}" not found in file storage` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      log,
    });
  } catch (error) {
    console.error("GET /api/sync/logs/[id] error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch sync log details" },
      { status: 500 },
    );
  }
}
