import fs from "fs";
import path from "path";

export interface SyncLogDetailEvent {
  timestamp: string;
  level: "info" | "success" | "warn" | "error" | "query" | "fetch" | "parse" | "match" | "save";
  message: string;
  details?: Record<string, any>;
}

export interface SyncFileLogRecord {
  id: string;
  logName: string;
  actionName: string;
  timestamp: number;
  formattedDate: string;
  status: "SUCCESS" | "FAILED" | "WARNING";
  summary: string;
  userId?: string;
  durationMs?: number;
  fileName: string;
  events: SyncLogDetailEvent[];
  stats?: Record<string, any>;
}

export type SyncFileLogSummary = Omit<SyncFileLogRecord, "events"> & {
  eventCount: number;
};

const LOGS_DIR = path.join(process.cwd(), ".data", "sync_logs");

function ensureLogsDir(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/**
 * Persists a complete sync session log into file storage.
 */
export function saveSyncLogFile(data: {
  actionName: string;
  logName?: string;
  userId?: string;
  status: "SUCCESS" | "FAILED" | "WARNING";
  summary: string;
  durationMs?: number;
  events?: SyncLogDetailEvent[];
  stats?: Record<string, any>;
}): SyncFileLogRecord {
  try {
    ensureLogsDir();

    const timestamp = Date.now();
    const dateObj = new Date(timestamp);
    const dateStr = dateObj.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const safeAction = data.actionName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const id = `log_${timestamp}_${safeAction.toLowerCase()}`;
    const logName = data.logName || `${data.actionName} - ${dateStr}`;
    const fileName = `${id}.json`;
    const filePath = path.join(LOGS_DIR, fileName);

    const record: SyncFileLogRecord = {
      id,
      logName,
      actionName: data.actionName,
      timestamp,
      formattedDate: dateStr,
      status: data.status,
      summary: data.summary,
      userId: data.userId || "default_user",
      durationMs: data.durationMs || 0,
      fileName,
      events: data.events || [],
      stats: data.stats,
    };

    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");

    // Retain newest 100 logs
    const files = fs.readdirSync(LOGS_DIR).filter((f) => f.endsWith(".json"));
    if (files.length > 100) {
      files.sort();
      for (const oldFile of files.slice(0, files.length - 100)) {
        try {
          fs.unlinkSync(path.join(LOGS_DIR, oldFile));
        } catch (_) {}
      }
    }

    return record;
  } catch (err) {
    console.error("[syncFileLogger] Failed to write sync log file:", err);
    const fallbackId = `err_${Date.now()}`;
    return {
      id: fallbackId,
      logName: data.actionName,
      actionName: data.actionName,
      timestamp: Date.now(),
      formattedDate: new Date().toISOString(),
      status: "FAILED",
      summary: (err as Error).message || "Storage error",
      fileName: "",
      events: [],
    };
  }
}

/**
 * Returns summaries of all saved sync logs, ordered newest first.
 */
export function listSyncLogs(limit = 100): SyncFileLogSummary[] {
  try {
    ensureLogsDir();

    const files = fs
      .readdirSync(LOGS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    const summaries: SyncFileLogSummary[] = [];

    for (const file of files.slice(0, limit)) {
      try {
        const content = fs.readFileSync(path.join(LOGS_DIR, file), "utf-8");
        const parsed: SyncFileLogRecord = JSON.parse(content);
        const { events, ...summary } = parsed;
        summaries.push({
          ...summary,
          eventCount: events ? events.length : 0,
        });
      } catch (err) {
        console.warn(`[syncFileLogger] Error reading log file ${file}:`, err);
      }
    }

    return summaries.sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    console.error("[syncFileLogger] Failed to list sync logs:", err);
    return [];
  }
}

/**
 * Returns full log record by ID.
 */
export function getSyncLogById(id: string): SyncFileLogRecord | null {
  try {
    ensureLogsDir();

    const safeId = path.basename(id).replace(/\.json$/, "");
    const filePath = path.join(LOGS_DIR, `${safeId}.json`);

    if (!fs.existsSync(filePath)) {
      // Try searching files
      const files = fs.readdirSync(LOGS_DIR).filter((f) => f.endsWith(".json"));
      const match = files.find((f) => f.includes(safeId));
      if (match) {
        const content = fs.readFileSync(path.join(LOGS_DIR, match), "utf-8");
        return JSON.parse(content);
      }
      return null;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error(`[syncFileLogger] Failed to read sync log ${id}:`, err);
    return null;
  }
}

/**
 * Purges all sync log files.
 */
export function clearAllSyncLogs(): boolean {
  try {
    ensureLogsDir();
    const files = fs.readdirSync(LOGS_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(LOGS_DIR, file));
      } catch (_) {}
    }
    return true;
  } catch (err) {
    console.error("[syncFileLogger] Failed to clear sync logs:", err);
    return false;
  }
}
