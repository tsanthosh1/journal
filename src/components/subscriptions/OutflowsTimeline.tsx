"use client";

import React from "react";
import { Subscription } from "@/lib/subscriptionTypes";

interface OutflowsTimelineProps {
  subscriptions: Subscription[];
  onOpenOverride: (sub: Subscription) => void;
}

export function OutflowsTimeline({
  subscriptions,
  onOpenOverride,
}: OutflowsTimelineProps) {
  const activeSubs = subscriptions
    .filter(
      (s) =>
        s.currentCycle.status !== "ARCHIVED" &&
        s.currentCycle.status !== "PAUSED",
    )
    .sort((a, b) => {
      const dateA = a.currentCycle.dueDate || "9999-99-99";
      const dateB = b.currentCycle.dueDate || "9999-99-99";
      return dateA.localeCompare(dateB);
    });

  if (activeSubs.length === 0) {
    return (
      <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-slate-900/60 p-8 sm:p-12 text-center backdrop-blur-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="mt-3 text-base font-semibold text-white">No active commitments scheduled</h3>
        <p className="mt-1 text-xs text-slate-400">All statement and fixed deductions will appear in chronological timeline order.</p>
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-slate-900/75 p-4 sm:p-6 lg:p-8 shadow-2xl backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4 gap-2">
        <div>
          <h2 className="text-base sm:text-lg lg:text-xl font-bold text-white tracking-tight">Outflows Timeline</h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Chronological roadmap of fixed commitments and credit card deadlines
          </p>
        </div>
        <span className="self-start sm:self-auto rounded-full bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 text-xs font-semibold text-cyan-300">
          {activeSubs.length} Scheduled
        </span>
      </div>

      <div className="mt-6 sm:mt-8 flow-root">
        <ul className="-mb-8">
          {activeSubs.map((sub, idx) => {
            const cycle = sub.currentCycle;
            const dueDate = cycle.dueDate ? new Date(cycle.dueDate) : null;
            let daysDiff = 999;
            if (dueDate) {
              dueDate.setHours(0, 0, 0, 0);
              daysDiff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            }

            const isPaid = cycle.status === "FULLY_PAID";
            const isPartiallyPaid = cycle.status === "PARTIALLY_PAID";
            const isReview = cycle.status === "MISMATCH_REVIEW";
            const isOverdue = !isPaid && daysDiff < 0;
            const isDueSoon = !isPaid && daysDiff >= 0 && daysDiff <= 3;

            let badgeBg = "bg-slate-800 text-slate-300 border-slate-700";
            let statusText = "Unpaid";
            if (isPaid) {
              badgeBg = "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
              statusText = "Fully Paid";
            } else if (isPartiallyPaid) {
              badgeBg = "bg-sky-500/10 text-sky-300 border-sky-500/30";
              statusText = `Partial (Paid ₹${cycle.paidAmount})`;
            } else if (isReview) {
              badgeBg = "bg-amber-500/10 text-amber-300 border-amber-500/30";
              statusText = "Review Needed";
            } else if (isOverdue) {
              badgeBg = "bg-rose-500/10 text-rose-300 border-rose-500/30";
              statusText = `Overdue ${Math.abs(daysDiff)}d`;
            } else if (isDueSoon) {
              badgeBg = "bg-amber-500/10 text-amber-300 border-amber-500/30";
              statusText = daysDiff === 0 ? "Due Today" : `Due in ${daysDiff}d`;
            }

            const total = cycle.statementTotal > 0 ? cycle.statementTotal : sub.defaultAmount;
            const paid = cycle.paidAmount || 0;
            const remaining = cycle.remainingBalance || Math.max(0, total - paid);
            const percentPaid = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 100;

            return (
              <li key={sub.id}>
                <div className="relative pb-6 sm:pb-8">
                  {idx !== activeSubs.length - 1 && (
                    <span
                      className="absolute left-4 sm:left-5 top-5 -ml-px h-full w-0.5 bg-gradient-to-b from-white/20 via-white/10 to-transparent"
                      aria-hidden="true"
                    />
                  )}
                  <div className="relative flex items-start space-x-3 sm:space-x-4">
                    {/* Date circle icon with day & month */}
                    <div
                      className={`flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl border transition shadow-md ${
                        isPaid
                          ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                          : isOverdue
                          ? "border-rose-500/40 bg-rose-500/20 text-rose-300 animate-bounce"
                          : isDueSoon
                          ? "border-amber-500/40 bg-amber-500/20 text-amber-300"
                          : "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                      }`}
                    >
                      <span className="text-xs sm:text-sm font-extrabold tracking-tight">
                        {cycle.dueDate ? cycle.dueDate.slice(8, 10) : "--"}
                      </span>
                    </div>

                    {/* Timeline Item Card */}
                    <div className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 hover:border-cyan-500/30 hover:bg-white/[0.04] transition-all">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <span className="font-bold text-sm sm:text-base text-white">{sub.name}</span>
                            <span className="rounded-md bg-white/5 border border-white/5 px-2 py-0.5 text-[10px] sm:text-xs text-slate-300">
                              {sub.category}
                            </span>
                            {sub.source === "EMAIL_AUTOMATED" && (
                              <span className="flex items-center gap-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 text-[10px] sm:text-xs text-indigo-300">
                                Gmail Sync
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-400">
                            Due on {cycle.dueDate || "N/A"} • Frequency: {sub.billingCycle}
                            {cycle.statementDate ? ` (Statement Date: ${cycle.statementDate})` : ""}
                          </p>
                        </div>

                        {/* Amount display */}
                        <div className="flex items-baseline justify-between md:block md:text-right pt-2 md:pt-0 border-t md:border-t-0 border-white/5">
                          <div className="text-base sm:text-lg font-extrabold text-white">
                            ₹{total.toLocaleString("en-IN")}
                          </div>
                          {remaining > 0 && !isPaid && (
                            <div className="text-xs font-semibold text-amber-300">
                              ₹{remaining.toLocaleString("en-IN")} remaining
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Desktop Progress Bar */}
                      <div className="hidden sm:block mt-3">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full transition-all duration-500 rounded-full ${
                              isPaid ? "bg-emerald-400" : "bg-gradient-to-r from-cyan-500 to-indigo-400"
                            }`}
                            style={{ width: `${percentPaid}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-3.5 flex items-center justify-between pt-2.5 border-t border-white/5 gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badgeBg}`}>
                          {statusText}
                        </span>

                        <button
                          type="button"
                          onClick={() => onOpenOverride(sub)}
                          className="min-h-[32px] rounded-xl border border-white/10 bg-white/5 px-3.5 py-1 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition active:scale-95 cursor-pointer"
                        >
                          Manual Override
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
