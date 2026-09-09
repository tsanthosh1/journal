import { NextRequest, NextResponse } from "next/server";
import { listSyncLogs, clearAllSyncLogs } from "@/lib/sync/syncFileLogger";
import {
  ensureBackgroundSyncWorkerRunning,
  getBackgroundSyncWorkerStatus,
} from "@/lib/sync/backgroundSyncWorker";

import { getVerifiedUser, unauthorizedResponse } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getVerifiedUser(request);
  if (!user) {
    return unauthorizedResponse("Authentication required to access sync logs", {
      logs: [],
      totalCount: 0,
    });
  }

  try {
    ensureBackgroundSyncWorkerRunning();
    const workerStatus = getBackgroundSyncWorkerStatus();

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const action = searchParams.get("action");

    let logs = listSyncLogs(limit, user.candidateUserIds);
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

export async function DELETE(request: NextRequest) {
  const user = await getVerifiedUser(request);
  if (!user) {
    return unauthorizedResponse("Authentication required to clear sync logs");
  }

  try {
    const cleared = clearAllSyncLogs(user.candidateUserIds);
    return NextResponse.json({
      success: cleared,
      message: cleared ? "Your sync logs were cleared from file storage" : "Failed to clear sync logs",
    });
  } catch (error) {
    console.error("DELETE /api/sync/logs error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to clear sync logs" },
      { status: 500 },
    );
  }
}
