"use client";

import React, { useState, useMemo } from "react";
import { Subscription, formatDisplayDate, formatCycleMonth } from "@/lib/subscriptionTypes";
import { SubscriptionAvatar } from "./SubscriptionAvatar";

interface CurrentMonthActionHubProps {
  subscriptions: Subscription[];
  onSelectSubscription: (sub: Subscription) => void;
  onQuickMarkPaid: (sub: Subscription) => Promise<void>;
  onOverride: (sub: Subscription) => void;
  onViewHistory: (sub: Subscription) => void;
}

type PriorityGroup = "OVERDUE" | "DUE_SOON" | "UPCOMING" | "AWAITING_BILL" | "SETTLED" | "SKIPPED";

interface PrioritizedItem {
  subscription: Subscription;
  group: PriorityGroup;
  daysDiff: number | null; // negative = overdue days, 0 = today, positive = days left
  displayAmount: number;
  remainingAmount: number;
  paidAmount: number;
  isAwaitingBill: boolean;
}

export function CurrentMonthActionHub({
  subscriptions,
  onSelectSubscription,
  onQuickMarkPaid,
  onOverride,
  onViewHistory,
}: CurrentMonthActionHubProps) {
  const [filter, setFilter] = useState<"ALL" | "ACTION_REQUIRED" | "OVERDUE" | "SETTLED">("ALL");
  const [isMarkingPaidId, setIsMarkingPaidId] = useState<string | null>(null);

  const todayIso = new Date().toISOString().split("T")[0];
  const currentMonthStr = todayIso.slice(0, 7);

  const { items, stats } = useMemo(() => {
    let overdueCount = 0;
    let dueSoonCount = 0;
    let upcomingCount = 0;
    let settledCount = 0;
    let totalPendingAmount = 0;
    let totalPaidAmount = 0;

    const prioritized: PrioritizedItem[] = subscriptions.map((sub) => {
      const isPrepaid =
        Boolean(sub.isPrepaid) ||
        sub.category === "Entertainment" ||
        (!sub.dueDayOfMonth &&
          sub.billingType === "BILL_GENERATED" &&
          !sub.emailConfig?.paymentQuery);

      const cycle = sub.currentCycle;
      const isFixed = sub.billingType === "FIXED_TENURE" || sub.category === "Loans & EMIs";
      const hasStatementTotal = cycle.statementTotal !== undefined && cycle.statementTotal > 0;
      const isAwaitingBill = !isPrepaid && !isFixed && !hasStatementTotal;

      const total = hasStatementTotal ? cycle.statementTotal : isFixed ? (sub.defaultAmount || 0) : 0;
      const paid = isPrepaid ? (cycle.paidAmount || total) : (cycle.paidAmount || 0);
      const isPaid = isPrepaid || cycle.status === "FULLY_PAID" || (total > 0 && paid >= total);
      const isSkipped = cycle.status === "SKIPPED" || cycle.status === "PAUSED";
      const isPartiallyPaid = !isPrepaid && cycle.status === "PARTIALLY_PAID";
      const remaining = isPaid || isSkipped || isAwaitingBill ? 0 : (cycle.remainingBalance !== undefined && cycle.remainingBalance > 0 ? cycle.remainingBalance : Math.max(0, total - paid));

      totalPaidAmount += paid;
      if (!isPaid && !isSkipped && !isAwaitingBill) {
        totalPendingAmount += remaining;
      }

      // Calculate Due date & difference
      let dueDate = isPrepaid ? undefined : cycle.dueDate;
      if (!isPrepaid && !dueDate && sub.dueDayOfMonth) {
        const [yStr, mStr] = currentMonthStr.split("-");
        const maxDays = new Date(Number(yStr), Number(mStr), 0).getDate();
        const validDay = Math.min(sub.dueDayOfMonth, maxDays);
        dueDate = `${currentMonthStr}-${String(validDay).padStart(2, "0")}`;
      }

      let daysDiff: number | null = null;
      let group: PriorityGroup = "UPCOMING";

      if (dueDate) {
        const diffMs = new Date(dueDate).getTime() - new Date(todayIso).getTime();
        daysDiff = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      }

      if (isSkipped) {
        group = "SKIPPED";
      } else if (isPaid) {
        group = "SETTLED";
        settledCount++;
      } else if (isAwaitingBill) {
        group = "AWAITING_BILL";
        upcomingCount++;
      } else {
        // Unpaid or partially paid with known statement amount or fixed commitment
        if (daysDiff !== null && daysDiff < 0) {
          group = "OVERDUE";
          overdueCount++;
        } else if (daysDiff !== null && daysDiff <= 3) {
          group = "DUE_SOON";
          dueSoonCount++;
        } else {
          group = "UPCOMING";
          upcomingCount++;
        }
      }

      return {
        subscription: sub,
        group,
        daysDiff,
        displayAmount: total,
        remainingAmount: remaining,
        paidAmount: paid,
        isAwaitingBill,
      };
    });

    // Sort by Priority: OVERDUE -> DUE_SOON -> UPCOMING -> AWAITING_BILL -> SETTLED -> SKIPPED
    // Within groups, sort by nearest due date (daysDiff ascending)
    const priorityWeight: Record<PriorityGroup, number> = {
      OVERDUE: 1,
      DUE_SOON: 2,
      UPCOMING: 3,
      AWAITING_BILL: 4,
      SETTLED: 5,
      SKIPPED: 6,
    };

    prioritized.sort((a, b) => {
      const weightA = priorityWeight[a.group];
      const weightB = priorityWeight[b.group];
      if (weightA !== weightB) return weightA - weightB;

      if (a.daysDiff !== null && b.daysDiff !== null) {
        return a.daysDiff - b.daysDiff;
      }
      return 0;
    });

    return {
      items: prioritized,
      stats: {
        overdueCount,
        dueSoonCount,
        upcomingCount,
        settledCount,
        actionRequiredCount: overdueCount + dueSoonCount + upcomingCount,
        totalCount: subscriptions.length,
        totalPendingAmount,
        totalPaidAmount,
      },
    };
  }, [subscriptions, todayIso, currentMonthStr]);

  const filteredItems = useMemo(() => {
    if (filter === "OVERDUE") {
      return items.filter((i) => i.group === "OVERDUE");
    }
    if (filter === "ACTION_REQUIRED") {
      return items.filter((i) => i.group === "OVERDUE" || i.group === "DUE_SOON" || i.group === "UPCOMING");
    }
    if (filter === "SETTLED") {
      return items.filter((i) => i.group === "SETTLED");
    }
    return items;
  }, [items, filter]);

  const handleQuickPay = async (e: React.MouseEvent, sub: Subscription) => {
    e.stopPropagation();
    setIsMarkingPaidId(sub.id);
    try {
      await onQuickMarkPaid(sub);
    } finally {
      setIsMarkingPaidId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Month Header Banner */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-slate-950 p-4 sm:p-6 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                Action Hub • {formatCycleMonth(currentMonthStr)}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                {stats.settledCount}/{stats.totalCount} Settled
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white mt-1">
              Monthly Dues & Clearance Status
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Prioritized checklist of your recurring bills, loan debits, and credit card dues for this month.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-300 block">Pending Due</span>
              <span className="text-sm sm:text-base font-extrabold text-rose-400">
                ₹{stats.totalPendingAmount.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block">Cleared</span>
              <span className="text-sm sm:text-base font-extrabold text-emerald-400">
                ₹{stats.totalPaidAmount.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 sm:gap-2 mt-5 pt-4 border-t border-white/10 overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={`min-h-[34px] px-3.5 py-1 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${
              filter === "ALL"
                ? "bg-cyan-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/20"
                : "bg-white/5 text-slate-400 hover:text-white border border-white/5"
            }`}
          >
            All ({stats.totalCount})
          </button>

          <button
            type="button"
            onClick={() => setFilter("ACTION_REQUIRED")}
            className={`min-h-[34px] px-3.5 py-1 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${
              filter === "ACTION_REQUIRED"
                ? "bg-rose-500 text-white font-bold shadow-lg shadow-rose-500/20"
                : "bg-white/5 text-slate-400 hover:text-white border border-white/5"
            }`}
          >
            Pending Action ({stats.actionRequiredCount})
          </button>

          {stats.overdueCount > 0 && (
            <button
              type="button"
              onClick={() => setFilter("OVERDUE")}
              className={`min-h-[34px] px-3.5 py-1 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${
                filter === "OVERDUE"
                  ? "bg-rose-600 text-white font-bold shadow-lg shadow-rose-600/30 animate-pulse"
                  : "bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/20"
              }`}
            >
              🚨 Overdue ({stats.overdueCount})
            </button>
          )}

          <button
            type="button"
            onClick={() => setFilter("SETTLED")}
            className={`min-h-[34px] px-3.5 py-1 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${
              filter === "SETTLED"
                ? "bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20"
                : "bg-white/5 text-slate-400 hover:text-white border border-white/5"
            }`}
          >
            ✅ Cleared ({stats.settledCount})
          </button>
        </div>
      </div>

      {/* Action Item Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
        {filteredItems.map(({ subscription: sub, group, daysDiff, displayAmount, remainingAmount, isAwaitingBill }) => {
          const isSettled = group === "SETTLED" || group === "SKIPPED";
          const isOverdue = group === "OVERDUE";
          const isDueSoon = group === "DUE_SOON";
          const cycle = sub.currentCycle;

          return (
            <div
              key={sub.id}
              onClick={() => onSelectSubscription(sub)}
              className={`group relative flex flex-col justify-between rounded-2xl border p-4 sm:p-5 transition-all duration-200 cursor-pointer ${
                isOverdue
                  ? "bg-rose-950/20 border-rose-500/40 hover:border-rose-500/60 hover:bg-rose-950/30 shadow-lg shadow-rose-950/20"
                  : isDueSoon
                  ? "bg-amber-950/15 border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-950/25"
                  : isSettled
                  ? "bg-slate-900/30 border-white/5 hover:border-white/15 opacity-75 hover:opacity-100"
                  : isAwaitingBill
                  ? "bg-slate-900/40 border-white/10 hover:border-cyan-500/30 hover:bg-slate-900/70"
                  : "bg-slate-900/50 border-white/10 hover:border-cyan-500/40 hover:bg-slate-900/80"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Left: Avatar + Details */}
                <div className="flex items-start gap-3.5 min-w-0">
                  <SubscriptionAvatar
                    name={sub.name}
                    imageUrl={sub.imageUrl}
                    size="md"
                    className="shrink-0 rounded-xl"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm sm:text-base font-bold text-white group-hover:text-cyan-300 transition truncate">
                        {sub.name}
                      </h4>
                      {sub.category && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white/5 text-slate-400 border border-white/5">
                          {sub.category}
                        </span>
                      )}
                    </div>

                    {/* Due Date Indicator */}
                    <div className="flex items-center gap-2 mt-1 text-xs">
                      {isSettled ? (
                        <span className="text-emerald-400 font-medium flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Paid on {cycle.lastPaymentDate ? formatDisplayDate(cycle.lastPaymentDate) : "Time"}</span>
                        </span>
                      ) : isOverdue ? (
                        <span className="text-rose-400 font-bold flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Overdue by {Math.abs(daysDiff!)} day{Math.abs(daysDiff!) > 1 ? "s" : ""}</span>
                        </span>
                      ) : isDueSoon ? (
                        <span className="text-amber-300 font-bold flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Due {daysDiff === 0 ? "Today" : `in ${daysDiff} day${daysDiff! > 1 ? "s" : ""}`}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium">
                          Due {cycle.dueDate ? formatDisplayDate(cycle.dueDate) : `Day ${sub.dueDayOfMonth || "N/A"}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Amounts & Status Badge */}
                <div className="text-right shrink-0">
                  <div className="text-sm sm:text-base font-extrabold text-white font-mono">
                    {isAwaitingBill ? (
                      <div>
                        <span>₹0</span>
                        <span className="text-[10px] text-slate-500 font-medium block">Bill Pending</span>
                      </div>
                    ) : (
                      <span>₹{displayAmount.toLocaleString("en-IN")}</span>
                    )}
                  </div>
                  {!isAwaitingBill && remainingAmount > 0 && (
                    <div className="text-[11px] font-extrabold text-rose-400 mt-0.5 tracking-tight flex items-center justify-end gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                      <span>₹{remainingAmount.toLocaleString("en-IN")} pending</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Bar / Bottom Footer */}
              <div className="mt-3.5 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isSettled
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : isOverdue
                        ? "bg-rose-500/25 text-rose-300 border border-rose-500/40"
                        : isDueSoon
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : isAwaitingBill
                        ? "bg-slate-800/80 text-slate-300 border border-slate-700/60"
                        : "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                    }`}
                  >
                    {isSettled
                      ? "FULLY PAID"
                      : isOverdue
                      ? "OVERDUE"
                      : isDueSoon
                      ? "DUE SOON"
                      : isAwaitingBill
                      ? "⏳ AWAITING BILL"
                      : "PENDING"}
                  </span>

                  <span className="text-[11px] text-slate-400 group-hover:text-slate-200 transition">
                    View details & history →
                  </span>
                </div>

                {/* Quick 1-Click Pay or Edit Actions */}
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {!isSettled && !isAwaitingBill && (
                    <button
                      type="button"
                      disabled={isMarkingPaidId === sub.id}
                      onClick={(e) => handleQuickPay(e, sub)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:bg-white/20 hover:text-white hover:border-white/25 active:scale-95 transition cursor-pointer disabled:opacity-50 shadow-sm"
                      title="Quick mark as fully paid"
                    >
                      <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Mark Paid</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onOverride(sub)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:bg-cyan-500/20 hover:text-cyan-300 hover:border-cyan-500/30 transition cursor-pointer"
                    title="Manual ledger override"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={() => onViewHistory(sub)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:bg-indigo-500/20 hover:text-indigo-300 hover:border-indigo-500/30 transition cursor-pointer"
                    title="View historical dues ledger"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredItems.length === 0 && (
        <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-12 text-center backdrop-blur-md">
          <svg className="mx-auto h-10 w-10 text-emerald-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-base font-bold text-white">All Clear!</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            No commitments matching this filter. All dues are settled or up-to-date.
          </p>
        </div>
      )}
    </div>
  );
}
