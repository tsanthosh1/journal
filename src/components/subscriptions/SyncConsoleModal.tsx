"use client";

import React, { useState, useEffect, useRef } from "react";
import { SyncLogEvent, SyncLogLevel } from "@/lib/gmail/syncLogger";
import { Subscription } from "@/lib/subscriptionTypes";

export interface SyncConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  initialSubscription?: Subscription | null;
  initialMode?: "current" | "historical";
  onSyncComplete?: () => void;
}

export function SyncConsoleModal({
  isOpen,
  onClose,
  userId = "default_user",
  initialSubscription,
  initialMode = "current",
  onSyncComplete,
}: SyncConsoleModalProps) {
  const [logs, setLogs] = useState<SyncLogEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "query" | "parse" | "save" | "warn-error">("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [completionData, setCompletionData] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const [selectedSub, setSelectedSub] = useState<Subscription | null>(initialSubscription || null);
  const [syncMode, setSyncMode] = useState<"current" | "historical">(initialMode);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSelectedSub(initialSubscription || null);
    setSyncMode(initialMode);
  }, [initialSubscription, initialMode]);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // Start sync streaming
  const startStream = async (subToSync = selectedSub, modeToSync = syncMode) => {
    if (isRunning) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsRunning(true);
    setCompletionData(null);
    setLogs((prev) => [
      ...prev,
      {
        id: `start_${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: "info",
        message: `--- Starting ${modeToSync === "historical" ? "Deep Historical Scan" : "Active Cycle Sync"} ${
          subToSync ? `for ${subToSync.name}` : "for all subscriptions"
        } ---`,
      },
    ]);

    try {
      const response = await fetch("/api/sync/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          subscriptionId: subToSync?.id,
          mode: modeToSync,
          maxStatements: modeToSync === "historical" ? 50 : 15,
        }),
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Failed to establish stream connection (${response.status}: ${response.statusText})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          const trimmed = block.trim();
          if (trimmed.startsWith("data: ")) {
            const rawJson = trimmed.replace(/^data:\s*/, "");
            try {
              const event = JSON.parse(rawJson);
              if (event.type === "done") {
                setCompletionData(event.data);
              } else {
                setLogs((prev) => [...prev, event]);
              }
            } catch {
              // Ignore partial chunk
            }
          }
        }
      }

      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setLogs((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            timestamp: new Date().toISOString(),
            level: "error",
            message: `Stream Error: ${err.message || "Failed during live sync"}`,
          },
        ]);
      }
    } finally {
      setIsRunning(false);
    }
  };

  // Auto trigger stream on initial open if empty
  useEffect(() => {
    if (isOpen && logs.length === 0 && !isRunning) {
      startStream(initialSubscription || null, initialMode);
    }
  }, [isOpen]);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
    setLogs((prev) => [
      ...prev,
      {
        id: `stop_${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: "warn",
        message: "⚠️ Sync stream cancelled by user.",
      },
    ]);
  };

  const handleCopyLogs = () => {
    const text = logs
      .map(
        (l) =>
          `[${l.timestamp.slice(11, 23)}] [${l.level.toUpperCase()}] ${
            l.subscriptionName ? `[${l.subscriptionName}] ` : ""
          }${l.message}${l.details ? `\n  Data: ${JSON.stringify(l.details)}` : ""}`,
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (activeTab === "query" && log.level !== "query") return false;
    if (activeTab === "parse" && log.level !== "parse") return false;
    if (activeTab === "save" && log.level !== "save") return false;
    if (activeTab === "warn-error" && log.level !== "warn" && log.level !== "error") return false;

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      const matchMsg = log.message.toLowerCase().includes(q);
      const matchSub = log.subscriptionName?.toLowerCase().includes(q);
      const matchDetails = log.details ? JSON.stringify(log.details).toLowerCase().includes(q) : false;
      return matchMsg || matchSub || matchDetails;
    }
    return true;
  });

  const countErrors = logs.filter((l) => l.level === "error" || l.level === "warn").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-xl animate-fade-in font-sans">
      <div className="relative flex flex-col w-full max-w-5xl h-[90vh] max-h-[850px] rounded-3xl border border-white/15 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-lg shadow-inner">
              ⚡
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight truncate">
                  Live Gmail & SMS Sync Console
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    isRunning
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse"
                      : completionData
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-slate-800 text-slate-300 border border-white/10"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isRunning ? "bg-cyan-400 animate-ping" : completionData ? "bg-emerald-400" : "bg-slate-400"
                    }`}
                  />
                  {isRunning ? "Streaming Logs..." : completionData ? "Sync Completed" : "Idle"}
                </span>
                {selectedSub && (
                  <span className="rounded-lg bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-bold text-indigo-300 truncate max-w-[160px]">
                    {selectedSub.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                Real-time visibility into Gmail queries, decoded message payloads, parser regex extractions, and Firestore ledger commits.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isRunning ? (
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/15 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/25 transition cursor-pointer"
              >
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startStream(selectedSub, syncMode)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-indigo-400 active:scale-95 transition cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Re-run Stream</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Action & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 border-b border-white/10 bg-slate-900/40 text-xs shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`rounded-xl px-3 py-1 font-semibold transition cursor-pointer ${
                activeTab === "all"
                  ? "bg-white/15 text-white border border-white/20"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              All ({logs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("query")}
              className={`rounded-xl px-3 py-1 font-semibold transition cursor-pointer ${
                activeTab === "query"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              🔍 Queries ({logs.filter((l) => l.level === "query").length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("parse")}
              className={`rounded-xl px-3 py-1 font-semibold transition cursor-pointer ${
                activeTab === "parse"
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              🧠 Parsed ({logs.filter((l) => l.level === "parse").length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("save")}
              className={`rounded-xl px-3 py-1 font-semibold transition cursor-pointer ${
                activeTab === "save"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              💾 Saved ({logs.filter((l) => l.level === "save").length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("warn-error")}
              className={`rounded-xl px-3 py-1 font-semibold transition cursor-pointer ${
                activeTab === "warn-error"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              ⚠️ Warnings ({countErrors})
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search console..."
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-36 sm:w-48"
            />

            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`rounded-xl border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                autoScroll
                  ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >
              Auto-scroll {autoScroll ? "ON" : "OFF"}
            </button>

            <button
              type="button"
              onClick={handleCopyLogs}
              className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer"
            >
              {copied ? "✅ Copied!" : "📋 Copy"}
            </button>

            <button
              type="button"
              onClick={() => {
                setLogs([]);
                setCompletionData(null);
              }}
              className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:bg-white/10 hover:text-rose-300 transition cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Live Terminal Log Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-950 font-mono text-[12px] leading-relaxed select-text space-y-1.5 custom-scrollbar">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 py-12 text-center">
              <span className="text-3xl mb-2">⚡</span>
              <p className="font-sans font-medium text-sm">No log entries matching your current filter.</p>
              <p className="font-sans text-xs text-slate-600 mt-1">
                Click &quot;Re-run Stream&quot; above to trigger live execution.
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const timeStr = log.timestamp ? log.timestamp.slice(11, 23) : "00:00:00.000";

              const badgeColor = {
                info: "text-slate-400 bg-slate-800/80 border-slate-700",
                query: "text-cyan-300 bg-cyan-950/60 border-cyan-800",
                fetch: "text-sky-300 bg-sky-950/60 border-sky-800",
                parse: "text-purple-300 bg-purple-950/60 border-purple-800",
                match: "text-amber-300 bg-amber-950/60 border-amber-800",
                save: "text-emerald-300 bg-emerald-950/60 border-emerald-800",
                warn: "text-amber-400 bg-amber-950/80 border-amber-600",
                error: "text-rose-300 bg-rose-950/80 border-rose-700",
                success: "text-emerald-400 bg-emerald-950/80 border-emerald-600",
              }[log.level] || "text-slate-300 bg-slate-800 border-slate-700";

              const textColor = {
                info: "text-slate-300",
                query: "text-cyan-200",
                fetch: "text-sky-200",
                parse: "text-purple-200",
                match: "text-amber-200 font-semibold",
                save: "text-emerald-300",
                warn: "text-amber-300 font-semibold",
                error: "text-rose-300 font-bold",
                success: "text-emerald-300 font-bold",
              }[log.level] || "text-slate-300";

              return (
                <div
                  key={log.id}
                  className={`group rounded-xl p-1.5 sm:px-2.5 sm:py-1.5 transition ${
                    isExpanded ? "bg-white/10 border border-white/15" : "hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-start gap-2 flex-wrap sm:flex-nowrap">
                    <span className="text-slate-600 shrink-0 select-none text-[11px] pt-0.5">
                      {timeStr}
                    </span>

                    <span
                      className={`inline-flex shrink-0 items-center justify-center rounded-md border px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider ${badgeColor}`}
                    >
                      {log.level}
                    </span>

                    {log.subscriptionName && (
                      <span className="rounded bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.2 text-[10px] font-bold text-indigo-300 shrink-0">
                        {log.subscriptionName}
                      </span>
                    )}

                    <div className={`flex-1 min-w-0 break-words ${textColor}`}>
                      {log.message}
                    </div>

                    {log.details && (
                      <button
                        type="button"
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="shrink-0 text-[11px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer select-none ml-auto"
                      >
                        {isExpanded ? "▲ Hide JSON" : "▼ Inspect JSON"}
                      </button>
                    )}
                  </div>

                  {/* Expanded JSON Details */}
                  {isExpanded && log.details && (
                    <div className="mt-2.5 rounded-xl border border-white/10 bg-slate-900/90 p-3 text-[11px] text-slate-300 overflow-x-auto shadow-inner">
                      <pre className="text-cyan-300">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* Footer Summary Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 bg-slate-900/90 text-xs shrink-0">
          <div className="flex items-center gap-4 text-slate-400 flex-wrap">
            <span>
              Total Events: <strong className="text-white">{logs.length}</strong>
            </span>
            <span>•</span>
            <span>
              Queries Run:{" "}
              <strong className="text-cyan-300">
                {logs.filter((l) => l.level === "query").length}
              </strong>
            </span>
            <span>•</span>
            <span>
              Parsed Elements:{" "}
              <strong className="text-purple-300">
                {logs.filter((l) => l.level === "parse").length}
              </strong>
            </span>
            {countErrors > 0 && (
              <>
                <span>•</span>
                <span className="text-amber-400">
                  Warnings/Errors: <strong>{countErrors}</strong>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/10 px-4 py-1.5 font-semibold text-white hover:bg-white/15 transition cursor-pointer"
            >
              Done & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
