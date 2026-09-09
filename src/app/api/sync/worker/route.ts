import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse } from "@/lib/serverAuth";
import {
  ensureBackgroundSyncWorkerRunning,
  executeBackgroundSync,
  getBackgroundSyncWorkerStatus,
  startBackgroundSyncWorker,
  stopBackgroundSyncWorker,
} from "@/lib/sync/backgroundSyncWorker";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse();
  }

  try {
    ensureBackgroundSyncWorkerRunning();
    const status = getBackgroundSyncWorkerStatus();
    return NextResponse.json({
      success: true,
      worker: status,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to retrieve worker status" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || "run_now";

    if (action === "stop") {
      stopBackgroundSyncWorker();
      return NextResponse.json({
        success: true,
        message: "Background sync worker stopped",
        worker: getBackgroundSyncWorkerStatus(),
      });
    }

    if (action === "start") {
      const intervalMinutes = body.intervalMinutes ? parseInt(body.intervalMinutes, 10) : undefined;
      startBackgroundSyncWorker({ intervalMinutes });
      return NextResponse.json({
        success: true,
        message: "Background sync worker started",
        worker: getBackgroundSyncWorkerStatus(),
      });
    }

    if (action === "run_now") {
      const result = await executeBackgroundSync("manual");
      return NextResponse.json({
        success: true,
        message: "Background sync triggered manually",
        result,
        worker: getBackgroundSyncWorkerStatus(),
      });
    }

    return NextResponse.json(
      { error: `Unknown action: "${action}". Valid actions: run_now, start, stop` },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to process worker command" },
      { status: 500 }
    );
  }
}
