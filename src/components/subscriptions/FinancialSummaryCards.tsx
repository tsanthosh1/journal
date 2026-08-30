"use client";

import React from "react";
import { Subscription } from "@/lib/subscriptionTypes";

interface FinancialSummaryCardsProps {
  subscriptions: Subscription[];
}

export function FinancialSummaryCards({ subscriptions }: FinancialSummaryCardsProps) {
  const activeSubs = subscriptions.filter(
    (s) => s.currentCycle.status !== "ARCHIVED" && s.currentCycle.status !== "PAUSED",
  );

  let monthlyBurnRate = 0;
  let totalRemainingOutflow = 0;
  let totalPaidThisMonth = 0;
  let urgentCount = 0;
  let mismatchCount = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  activeSubs.forEach((sub) => {
    const cycle = sub.currentCycle;
    const amount = cycle.statementTotal > 0 ? cycle.statementTotal : sub.defaultAmount || 0;

    let monthlyEquivalent = amount;
    if (sub.billingCycle === "ANNUAL" || (sub.billingCycle as string) === "YEARLY") monthlyEquivalent = amount / 12;
    else if (sub.billingCycle === "HALF_YEARLY") monthlyEquivalent = amount / 6;
    else if (sub.billingCycle === "QUARTERLY") monthlyEquivalent = amount / 3;
    else if ((sub.billingCycle as string) === "WEEKLY") monthlyEquivalent = amount * 4.33;

    monthlyBurnRate += monthlyEquivalent;
    totalRemainingOutflow += cycle.remainingBalance || 0;
    totalPaidThisMonth += cycle.paidAmount || 0;

    if (cycle.status === "MISMATCH_REVIEW") {
      mismatchCount++;
    }

    if (cycle.dueDate && cycle.remainingBalance > 0 && cycle.status !== "FULLY_PAID") {
      const due = new Date(cycle.dueDate);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= -1 && diffDays <= 7) {
        urgentCount++;
      }
    }
  });

  const projectedAnnualSpend = monthlyBurnRate * 12;
  const totalCommitment = totalPaidThisMonth + totalRemainingOutflow;
  const progressPercent =
    totalCommitment > 0 ? Math.min(100, Math.round((totalPaidThisMonth / totalCommitment) * 100)) : 100;

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
      {/* 1. Monthly Burn Rate */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/70 to-cyan-950/30 p-4.5 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-cyan-300">
            Monthly Burn Rate
          </span>
          <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        </div>
        <div className="mt-3 sm:mt-4 flex items-baseline gap-2">
          <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            ₹{monthlyBurnRate.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
          <span className="text-xs text-slate-400">/ mo</span>
        </div>
        <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-400">
          Annual: <span className="text-slate-200 font-medium">₹{projectedAnnualSpend.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
        </p>
      </div>

      {/* 2. Pending Outflows */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/70 to-amber-950/30 p-4.5 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-amber-300">
            Pending Outflows
          </span>
          <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <div className="mt-3 sm:mt-4 flex items-baseline gap-2">
          <span className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-400">
            ₹{totalRemainingOutflow.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
          <span className="text-xs text-slate-400">to clear</span>
        </div>
        <div className="mt-2.5 sm:mt-3">
          <div className="flex justify-between text-[11px] sm:text-xs text-slate-400 mb-1">
            <span>Paid: ₹{totalPaidThisMonth.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. Due in ≤ 7 Days */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/70 to-rose-950/30 p-4.5 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-rose-300">
            Due in ≤ 7 Days
          </span>
          <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>
        <div className="mt-3 sm:mt-4 flex items-baseline gap-2">
          <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {urgentCount}
          </span>
          <span className="text-xs text-slate-400">bill{urgentCount !== 1 ? "s" : ""} pending</span>
        </div>
        <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-400">
          {urgentCount === 0 ? "All immediate dues settled" : "Requires attention soon"}
        </p>
      </div>

      {/* 4. Tracked Accounts */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/70 to-indigo-950/30 p-4.5 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-indigo-300">
            Tracked Accounts
          </span>
          <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
            <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
        </div>
        <div className="mt-3 sm:mt-4 flex items-baseline gap-2">
          <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {activeSubs.length}
          </span>
          <span className="text-xs text-slate-400">active commitments</span>
        </div>
        <div className="mt-1.5 sm:mt-2 flex items-center gap-2">
          {mismatchCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] sm:text-[11px] font-medium text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              {mismatchCount} review needed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] sm:text-[11px] font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              All parsers synced
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
