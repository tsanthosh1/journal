"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import { SyncFileLogSummary } from "@/lib/sync/syncFileLogger";
import { SyncLogDetailModal } from "@/components/sync/SyncLogDetailModal";
import { authFetch } from "@/lib/authFetch";
import {
  ClipboardList,
  RefreshCw,
  Trash2,
  Zap,
  Loader2,
  Clock,
  X,
  FolderOpen,
  ArrowRight,
} from "lucide-react";

export default function SyncLogsPage() {
  const { user, userId, isSignedIn } = useAuth();
  const [logs, setLogs] = useState<SyncFileLogSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Worker state
  const [workerStatus, setWorkerStatus] = useState<any>(null);
  const [isTriggeringWorker, setIsTriggeringWorker] = useState(false);

  // Detail Modal
  const [selectedLog, setSelectedLog] = useState<SyncFileLogSummary | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!isSignedIn) {
      setLogs([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const qUserId = user?.email || user?.uid || userId || "";
      const res = await authFetch(user, `/api/sync/logs?limit=100&userId=${encodeURIComponent(qUserId)}`);
      if (!res.ok) {
        throw new Error(`Failed to load sync logs (${res.status})`);
      }
      const data = await res.json();
      setLogs(data.logs || []);
      if (data.worker) {
        setWorkerStatus(data.worker);
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch logs");
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, user, userId]);

  const handleTriggerWorkerNow = async () => {
    setIsTriggeringWorker(true);
    try {
      const res = await authFetch(user, "/api/sync/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_now" }),
      });
      const data = await res.json();
      if (data.worker) {
        setWorkerStatus(data.worker);
      }
      await fetchLogs();
    } catch (err: any) {
      alert(`Failed to trigger worker: ${err.message}`);
    } finally {
      setIsTriggeringWorker(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleClearLogs = async () => {
    if (!confirm("Are you sure you want to permanently clear all stored sync log files?")) {
      return;
    }
    setIsClearing(true);
    try {
      const res = await authFetch(user, "/api/sync/logs", { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Failed to clear logs");
      }
      await fetchLogs();
    } catch (err: any) {
      alert(`Error clearing logs: ${err.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  const handleOpenLog = (log: SyncFileLogSummary) => {
    setSelectedLog(log);
    setIsModalOpen(true);
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Source filter
      if (sourceFilter !== "ALL") {
        const actionLower = log.actionName.toLowerCase();
        const logLower = log.logName.toLowerCase();
        const target = sourceFilter.toLowerCase();
        if (target === "scheduled" && !actionLower.includes("scheduled") && !logLower.includes("scheduled")) return false;
        if (target === "unified" && !actionLower.includes("unified")) return false;
        if (target === "sms" && !actionLower.includes("sms") && !logLower.includes("sms")) return false;
        if (target === "gmail" && !actionLower.includes("gmail") && !logLower.includes("gmail")) return false;
        if (target === "tneb" && !actionLower.includes("tneb") && !logLower.includes("tneb")) return false;
        if (target === "apartment" && !actionLower.includes("apartment") && !actionLower.includes("homefy")) return false;
        if (target === "water" && !actionLower.includes("water") && !actionLower.includes("cmwssb")) return false;
      }

      // Status filter
      if (statusFilter !== "ALL" && log.status !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = log.logName.toLowerCase().includes(q);
        const matchAction = log.actionName.toLowerCase().includes(q);
        const matchSummary = log.summary.toLowerCase().includes(q);
        const matchDate = log.formattedDate.toLowerCase().includes(q);
        if (!matchName && !matchAction && !matchSummary && !matchDate) {
          return false;
        }
      }

      return true;
    });
  }, [logs, sourceFilter, statusFilter, searchQuery]);

  // Statistics calculation
  const totalCount = logs.length;
  const successCount = logs.filter((l) => l.status === "SUCCESS").length;
  const warningCount = logs.filter((l) => l.status === "WARNING").length;
  const failedCount = logs.filter((l) => l.status === "FAILED").length;
  const latestTimestamp = logs.length > 0 ? logs[0].formattedDate : "None yet";

  return (
    <AuthGuard
      title="Sync Diagnostics & Logs"
      description="Private system execution traces containing synchronization details, account identifiers, and parsed communications. Sign in with your authorized Google account to access."
      icon="clipboard-list"
      badge="Private & Encrypted"
    >
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <FinanceTopBar title="Sync Logs" />

      <main className="mx-auto flex-1 w-full max-w-7xl px-4 py-6 sm:px-8 lg:px-12 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 font-bold">
                <ClipboardList className="w-4 h-4 text-cyan-400" />
              </span>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Sync Execution Logs
              </h1>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-mono font-semibold text-cyan-300">
                File Storage
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              Audit trails and execution traces for SMS Ingestion, Gmail Sync, TNEB, Apartment, and Unified runs.
            </p>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={fetchLogs}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white transition disabled:opacity-50 cursor-pointer shadow-sm"
              title="Refresh log files"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>

            {logs.length > 0 && (
              <button
                type="button"
                onClick={handleClearLogs}
                disabled={isClearing}
                className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-50 cursor-pointer"
                title="Permanently remove all log files"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isClearing ? "Clearing..." : "Clear Logs"}</span>
              </button>
            )}

            <Link
              href="/subscriptions"
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Run Sync in Hub</span>
            </Link>
          </div>
        </div>

        {/* Background Sync Worker Banner */}
        {workerStatus && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/40 via-slate-900/60 to-blue-950/40 p-3.5 sm:p-4 shadow-md backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="relative flex h-3 w-3 shrink-0">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                    workerStatus.isSyncing ? "bg-amber-400 opacity-75" : "bg-emerald-400 opacity-75"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-3 w-3 ${
                    workerStatus.isSyncing ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-bold text-white">
                    Built-in Node Background Worker
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      workerStatus.isSyncing
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                        : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    }`}
                  >
                    {workerStatus.isSyncing ? "SYNCING..." : "ACTIVE"}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span>
                    Cadence: <strong className="text-slate-200">Every {workerStatus.intervalMinutes}m</strong>
                  </span>
                  {workerStatus.nextRunAt && (
                    <span>
                      Next run:{" "}
                      <strong className="text-slate-200">
                        {new Date(workerStatus.nextRunAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </strong>
                    </span>
                  )}
                  <span>
                    Total runs: <strong className="text-slate-200">{workerStatus.totalRuns}</strong>
                  </span>
                  {workerStatus.lastRunAt && (
                    <span>
                      Last run:{" "}
                      <strong className="text-slate-200">
                        {new Date(workerStatus.lastRunAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isTriggeringWorker || workerStatus.isSyncing}
                onClick={handleTriggerWorkerNow}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 active:scale-95 transition disabled:opacity-50 cursor-pointer shadow-sm"
                title="Immediately run background sync job"
              >
                {isTriggeringWorker || workerStatus.isSyncing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                <span>{isTriggeringWorker || workerStatus.isSyncing ? "Worker Syncing..." : "Trigger Sync Now"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-3.5 sm:p-4 shadow-sm backdrop-blur-md">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Log Sessions
            </div>
            <div className="mt-1 text-xl sm:text-2xl font-black text-white font-mono">
              {totalCount}
            </div>
            <div className="mt-1 text-[11px] text-slate-400 truncate">
              Latest: {latestTimestamp}
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-3.5 sm:p-4 shadow-sm backdrop-blur-md">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Successful Syncs
            </div>
            <div className="mt-1 text-xl sm:text-2xl font-black text-emerald-400 font-mono">
              {successCount}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              {totalCount > 0 ? `${Math.round((successCount / totalCount) * 100)}% success rate` : "No sessions"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-3.5 sm:p-4 shadow-sm backdrop-blur-md">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Warnings
            </div>
            <div className="mt-1 text-xl sm:text-2xl font-black text-amber-400 font-mono">
              {warningCount}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Partial or recovered runs</div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-3.5 sm:p-4 shadow-sm backdrop-blur-md">
            <div className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
              Failed Syncs
            </div>
            <div className="mt-1 text-xl sm:text-2xl font-black text-rose-400 font-mono">
              {failedCount}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Errors requiring attention</div>
          </div>
        </div>

        {/* Filter and Search Controls */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 rounded-2xl border border-white/5 bg-slate-900/60 p-3 sm:p-4 backdrop-blur-md">
          {/* Source Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none text-xs">
            {[
              { id: "ALL", label: "All Logs" },
              { id: "scheduled", label: "Scheduled", icon: Clock },
              { id: "unified", label: "Unified" },
              { id: "sms", label: "SMS Engine" },
              { id: "gmail", label: "Gmail" },
              { id: "tneb", label: "TNEB" },
              { id: "apartment", label: "Apartment" },
              { id: "water", label: "Metro Water" },
            ].map((tab) => {
              const active = sourceFilter === tab.id;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSourceFilter(tab.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 inline-flex items-center gap-1.5 ${
                    active
                      ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                      : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {TabIcon && <TabIcon className="w-3 h-3" />}
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {/* Status Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter logs by status"
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUCCESS">Success Only</option>
              <option value="WARNING">Warnings Only</option>
              <option value="FAILED">Failed Only</option>
            </select>

            {/* Search Input */}
            <div className="relative flex-1 md:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search log name, action..."
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1.5 text-xs text-slate-500 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Logs List View */}
        <div className="space-y-3">
          {isLoading && logs.length === 0 && (
            <div className="flex h-60 flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-slate-900/30 text-slate-400">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              <span className="text-sm">Loading sync log history from disk...</span>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-300">
              <div className="font-bold">Error loading sync logs:</div>
              <div className="mt-1 text-xs">{error}</div>
              <button
                type="button"
                onClick={fetchLogs}
                className="mt-3 rounded-lg bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 transition cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !error && filteredLogs.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-slate-900/30 p-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800/80 text-2xl text-slate-400">
                <FolderOpen className="w-7 h-7 text-slate-400" />
              </div>
              <h3 className="text-base font-bold text-white">No sync logs found</h3>
              <p className="max-w-md text-xs text-slate-400">
                {logs.length === 0
                  ? "No sync logs have been recorded to file storage yet. As syncs run from SMS Scanner, Gmail, or the Unified Orchestrator, structured logs will appear here."
                  : "No logs matched your active search or category filter."}
              </p>
              {logs.length === 0 ? (
                <Link
                  href="/subscriptions"
                  className="mt-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition cursor-pointer"
                >
                  Go to Subscriptions Hub
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSourceFilter("ALL");
                    setStatusFilter("ALL");
                    setSearchQuery("");
                  }}
                  className="mt-2 text-xs text-cyan-400 underline hover:text-cyan-300 cursor-pointer"
                >
                  Reset all filters
                </button>
              )}
            </div>
          )}

          {filteredLogs.map((log) => {
            const isSuccess = log.status === "SUCCESS";
            const isFailed = log.status === "FAILED";
            const isWarning = log.status === "WARNING";

            const statusColor = isSuccess
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : isFailed
              ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
              : "bg-amber-500/10 text-amber-400 border-amber-500/30";

            return (
              <div
                key={log.id}
                onClick={() => handleOpenLog(log)}
                className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-white/5 bg-slate-900/50 p-4 sm:p-5 shadow-sm hover:border-cyan-500/40 hover:bg-slate-900/80 transition cursor-pointer backdrop-blur-md"
              >
                {/* Left details */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Status Badge */}
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusColor}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isSuccess
                            ? "bg-emerald-400"
                            : isFailed
                            ? "bg-rose-400"
                            : "bg-amber-400"
                        }`}
                      />
                      {log.status}
                    </span>

                    {/* Action Name badge */}
                    <span className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-mono font-medium text-cyan-300">
                      {log.actionName}
                    </span>

                    {/* Timestamp */}
                    <span className="text-xs text-slate-400 font-mono">
                      {log.formattedDate}
                    </span>

                    {/* Execution Duration */}
                    {log.durationMs ? (
                      <span className="text-[11px] text-slate-500 font-mono">
                        {(log.durationMs / 1000).toFixed(2)}s
                      </span>
                    ) : null}

                    {/* Event Count badge */}
                    <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400 font-mono">
                      {log.eventCount} trace events
                    </span>
                  </div>

                  {/* Log Name */}
                  <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-cyan-200 transition truncate">
                    {log.logName}
                  </h3>

                  {/* Summary preview */}
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {log.summary}
                  </p>
                </div>

                {/* Right CTA */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <span className="flex items-center gap-1 rounded-xl border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-cyan-300 group-hover:bg-cyan-500 group-hover:text-slate-950 transition">
                    <span>Inspect Log</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Full Log Detail Popup Modal */}
      <SyncLogDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        logSummary={selectedLog}
      />
    </div>
    </AuthGuard>
  );
}
