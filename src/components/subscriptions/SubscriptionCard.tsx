"use client";

import React, { useState } from "react";
import {
  Subscription,
  formatCycleMonth,
  formatDisplayDate,
} from "@/lib/subscriptionTypes";
import { SubscriptionAvatar } from "./SubscriptionAvatar";

interface SubscriptionCardProps {
  subscription: Subscription;
  onEdit: (sub: Subscription) => void;
  onOverride: (sub: Subscription) => void;
  onDelete: (id: string) => void;
  onQuickMarkPaid: (sub: Subscription) => void;
  onSelect?: (sub: Subscription) => void;
  onTestParser?: (sub: Subscription) => void;
  onViewHistory?: (sub: Subscription) => void;
  onViewSourceEmail?: (sub: Subscription) => void;
}

export function SubscriptionCard({
  subscription,
  onEdit,
  onOverride,
  onDelete,
  onQuickMarkPaid,
  onSelect,
  onTestParser,
  onViewHistory,
  onViewSourceEmail,
}: SubscriptionCardProps) {
  const [copied, setCopied] = useState(false);

  const isPrepaid =
    Boolean(subscription.isPrepaid) ||
    subscription.category === "Entertainment" ||
    (!subscription.dueDayOfMonth &&
      subscription.billingType === "BILL_GENERATED" &&
      !subscription.emailConfig?.paymentQuery);

  const cycle = subscription.currentCycle;
  const isPaid = isPrepaid || cycle.status === "FULLY_PAID";
  const isPartiallyPaid = !isPrepaid && cycle.status === "PARTIALLY_PAID";
  const isReview = cycle.status === "MISMATCH_REVIEW";
  const isPaused = cycle.status === "PAUSED";

  const isFixed =
    subscription.billingType === "FIXED_TENURE" ||
    subscription.category === "Loans & EMIs";

  const total =
    cycle.statementTotal > 0
      ? cycle.statementTotal
      : isFixed
      ? subscription.defaultAmount || 0
      : 0;

  const paid = isPrepaid ? total : cycle.paidAmount || 0;
  const remaining = isPrepaid ? 0 : cycle.remainingBalance !== undefined && cycle.remainingBalance > 0 ? cycle.remainingBalance : Math.max(0, total - paid);
  const percentPaid = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : isPaid ? 100 : 0;

  const handleCopyConfig = async () => {
    const configPayload = {
      name: subscription.name,
      category: subscription.category,
      billingType: subscription.billingType,
      source: subscription.source,
      currency: subscription.currency,
      defaultAmount: subscription.defaultAmount,
      billingCycle: subscription.billingCycle,
      isPrepaid: subscription.isPrepaid,
      dueDayOfMonth: subscription.dueDayOfMonth,
      emailConfig: subscription.emailConfig
        ? {
            enabled: subscription.emailConfig.enabled,
            statementQuery: subscription.emailConfig.statementQuery,
            paymentQuery: subscription.emailConfig.paymentQuery,
            parserModule: subscription.emailConfig.parserModule,
            customRegex: subscription.emailConfig.customRegex,
          }
        : undefined,
      notes: subscription.notes,
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(configPayload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy config JSON:", err);
    }
  };

  const isFixedCommitment =
    subscription.billingType === "FIXED_TENURE" ||
    subscription.category === "Loans & EMIs";

  const isAwaitingBill =
    !isPrepaid &&
    !isPaid &&
    !isFixedCommitment &&
    (!cycle.statementTotal || cycle.statementTotal === 0);

  let statusBadge = (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-300">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Unpaid
    </span>
  );

  if (cycle.status === "SKIPPED") {
    statusBadge = (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
        ⏭️ Skipped
      </span>
    );
  } else if (isPrepaid) {
    statusBadge = (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        ⚡ Prepaid Active
      </span>
    );
  } else if (isPaid) {
    statusBadge = (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Fully Paid
      </span>
    );
  } else if (isAwaitingBill) {
    statusBadge = (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 px-2.5 py-0.5 text-xs font-medium text-slate-300">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400/80" />
        ⏳ Awaiting Bill
      </span>
    );
  } else if (isPartiallyPaid) {
    statusBadge = (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 border border-sky-500/30 px-2.5 py-0.5 text-xs font-medium text-sky-300">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
        Partial ({percentPaid}%)
      </span>
    );
  } else if (isReview) {
    statusBadge = (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-xs font-medium text-amber-300 animate-pulse">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Review Needed
      </span>
    );
  } else if (isPaused) {
    statusBadge = (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 border border-zinc-700 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
        Paused
      </span>
    );
  }

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/85 p-4 sm:p-5 lg:p-6 shadow-xl backdrop-blur-md transition-all duration-300 hover:border-cyan-500/40 hover:shadow-2xl hover:shadow-cyan-500/5 hover:-translate-y-0.5">
      <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-cyan-500/10 blur-2xl group-hover:bg-cyan-500/20 transition-all duration-500" />

      <div>
        {/* Header: Avatar, Name, Category, Source Pill, Status */}
        <div className="flex items-start justify-between gap-3.5">
          <div
            className={`flex items-center gap-3.5 min-w-0 flex-1 ${onSelect ? "cursor-pointer" : ""}`}
            onClick={() => onSelect && onSelect(subscription)}
          >
            <SubscriptionAvatar
              name={subscription.name}
              category={subscription.category}
              imageUrl={subscription.imageUrl}
              icon={subscription.icon}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight truncate group-hover:text-cyan-300 transition">
                {subscription.name}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="rounded-lg bg-white/5 border border-white/5 px-2 py-0.5 text-[11px] text-slate-300 font-medium">
                  {subscription.category}
                </span>
                <span className="rounded-lg bg-white/5 border border-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                  {subscription.billingCycle}
                </span>
                {subscription.source === "EMAIL_AUTOMATED" ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-[11px] font-medium text-indigo-300">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Auto Sync
                  </span>
                ) : (
                  <span className="rounded-lg bg-slate-800 border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">
                    Manual
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0">{statusBadge}</div>
        </div>

        {/* Warning banner for parser review */}
        {isReview && cycle.lastError && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200 flex items-start gap-2">
            <span className="text-amber-400">⚠️</span>
            <div className="min-w-0 flex-1">
              <span className="font-semibold">Parser Issue:</span> {cycle.lastError}
            </div>
          </div>
        )}

        {/* Financial Details Box: Redesigned distinctly for Prepaid vs Postpaid */}
        {isPrepaid ? (
          <div className="mt-4 sm:mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-950/15 p-3.5 sm:p-4">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-xs text-slate-400 block">Subscription Cost</span>
                <span className="text-[11px] text-emerald-300 font-medium flex items-center gap-1 mt-0.5">
                  <span>⚡</span> Settled on Invoice
                </span>
              </div>
              <span className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 0 })}
              </span>
            </div>

            <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-white/5 pt-2.5 text-xs text-slate-400">
              <div>
                <span className="text-slate-500 block text-[11px]">Invoice Date</span>
                <span className="font-medium text-slate-200">
                  {cycle.statementDate ? formatDisplayDate(cycle.statementDate) : "Synced on Invoice"}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[11px]">Billing Cycle</span>
                <span className="font-medium text-slate-200">{formatCycleMonth(cycle.cycleMonth)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 sm:mt-5 rounded-2xl border border-white/5 bg-white/[0.02] p-3.5 sm:p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-400">
                {subscription.billingType === "BILL_GENERATED" ? "Statement Total" : "Fixed Commitment"}
              </span>
              <span className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 0 })}
              </span>
            </div>

            {/* Progress bar */}
            <div className="mt-3">
              <div className="flex justify-between text-xs text-slate-400 mb-1.5 font-medium">
                <span className="text-emerald-300">Paid: ₹{paid.toLocaleString("en-IN")}</span>
                <span className={remaining > 0 ? "text-amber-300" : "text-slate-400"}>
                  Remaining: ₹{remaining.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    isPaid ? "bg-emerald-400" : "bg-gradient-to-r from-cyan-500 to-indigo-400"
                  }`}
                  style={{ width: `${percentPaid}%` }}
                />
              </div>
            </div>

            <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-white/5 pt-2.5 text-xs text-slate-400">
              <div>
                <span className="text-slate-500 block text-[11px]">
                  {subscription.isEndOfMonthDue ? "Payment Deadline" : "Due Date"}
                </span>
                <span className="font-medium text-slate-200">
                  {subscription.isEndOfMonthDue
                    ? `End of Month (${formatDisplayDate(cycle.dueDate)})`
                    : formatDisplayDate(cycle.dueDate)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[11px]">Cycle Month</span>
                <span className="font-medium text-slate-200">{formatCycleMonth(cycle.cycleMonth)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Email sync actions */}
        {subscription.source === "EMAIL_AUTOMATED" && (
          <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="text-[11px] text-slate-400 truncate max-w-[180px]">
              {isPrepaid
                ? "Prepaid Invoice Sync"
                : subscription.emailConfig?.statementQuery
                ? "Statement & Payment Sync"
                : "Payment Alerts Sync"}
            </span>
            <div className="flex items-center gap-2.5">
              {onViewSourceEmail && (
                <button
                  type="button"
                  onClick={() => onViewSourceEmail(subscription)}
                  className="text-indigo-300 hover:text-indigo-200 font-medium cursor-pointer flex items-center gap-1"
                  title="View full archived email in Storage"
                >
                  <span>✉️</span>
                  <span className="underline">Source Email</span>
                </button>
              )}
              {onTestParser && (
                <button
                  type="button"
                  onClick={() => onTestParser(subscription)}
                  className="text-cyan-400 hover:text-cyan-300 underline font-medium cursor-pointer"
                >
                  Sandbox
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Action Buttons */}
      <div className="mt-4 sm:mt-6 flex items-center justify-between border-t border-white/10 pt-3.5 sm:pt-4 gap-2">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {!isPrepaid && !isPaid && (
            <button
              type="button"
              onClick={() => onQuickMarkPaid(subscription)}
              className="min-h-[36px] rounded-xl bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition active:scale-95 cursor-pointer"
            >
              Pay Full
            </button>
          )}
          <button
            type="button"
            onClick={() => onOverride(subscription)}
            className="min-h-[36px] rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition active:scale-95 cursor-pointer"
          >
            Override
          </button>
          {onViewHistory && (
            <button
              type="button"
              onClick={() => onViewHistory(subscription)}
              className="min-h-[36px] rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/20 hover:text-white transition active:scale-95 cursor-pointer"
              title="View Historical Statement & Payment Cycles"
            >
              History 📜
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Copy Config JSON Button */}
          <button
            type="button"
            onClick={handleCopyConfig}
            className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl p-2 transition cursor-pointer ${
              copied
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-slate-400 hover:bg-white/10 hover:text-white"
            }`}
            title={copied ? "Copied JSON to Clipboard!" : "Copy Subscription Config as JSON"}
          >
            {copied ? (
              <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          {/* Edit Button */}
          <button
            type="button"
            onClick={() => onEdit(subscription)}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
            title="Edit Subscription"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>

          {/* Delete Button */}
          <button
            type="button"
            onClick={() => {
              if (confirm(`Delete subscription "${subscription.name}"?`)) {
                onDelete(subscription.id);
              }
            }}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl p-2 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition cursor-pointer"
            title="Delete Subscription"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
