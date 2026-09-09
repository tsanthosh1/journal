"use client";

import React, { useState, useEffect, useMemo } from "react";
import { SyncFileLogRecord, SyncLogDetailEvent, SyncFileLogSummary } from "@/lib/sync/syncFileLogger";
import { useAuth } from "@/context/AuthContext";

interface SyncLogDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  logSummary: SyncFileLogSummary | null;
}

export function SyncLogDetailModal({
  isOpen,
  onClose,
  logSummary,
}: SyncLogDetailModalProps) {
  const { user, userId } = useAuth();
  const [fullRecord, setFullRecord] = useState<SyncFileLogRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIndices, setExpandedIndices] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState(false);

  // Fetch full log when modal opens or logSummary changes
  useEffect(() => {
    if (!isOpen || !logSummary) {
      setFullRecord(null);
      setError(null);
      setSearchQuery("");
      setLevelFilter("ALL");
      setExpandedIndices({});
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    const qUserId = user?.email || user?.uid || userId || "";
    fetch(`/api/sync/logs/${encodeURIComponent(logSummary.id)}?userId=${encodeURIComponent(qUserId)}`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to fetch log (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setFullRecord(data.log);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "Failed to load log content");
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, logSummary]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const toggleExpand = (idx: number) => {
    setExpandedIndices((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleCopyJson = () => {
    if (!fullRecord) return;
    navigator.clipboard.writeText(JSON.stringify(fullRecord, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    if (!fullRecord) return;
    const blob = new Blob([JSON.stringify(fullRecord, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fullRecord.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filtered events
  const filteredEvents = useMemo(() => {
    if (!fullRecord?.events) return [];
    return fullRecord.events.filter((evt) => {
      const matchLevel =
        levelFilter === "ALL" ||
        evt.level.toUpperCase() === levelFilter.toUpperCase() ||
        (levelFilter === "ERROR_WARN" && (evt.level === "error" || evt.level === "warn"));

      const matchQuery =
        !searchQuery.trim() ||
        evt.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (evt.details && JSON.stringify(evt.details).toLowerCase().includes(searchQuery.toLowerCase()));

      return matchLevel && matchQuery;
    });
  }, [fullRecord, levelFilter, searchQuery]);

  if (!isOpen || !logSummary) return null;

  const status = fullRecord?.status || logSummary.status;
  const isSuccess = status === "SUCCESS";
  const isFailed = status === "FAILED";
  const isWarning = status === "WARNING";

  const statusBadgeClass = isSuccess
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
    : isFailed
    ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
    : "bg-amber-500/10 text-amber-400 border-amber-500/30";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-white/10 bg-slate-950 text-slate-100 shadow-2xl shadow-cyan-950/20 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-white/10 bg-slate-900/80 px-5 py-4 backdrop-blur-md">
          <div className="space-y-1 pr-4 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusBadgeClass}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isSuccess ? "bg-emerald-400" : isFailed ? "bg-rose-400" : "bg-amber-400"
                  }`}
                />
                {status}
              </span>
              <span className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-mono font-medium text-cyan-300">
                {logSummary.actionName}
              </span>
              <span className="text-xs text-slate-400">
                {logSummary.formattedDate}
              </span>
              {logSummary.durationMs ? (
                <span className="text-xs text-slate-500 font-mono">
                  {(logSummary.durationMs / 1000).toFixed(2)}s
                </span>
              ) : null}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
              {logSummary.logName}
            </h2>
            <p className="text-xs text-slate-400 line-clamp-2">
              {fullRecord?.summary || logSummary.summary}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyJson}
              disabled={!fullRecord}
              className="hidden sm:flex items-center gap-1 rounded-xl border border-white/10 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700/80 hover:text-white transition disabled:opacity-40 cursor-pointer"
              title="Copy log JSON to clipboard"
            >
              {copied ? (
                <>
                  <span className="text-emerald-400">✓</span> Copied
                </>
              ) : (
                <>
                  <span>📋</span> Copy JSON
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadJson}
              disabled={!fullRecord}
              className="hidden sm:flex items-center gap-1 rounded-xl border border-white/10 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700/80 hover:text-white transition disabled:opacity-40 cursor-pointer"
              title="Download log JSON file"
            >
              <span>💾</span> Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-slate-800/60 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Stats & Quick Summary Banner (if stats exist) */}
        {fullRecord?.stats && Object.keys(fullRecord.stats).length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-white/5 bg-slate-900/40 px-5 py-2.5 text-xs text-slate-300">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Stats:
            </span>
            {Object.entries(fullRecord.stats).map(([k, v]) => {
              if (v === undefined || v === null || typeof v === "object") return null;
              return (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono"
                >
                  <span className="text-slate-400">{k}:</span>
                  <span className="font-bold text-cyan-300">{String(v)}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Controls Toolbar: Search & Level Filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-b border-white/10 bg-slate-900/60 px-5 py-2.5">
          {/* Level Filter Chips */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
            {["ALL", "INFO", "SUCCESS", "WARN", "ERROR"].map((lvl) => {
              const active = levelFilter === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevelFilter(lvl)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer shrink-0 ${
                    active
                      ? "bg-cyan-500 text-slate-950 shadow-sm"
                      : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {lvl}
                </button>
              );
            })}
          </div>

          {/* Search Bar */}
          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search trace events & payloads..."
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1.5 text-xs text-slate-500 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Content Body: Events Trace Console */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 font-mono text-xs space-y-1.5 bg-slate-950/90 selection:bg-cyan-500/30">
          {isLoading && (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              <span className="text-xs">Loading log trace from storage...</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300">
              <div className="font-bold">Error reading log:</div>
              <div className="mt-1 text-xs">{error}</div>
            </div>
          )}

          {!isLoading && !error && filteredEvents.length === 0 && (
            <div className="flex h-40 flex-col items-center justify-center text-center text-slate-500">
              <span>No trace events match the current filter.</span>
              {fullRecord?.events && fullRecord.events.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setLevelFilter("ALL");
                    setSearchQuery("");
                  }}
                  className="mt-2 text-xs text-cyan-400 underline hover:text-cyan-300 cursor-pointer"
                >
                  Reset filters ({fullRecord.events.length} total events)
                </button>
              )}
            </div>
          )}

          {!isLoading &&
            !error &&
            filteredEvents.map((evt, idx) => {
              const lvl = evt.level.toLowerCase();
              let badgeColor = "bg-slate-800 text-slate-300 border-slate-700";
              let msgColor = "text-slate-200";

              if (lvl === "success") {
                badgeColor = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
                msgColor = "text-emerald-200";
              } else if (lvl === "error") {
                badgeColor = "bg-rose-500/20 text-rose-300 border-rose-500/30";
                msgColor = "text-rose-200";
              } else if (lvl === "warn") {
                badgeColor = "bg-amber-500/20 text-amber-300 border-amber-500/30";
                msgColor = "text-amber-200";
              } else if (lvl === "query" || lvl === "fetch") {
                badgeColor = "bg-purple-500/20 text-purple-300 border-purple-500/30";
                msgColor = "text-purple-200";
              } else if (lvl === "parse") {
                badgeColor = "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
                msgColor = "text-cyan-200";
              } else if (lvl === "save") {
                badgeColor = "bg-blue-500/20 text-blue-300 border-blue-500/30";
                msgColor = "text-blue-200";
              }

              const isExpanded = !!expandedIndices[idx];
              const hasDetails = evt.details && Object.keys(evt.details).length > 0;

              // Format short timestamp
              const shortTime = evt.timestamp
                ? new Date(evt.timestamp).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })
                : "";

              return (
                <div
                  key={idx}
                  className="group rounded-lg border border-white/[0.04] bg-slate-900/40 p-2 hover:bg-slate-900/80 hover:border-white/10 transition"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-[10px] text-slate-500 shrink-0 w-8 select-none text-right">
                      {idx + 1}
                    </span>
                    <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                      {shortTime}
                    </span>
                    <span
                      className={`inline-flex items-center rounded border px-1.5 py-0.2 text-[9px] font-bold uppercase shrink-0 ${badgeColor}`}
                    >
                      {evt.level}
                    </span>
                    <div className={`flex-1 break-words leading-relaxed ${msgColor}`}>
                      {evt.message}
                    </div>
                    {hasDetails && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(idx)}
                        className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-white/10 hover:text-white transition shrink-0 cursor-pointer"
                      >
                        {isExpanded ? "Hide data" : "Details"}
                      </button>
                    )}
                  </div>

                  {/* Expanded JSON Details */}
                  {hasDetails && isExpanded && (
                    <div className="mt-2 ml-10 rounded-lg border border-white/10 bg-black/60 p-2.5 text-[11px] text-cyan-200/90 overflow-x-auto">
                      <pre>{JSON.stringify(evt.details, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-white/10 bg-slate-900/80 px-5 py-3 text-xs text-slate-400 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span>
              Showing <strong className="text-white">{filteredEvents.length}</strong> of{" "}
              <strong className="text-white">{fullRecord?.events?.length || logSummary.eventCount}</strong> events
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-[11px] font-mono text-slate-500 truncate max-w-xs">
              File: {logSummary.fileName || `${logSummary.id}.json`}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-slate-800/80 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700/80 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
