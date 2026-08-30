"use client";

import React, { useState, useEffect } from "react";
import { HistoricalCycle, CycleState, PaymentStatus, Subscription, formatCycleMonth } from "@/lib/subscriptionTypes";

interface ManualOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: Subscription | null;
  targetCycle?: HistoricalCycle | CycleState | null;
  onSaveOverride: (subscriptionId: string, updates: any) => Promise<void>;
}

export function ManualOverrideModal({
  isOpen,
  onClose,
  subscription,
  targetCycle,
  onSaveOverride,
}: ManualOverrideModalProps) {
  const [statementTotal, setStatementTotal] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [dueDate, setDueDate] = useState("");
  const [statementDate, setStatementDate] = useState("");
  const [lastPaymentDate, setLastPaymentDate] = useState("");
  const [cycleMonth, setCycleMonth] = useState("");
  const [status, setStatus] = useState<PaymentStatus>("UNPAID");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (subscription) {
      const cycle = targetCycle || subscription.currentCycle;
      setStatementTotal(cycle.statementTotal ?? subscription.defaultAmount ?? 0);
      setPaidAmount(cycle.paidAmount ?? 0);
      setDueDate(cycle.dueDate || "");
      setStatementDate(cycle.statementDate || "");
      setLastPaymentDate(cycle.lastPaymentDate || "");
      setCycleMonth(cycle.cycleMonth || new Date().toISOString().slice(0, 7));
      setStatus(cycle.status || "UNPAID");
    }
  }, [subscription, targetCycle, isOpen]);

  if (!isOpen || !subscription) return null;

  const remaining = Math.max(0, Math.round((statementTotal - paidAmount) * 100) / 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg("");

    try {
      await onSaveOverride(subscription.id, {
        statementTotal: Number(statementTotal),
        paidAmount: Number(paidAmount),
        remainingBalance: remaining,
        dueDate: dueDate || undefined,
        statementDate: statementDate || undefined,
        lastPaymentDate: lastPaymentDate || undefined,
        cycleMonth,
        status,
      });
      onClose();
    } catch (err) {
      setErrorMsg((err as Error).message || "Failed to save override.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border border-white/15 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 sm:px-6 py-3.5 sm:py-4 shrink-0 bg-slate-950/40">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>✏️ Manual Ledger Override</span>
              {cycleMonth && (
                <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-300 font-mono">
                  {formatCycleMonth(cycleMonth)}
                </span>
              )}
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Adjust amounts, dates, or status for <span className="text-cyan-300">{subscription.name}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-3.5 sm:space-y-4 flex-1">
          {errorMsg && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-300">
                Statement / Due (₹) *
              </label>
              <input
                type="number"
                step="any"
                required
                value={statementTotal}
                onChange={(e) => setStatementTotal(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs sm:text-sm text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-300">
                Paid Amount (₹) *
              </label>
              <input
                type="number"
                step="any"
                required
                value={paidAmount}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setPaidAmount(val);
                  if (val >= statementTotal && statementTotal > 0) {
                    setStatus("FULLY_PAID");
                  } else if (val > 0) {
                    setStatus("PARTIALLY_PAID");
                  } else {
                    setStatus("UNPAID");
                  }
                }}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs sm:text-sm text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs flex justify-between text-slate-300">
            <span>Remaining Balance:</span>
            <span className="font-bold text-amber-400">₹{remaining.toLocaleString("en-IN")}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-300">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-300">
                Payment Date
              </label>
              <input
                type="date"
                value={lastPaymentDate}
                onChange={(e) => setLastPaymentDate(e.target.value)}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-300">
                Cycle Month
              </label>
              <input
                type="month"
                required
                value={cycleMonth}
                onChange={(e) => setCycleMonth(e.target.value)}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-300">
                Payment Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PaymentStatus)}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs sm:text-sm text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="FULLY_PAID">FULLY_PAID (Settled)</option>
                <option value="PARTIALLY_PAID">PARTIALLY_PAID (Partial)</option>
                <option value="UNPAID">UNPAID (Pending)</option>
                <option value="SKIPPED">SKIPPED (No payment required)</option>
                <option value="MISMATCH_REVIEW">MISMATCH_REVIEW (Flagged)</option>
              </select>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-white/10 pt-4 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] rounded-xl border border-white/10 bg-transparent px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[40px] rounded-xl bg-cyan-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 cursor-pointer shadow-lg"
            >
              {isSubmitting ? "Saving..." : "Save Override"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
