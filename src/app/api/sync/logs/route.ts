import { NextRequest, NextResponse } from "next/server";
import { listSyncLogs, clearAllSyncLogs } from "@/lib/sync/syncFileLogger";
import {
  ensureBackgroundSyncWorkerRunning,
  getBackgroundSyncWorkerStatus,
} from "@/lib/sync/backgroundSyncWorker";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    ensureBackgroundSyncWorkerRunning();
    const workerStatus = getBackgroundSyncWorkerStatus();

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const action = searchParams.get("action");

    let logs = listSyncLogs(limit);
    if (action) {
      logs = logs.filter((l) => l.actionName.toLowerCase().includes(action.toLowerCase()));
    }

    return NextResponse.json({
      success: true,
      totalCount: logs.length,
      logs,
      worker: workerStatus,
    });
  } catch (error) {
    console.error("GET /api/sync/logs error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to list sync logs" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const cleared = clearAllSyncLogs();
    return NextResponse.json({
      success: cleared,
      message: cleared ? "All sync logs cleared from file storage" : "Failed to clear sync logs",
    });
  } catch (error) {
    console.error("DELETE /api/sync/logs error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to clear sync logs" },
      { status: 500 },
    );
  }
}
