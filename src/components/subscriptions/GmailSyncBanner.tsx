"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Mail, MessageSquare, Clock, RefreshCw, ClipboardList, X } from "lucide-react";

interface GmailSyncBannerProps {
  isConnected: boolean;
  userEmail?: string | null;
  lastSyncAt?: string;
  onTriggerSync: () => Promise<void>;
  onTriggerHistoricalSync?: () => Promise<void>;
  onTriggerSmsSync?: () => Promise<void>;
  onConnect: () => void;
  onDisconnect: () => Promise<void>;
  isSyncing: boolean;
  isHistoricalSyncing?: boolean;
  isSmsSyncing?: boolean;
  syncSummary?: string | null;
  isLoading?: boolean;
}

export function GmailSyncBanner({
  isConnected,
  userEmail,
  lastSyncAt,
  onTriggerSync,
  onTriggerHistoricalSync,
  onTriggerSmsSync,
  onConnect,
  onDisconnect,
  isSyncing,
  isHistoricalSyncing = false,
  isSmsSyncing = false,
  syncSummary,
  isLoading = false,
}: GmailSyncBannerProps) {
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);

  if (isLoading) {
    return (
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/5 bg-slate-900/60 p-4 sm:p-5 shadow-xl backdrop-blur-md animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5">
          <div className="flex items-center gap-3 sm:gap-3.5">
            <div className="h-9 w-9 sm:h-11 sm:w-11 rounded-xl sm:rounded-2xl bg-slate-800/80 shrink-0" />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-36 rounded bg-slate-800/90" />
                <div className="h-3 w-16 rounded-full bg-slate-800/60" />
              </div>
              <div className="h-3 w-56 rounded bg-slate-800/50" />
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="h-9 w-24 rounded-xl bg-slate-800/70" />
            <div className="h-9 w-28 rounded-xl bg-slate-800/70" />
          </div>
        </div>
      </div>
    );
  }

  const formattedLastSync = lastSyncAt
    ? new Date(lastSyncAt).toLocaleString("en-IN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Never";

  return (
    <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-r from-slate-900/95 via-indigo-950/40 to-slate-900/95 p-4 sm:p-5 shadow-xl backdrop-blur-md">
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Status and Email */}
        <div className="flex items-start sm:items-center gap-3 sm:gap-3.5">
          <div
            className={`flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl border ${
              isConnected
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-slate-700 bg-slate-800/80 text-slate-400"
            }`}
          >
            <Mail className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-xs sm:text-sm font-semibold text-white">
                {isConnected ? "Gmail & SMS Sync Engine" : "Automated Sync Engine"}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.2 text-[9px] sm:text-[10px] font-medium ${
                  isConnected
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-amber-500/20 text-amber-300"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isConnected ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                {isConnected ? "Connected" : "Not Linked"}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] sm:text-xs text-slate-400 truncate">
              {isConnected
                ? `Account: ${userEmail || "Google"} • Last Sync: ${formattedLastSync}`
                : "Connect your Google account to automatically scan statements, payment receipts, and SMS loan debits."}
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto justify-end">
          {onTriggerSmsSync && (
            <button
              type="button"
              disabled={isSmsSyncing || isSyncing}
              onClick={onTriggerSmsSync}
              className="min-h-[38px] flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 hover:text-white disabled:opacity-50 transition cursor-pointer"
              title="Process and reconcile stored Android SMS messages"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{isSmsSyncing ? "Reconciling..." : "Sync SMS"}</span>
            </button>
          )}

          {isConnected ? (
            <>
              {onTriggerHistoricalSync && (
                <button
                  type="button"
                  disabled={isSyncing || isHistoricalSyncing}
                  onClick={onTriggerHistoricalSync}
                  className="min-h-[38px] flex items-center justify-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 hover:text-white disabled:opacity-50 transition cursor-pointer"
                  title="Scan multiple past months for all subscriptions"
                >
                  <Clock className={`h-3.5 w-3.5 ${isHistoricalSyncing ? "animate-spin" : ""}`} />
                  <span>{isHistoricalSyncing ? "Backfilling..." : "Backfill Past Cycles"}</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSyncing || isHistoricalSyncing}
                onClick={onTriggerSync}
                className="min-h-[38px] flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-1.5 text-xs font-bold text-slate-950 shadow-lg hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 transition cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                <span>{isSyncing ? "Syncing..." : "Sync Gmail"}</span>
              </button>

              <Link
                href="/sync/logs"
                className="min-h-[38px] flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700/80 hover:text-white transition"
                title="View file storage audit logs of all past sync sessions"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Sync Logs</span>
              </Link>

              {showConfirmDisconnect ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onDisconnect}
                    className="min-h-[38px] rounded-lg bg-rose-500/20 px-2.5 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/30"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirmDisconnect(false)}
                    className="min-h-[38px] rounded-lg bg-white/5 px-2 py-1 text-[11px] text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowConfirmDisconnect(true)}
                  className="min-h-[38px] rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
                  title="Disconnect Google Account"
                >
                  Disconnect
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onConnect}
              className="w-full sm:w-auto min-h-[38px] flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-400/20 hover:bg-cyan-300 transition cursor-pointer"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.24 10.285V13.8h6.887C18.2 16.5 15.64 18.5 12.24 18.5c-3.6 0-6.5-2.9-6.5-6.5s2.9-6.5 6.5-6.5c1.64 0 3.12.61 4.28 1.62l2.67-2.67C17.5 2.8 15.04 2 12.24 2 6.7 2 2.2 6.5 2.2 12s4.5 10 10.04 10c5.78 0 9.6-4.06 9.6-9.78 0-.66-.07-1.3-.2-1.935H12.24z" />
              </svg>
              Sign in with Google
            </button>
          )}
        </div>
      </div>

      {syncSummary && (
        <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-2.5 text-xs text-cyan-200">
          {syncSummary}
        </div>
      )}
    </div>
  );
}
