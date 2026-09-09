import { runUnifiedSync, UnifiedSyncResult } from "./unifiedSyncOrchestrator";

export interface BackgroundSyncWorkerState {
  started: boolean;
  enabled: boolean;
  intervalMinutes: number;
  timerId: NodeJS.Timeout | null;
  initialTimerId: NodeJS.Timeout | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  isSyncing: boolean;
  totalRuns: number;
  consecutiveErrors: number;
  lastResult: {
    timestamp: string;
    success: boolean;
    durationMs: number;
    sourcesRun: string[];
    errors: string[];
    summary: string;
  } | null;
}

export interface WorkerStatusResponse {
  started: boolean;
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  isSyncing: boolean;
  totalRuns: number;
  consecutiveErrors: number;
  lastResult: BackgroundSyncWorkerState["lastResult"];
}

declare global {
  // eslint-disable-next-line no-var
  var __journalBackgroundSyncWorker: BackgroundSyncWorkerState | undefined;
}

/**
 * Initializes or returns the existing singleton worker state from globalThis
 */
function getWorkerState(): BackgroundSyncWorkerState {
  if (!globalThis.__journalBackgroundSyncWorker) {
    const defaultInterval = parseInt(process.env.SYNC_WORKER_INTERVAL_MINUTES || "60", 10) || 60;
    const isEnabled = process.env.SYNC_WORKER_ENABLED !== "false";

    globalThis.__journalBackgroundSyncWorker = {
      started: false,
      enabled: isEnabled,
      intervalMinutes: defaultInterval,
      timerId: null,
      initialTimerId: null,
      lastRunAt: null,
      nextRunAt: null,
      isSyncing: false,
      totalRuns: 0,
      consecutiveErrors: 0,
      lastResult: null,
    };
  }
  return globalThis.__journalBackgroundSyncWorker;
}

/**
 * Executes a single background sync run with concurrency protection
 */
export async function executeBackgroundSync(
  triggerType: "initial" | "scheduled" | "manual" = "scheduled"
): Promise<UnifiedSyncResult | null> {
  const state = getWorkerState();

  if (state.isSyncing) {
    console.warn(`[BackgroundSyncWorker] (${triggerType}) Previous sync run is still in progress. Skipping.`);
    return null;
  }

  state.isSyncing = true;
  const runTimestamp = new Date().toISOString();
  state.lastRunAt = runTimestamp;

  console.log(`[BackgroundSyncWorker] 🚀 Triggering ${triggerType} scheduled sync at ${runTimestamp}...`);

  try {
    const result = await runUnifiedSync({
      userId: "default_user",
      trigger: "SCHEDULED",
      sources: ["GMAIL", "SMS", "TNEB", "APARTMENT", "CHENNAI_WATER"],
    });

    state.totalRuns += 1;
    state.consecutiveErrors = result.errors.length > 0 ? state.consecutiveErrors + 1 : 0;
    state.lastResult = {
      timestamp: runTimestamp,
      success: result.success,
      durationMs: result.durationMs,
      sourcesRun: result.sourcesRun,
      errors: result.errors,
      summary: result.errors.length > 0
        ? `Completed with ${result.errors.length} error(s): ${result.errors.slice(0, 2).join("; ")}`
        : `Successfully synchronized across ${result.sourcesRun.length} service(s) in ${(result.durationMs / 1000).toFixed(1)}s`,
    };

    console.log(
      `[BackgroundSyncWorker] ✅ ${triggerType} sync completed in ${(result.durationMs / 1000).toFixed(1)}s [Status: ${
        result.success ? "SUCCESS" : "WARNING"
      }]`
    );

    return result;
  } catch (err: any) {
    state.consecutiveErrors += 1;
    state.lastResult = {
      timestamp: runTimestamp,
      success: false,
      durationMs: 0,
      sourcesRun: [],
      errors: [err.message || String(err)],
      summary: `Failed to execute background sync: ${err.message || String(err)}`,
    };
    console.error(`[BackgroundSyncWorker] ❌ Error executing ${triggerType} sync:`, err);
    return null;
  } finally {
    state.isSyncing = false;
    // Update next expected run timestamp
    state.nextRunAt = new Date(Date.now() + state.intervalMinutes * 60 * 1000).toISOString();
  }
}

/**
 * Starts the Node background worker if not already running
 */
export function startBackgroundSyncWorker(options?: {
  intervalMinutes?: number;
  runImmediate?: boolean;
}): BackgroundSyncWorkerState {
  const state = getWorkerState();

  if (state.started) {
    return state;
  }

  if (process.env.SYNC_WORKER_ENABLED === "false") {
    console.log("[BackgroundSyncWorker] Disabled via SYNC_WORKER_ENABLED=false");
    return state;
  }

  if (options?.intervalMinutes && options.intervalMinutes > 0) {
    state.intervalMinutes = options.intervalMinutes;
  }

  state.started = true;
  const intervalMs = state.intervalMinutes * 60 * 1000;
  state.nextRunAt = new Date(Date.now() + intervalMs).toISOString();

  console.log(
    `[BackgroundSyncWorker] Initialized. Scheduled to run every ${state.intervalMinutes}m (Next run: ${state.nextRunAt})`
  );

  // Set recurring interval
  state.timerId = setInterval(() => {
    executeBackgroundSync("scheduled").catch((err) => {
      console.error("[BackgroundSyncWorker] Recurring sync uncaught error:", err);
    });
  }, intervalMs);

  // Unref timer so it doesn't block graceful Node shutdown
  if (state.timerId.unref) {
    state.timerId.unref();
  }

  // Initial run after a short delay (15s) so dev server boot & DB connections settle
  if (options?.runImmediate !== false) {
    const initialDelayMs = 15 * 1000;
    state.initialTimerId = setTimeout(() => {
      executeBackgroundSync("initial").catch((err) => {
        console.error("[BackgroundSyncWorker] Initial sync uncaught error:", err);
      });
    }, initialDelayMs);

    if (state.initialTimerId.unref) {
      state.initialTimerId.unref();
    }
  }

  return state;
}

/**
 * Stops the Node background worker
 */
export function stopBackgroundSyncWorker(): BackgroundSyncWorkerState {
  const state = getWorkerState();

  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  if (state.initialTimerId) {
    clearTimeout(state.initialTimerId);
    state.initialTimerId = null;
  }

  state.started = false;
  state.nextRunAt = null;
  console.log("[BackgroundSyncWorker] Stopped.");
  return state;
}

/**
 * Returns JSON-safe status of the background sync worker
 */
export function getBackgroundSyncWorkerStatus(): WorkerStatusResponse {
  const state = getWorkerState();
  return {
    started: state.started,
    enabled: state.enabled,
    intervalMinutes: state.intervalMinutes,
    lastRunAt: state.lastRunAt,
    nextRunAt: state.nextRunAt,
    isSyncing: state.isSyncing,
    totalRuns: state.totalRuns,
    consecutiveErrors: state.consecutiveErrors,
    lastResult: state.lastResult,
  };
}

/**
 * Fallback to ensure background worker is started if instrumentation didn't trigger
 */
export function ensureBackgroundSyncWorkerRunning(): BackgroundSyncWorkerState {
  const state = getWorkerState();
  if (!state.started && state.enabled) {
    return startBackgroundSyncWorker();
  }
  return state;
}
