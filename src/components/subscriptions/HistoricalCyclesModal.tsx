"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  HistoricalCycle,
  SourceEmailRecord,
  Subscription,
  formatCycleMonth,
  formatDisplayDate,
} from "@/lib/subscriptionTypes";
import { SubscriptionAvatar } from "./SubscriptionAvatar";
import { ManualOverrideModal } from "./ManualOverrideModal";
import { useAuth } from "@/context/AuthContext";

interface HistoricalCyclesModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: Subscription | null;
  onCyclesUpdated?: () => void;
  onViewSourceEmail?: (
    sub: Subscription,
    initialEmail?: SourceEmailRecord,
    scopedEmails?: SourceEmailRecord[],
    cycleMonth?: string,
  ) => void;
  onRefreshSubscription?: () => void;
}

export function HistoricalCyclesModal({
  isOpen,
  onClose,
  subscription,
  onCyclesUpdated,
  onViewSourceEmail,
  onRefreshSubscription,
}: HistoricalCyclesModalProps) {
  const { user, userId } = useAuth();
  const [cycles, setCycles] = useState<HistoricalCycle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanningHistorical, setIsScanningHistorical] = useState(false);
  const [scanMonths, setScanMonths] = useState<number>(100);
  const [scanResultNotice, setScanResultNotice] = useState<string | null>(null);
  const [selectedCycleForOverride, setSelectedCycleForOverride] = useState<HistoricalCycle | null>(null);
  const [isDeletingMonth, setIsDeletingMonth] = useState<string | null>(null);

  const handleDeleteCycle = async (cycleMonth: string) => {
    if (!subscription) return;
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete cycle ${formatCycleMonth(cycleMonth)}? This will remove its ledger line and payment records.`,
    );
    if (!confirmed) return;

    setIsDeletingMonth(cycleMonth);
    try {
      const res = await fetch(`/api/subscriptions/${subscription.id}/cycle?month=${encodeURIComponent(cycleMonth)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete cycle");
      }
      await fetchCycles();
      if (onCyclesUpdated) onCyclesUpdated();
      if (onRefreshSubscription) onRefreshSubscription();
    } catch (err) {
      alert(`Delete Error: ${(err as Error).message}`);
    } finally {
      setIsDeletingMonth(null);
    }
  };

  const fetchCycles = useCallback(async () => {
    if (!subscription) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/subscriptions/${subscription.id}/cycles`);
      if (res.ok) {
        const data = await res.json();
        setCycles(data.cycles || []);
      }
    } catch (err) {
      console.error("Error fetching historical cycles:", err);
    } finally {
      setIsLoading(false);
    }
  }, [subscription]);

  useEffect(() => {
    if (isOpen && subscription) {
      fetchCycles();
      setScanResultNotice(null);
    }
  }, [isOpen, subscription, fetchCycles]);

  if (!isOpen || !subscription) return null;

  const isPrepaidSub =
    Boolean(subscription.isPrepaid) ||
    subscription.category === "Entertainment" ||
    (!subscription.dueDayOfMonth &&
      subscription.billingType === "BILL_GENERATED" &&
      !subscription.emailConfig?.paymentQuery);

  const handleTriggerSmsReconciliation = async () => {
    setIsScanningHistorical(true);
    setScanResultNotice(null);

    try {
      const qUserId = user?.email || user?.uid || userId;
      if (!qUserId) return;
      const res = await fetch("/api/sync/sms/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: qUserId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "SMS reconciliation failed");
      }

      setScanResultNotice(
        `✅ SMS Reconciliation completed: ${data.summaryText || "Reconciled all matching loan debits across past cycles."}`,
      );

      await fetchCycles();
      if (onCyclesUpdated) onCyclesUpdated();
      if (onRefreshSubscription) onRefreshSubscription();
    } catch (err) {
      setScanResultNotice(`⚠️ SMS Reconciliation Error: ${(err as Error).message}`);
    } finally {
      setIsScanningHistorical(false);
    }
  };

  const handleSaveCycleOverride = async (subId: string, updates: any) => {
    const res = await fetch(`/api/subscriptions/${subId}/cycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to save cycle override");
    }
    setSelectedCycleForOverride(null);
    await fetchCycles();
    if (onCyclesUpdated) onCyclesUpdated();
    if (onRefreshSubscription) onRefreshSubscription();
  };

  const handleTriggerHistoricalScan = async () => {
    setIsScanningHistorical(true);
    setScanResultNotice(null);

    try {
      const qUserId = user?.email || user?.uid || userId || "default_user";
      const res = await fetch("/api/sync/historical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: qUserId,
          subscriptionId: subscription.id,
          maxStatements: scanMonths,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Historical sync failed");
      }

      setScanResultNotice(
        `✅ Deep scan completed: Found ${data.cyclesFound || 0} historical billing cycles across ${
          data.messagesScanned || 0
        } scanned emails.`,
      );

      await fetchCycles();
      if (onCyclesUpdated) onCyclesUpdated();
      if (onRefreshSubscription) onRefreshSubscription();
    } catch (err) {
      setScanResultNotice(`⚠️ Scan Error: ${(err as Error).message}`);
    } finally {
      setIsScanningHistorical(false);
    }
  };

  // Stats calculation
  const totalBilled = cycles.reduce((sum, c) => sum + (c.statementTotal || 0), 0);
  const totalPaid = isPrepaidSub
    ? totalBilled
    : cycles.reduce((sum, c) => sum + (c.paidAmount || 0), 0);
  const totalPending = isPrepaidSub
    ? 0
    : cycles.reduce((sum, c) => sum + (c.remainingBalance || 0), 0);
  const avgMonthly = cycles.length > 0 ? Math.round(totalBilled / cycles.length) : 0;

  const isLoanOrSmsSub =
    subscription.source === "SMS_AUTOMATED" ||
    subscription.category === "Loans & EMIs" ||
    subscription.name.toLowerCase().includes("loan") ||
    subscription.name.toLowerCase().includes("emi") ||
    Boolean(subscription.smsConfig?.enabled);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border border-white/15 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 sm:px-6 py-4 shrink-0 bg-slate-950/40">
          <div className="flex items-center gap-3.5">
            <SubscriptionAvatar
              name={subscription.name}
              category={subscription.category}
              imageUrl={subscription.imageUrl}
              icon={subscription.icon}
              size="xl"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  {isPrepaidSub ? "Historical Invoice & Purchase Ledger" : "Historical Dues & Payment Ledger"}
                </h2>
                <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[11px] font-semibold text-indigo-300">
                  {subscription.name}
                </span>
                {isPrepaidSub && (
                  <span className="rounded-md bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    ⚡ PREPAID
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isPrepaidSub
                  ? "Prepaid service: Invoices are settled immediately upon arrival. Each record is confirmed as paid."
                  : "Multi-month statement dues reconciled against automated payment confirmations."}
              </p>
            </div>
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

        {/* Body Container */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1">
          {/* Deep Scan Trigger Card */}
          {isLoanOrSmsSub ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 to-slate-900/90 p-4 shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 block">
                  Reconcile Stored Loan Debits & SMS History
                </span>
                <p className="text-xs text-slate-300 mt-0.5">
                  Evaluate all historical bank SMS against this loan commitment and backfill past monthly payments.
                </p>
              </div>

              <button
                type="button"
                disabled={isScanningHistorical}
                onClick={handleTriggerSmsReconciliation}
                className="min-h-[36px] flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 shadow-md hover:bg-emerald-400 disabled:opacity-50 transition cursor-pointer self-end sm:self-auto shrink-0"
              >
                {isScanningHistorical ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-950 border-r-transparent" />
                    <span>Reconciling...</span>
                  </>
                ) : (
                  <>
                    <span>💬</span>
                    <span>Reconcile Past Loan SMS</span>
                  </>
                )}
              </button>
            </div>
          ) : subscription.source === "EMAIL_AUTOMATED" ? (
            <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 to-slate-900/90 p-4 shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 block">
                  Scan Historical Statements in Gmail
                </span>
                <p className="text-xs text-slate-300 mt-0.5">
                  Fetch past billing emails from Gmail and backfill multi-month payments and dues.
                </p>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <select
                  value={scanMonths}
                  onChange={(e) => setScanMonths(Number(e.target.value))}
                  disabled={isScanningHistorical}
                  className="min-h-[36px] rounded-xl border border-white/10 bg-slate-800 px-3 py-1 text-xs font-medium text-white focus:outline-none cursor-pointer"
                >
                  <option value={100}>All Time (All Emails)</option>
                  <option value={36}>Past 3 Years (36 Mo)</option>
                  <option value={24}>Past 2 Years (24 Mo)</option>
                  <option value={12}>Past 1 Year (12 Mo)</option>
                  <option value={6}>Past 6 Months</option>
                  <option value={3}>Past 3 Months</option>
                </select>

                <button
                  type="button"
                  disabled={isScanningHistorical}
                  onClick={handleTriggerHistoricalScan}
                  className="min-h-[36px] flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-1.5 text-xs font-bold text-white shadow-md hover:bg-indigo-400 disabled:opacity-50 transition cursor-pointer"
                >
                  {isScanningHistorical ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-r-transparent" />
                      <span>Scanning...</span>
                    </>
                  ) : (
                    <>
                      <span>🔍</span>
                      <span>Run Historical Scan</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : null}

          {/* Scan Notice */}
          {scanResultNotice && (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-200">
              {scanResultNotice}
            </div>
          )}

          {/* Stat Cards - Tailored for Prepaid vs Postpaid */}
          {isPrepaidSub ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
                <span className="text-[11px] font-medium text-slate-400 block">Total Historical Invoiced</span>
                <span className="text-base sm:text-lg font-bold text-white mt-0.5 block">
                  ₹{totalBilled.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
                <span className="text-[11px] font-medium text-slate-400 block">Total Settled</span>
                <span className="text-base sm:text-lg font-bold text-emerald-400 mt-0.5 block">
                  ₹{totalPaid.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
                <span className="text-[11px] font-medium text-slate-400 block">Billing Model</span>
                <span className="text-base sm:text-lg font-bold text-emerald-300 mt-0.5 flex items-center gap-1">
                  <span>⚡</span> 100% Settled
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
                <span className="text-[11px] font-medium text-slate-400 block">Monthly Average</span>
                <span className="text-base sm:text-lg font-bold text-cyan-300 mt-0.5 block">
                  ₹{avgMonthly.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
                <span className="text-[11px] font-medium text-slate-400 block">Total Historical Billed</span>
                <span className="text-base sm:text-lg font-bold text-white mt-0.5 block">
                  ₹{totalBilled.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
                <span className="text-[11px] font-medium text-slate-400 block">Total Amount Paid</span>
                <span className="text-base sm:text-lg font-bold text-emerald-400 mt-0.5 block">
                  ₹{totalPaid.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
                <span className="text-[11px] font-medium text-slate-400 block">Pending Balance</span>
                <span className="text-base sm:text-lg font-bold text-amber-400 mt-0.5 block">
                  ₹{totalPending.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
                <span className="text-[11px] font-medium text-slate-400 block">Monthly Average</span>
                <span className="text-base sm:text-lg font-bold text-cyan-300 mt-0.5 block">
                  ₹{avgMonthly.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          )}

          {/* Cycles Ledger Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300">
                {isPrepaidSub ? `Invoices & Purchase Cycles (${cycles.length})` : `Billing Cycles Ledger (${cycles.length})`}
              </h3>
              <span className="text-xs text-slate-400">Chronological Monthly Ledger</span>
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-400 border-r-transparent mb-2" />
                <p>Loading historical ledger...</p>
              </div>
            ) : cycles.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-8 text-center text-xs text-slate-400">
                No past cycles found. Click &quot;Run Historical Scan&quot; to backfill past statements.
              </div>
            ) : isPrepaidSub ? (
              /* Prepaid Table Layout */
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Billing Cycle</th>
                        <th className="px-4 py-3">Invoice Date</th>
                        <th className="px-4 py-3 text-right">Invoiced Amount</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-medium">
                      {cycles.map((c) => {
                        const cycleEmails = c.sourceEmails || [];
                        const firstEmail = cycleEmails.length > 0 ? cycleEmails[0] : null;

                        return (
                          <tr key={c.id || c.cycleMonth} className="hover:bg-white/[0.02] transition">
                            <td className="px-4 py-3 font-bold text-white">
                              {formatCycleMonth(c.cycleMonth)}
                            </td>
                            <td className="px-4 py-3 text-slate-300">
                              {c.statementDate ? formatDisplayDate(c.statementDate) : "On Invoice"}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-white">
                              ₹{(c.statementTotal || 0).toLocaleString("en-IN")}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                <span>Settled on Invoice</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {firstEmail && onViewSourceEmail && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onViewSourceEmail(
                                        subscription,
                                        firstEmail,
                                        cycleEmails,
                                        c.cycleMonth,
                                      )
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-500/20 border border-indigo-500/30 px-2.5 py-1 text-[11px] font-medium text-indigo-300 hover:bg-indigo-500/30 transition cursor-pointer"
                                    title="View archived source invoice email"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    <span>Invoice</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setSelectedCycleForOverride(c)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-cyan-500/20 hover:text-cyan-300 hover:border-cyan-500/30 transition cursor-pointer"
                                  title="Manually edit amounts, dates, or payment status"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                  <span>Edit</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={isDeletingMonth === c.cycleMonth}
                                  onClick={() => handleDeleteCycle(c.cycleMonth)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/40 transition cursor-pointer disabled:opacity-50"
                                  title="Permanently delete this billing cycle"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  <span>Delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* Postpaid Table Layout */
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Cycle Month</th>
                        <th className="px-4 py-3">Statement Date</th>
                        <th className="px-4 py-3">Due Date</th>
                        <th className="px-4 py-3 text-right">Statement Amount</th>
                        <th className="px-4 py-3 text-right">Paid Amount</th>
                        <th className="px-4 py-3 text-right">Remaining</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3">Payment Date</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-medium">
                      {cycles.map((c) => {
                        const isPaid = c.status === "FULLY_PAID";
                        const cycleEmails = c.sourceEmails || [];
                        const firstEmail = cycleEmails.length > 0 ? cycleEmails[0] : null;

                        return (
                          <tr key={c.id || c.cycleMonth} className="hover:bg-white/[0.02] transition">
                            <td className="px-4 py-3 font-bold text-white">
                              {formatCycleMonth(c.cycleMonth)}
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {c.statementDate ? formatDisplayDate(c.statementDate) : "N/A"}
                            </td>
                            <td className="px-4 py-3 text-slate-200">
                              {c.dueDate ? formatDisplayDate(c.dueDate) : "N/A"}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-white">
                              ₹{(c.statementTotal || 0).toLocaleString("en-IN")}
                            </td>
                            <td className="px-4 py-3 text-right text-emerald-400">
                              ₹{(c.paidAmount || 0).toLocaleString("en-IN")}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-amber-400">
                              ₹{(c.remainingBalance || 0).toLocaleString("en-IN")}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  c.status === "SKIPPED"
                                    ? "bg-slate-800 text-slate-400 border border-white/10"
                                    : isPaid
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : c.status === "PARTIALLY_PAID"
                                    ? "bg-sky-500/20 text-sky-300"
                                    : "bg-slate-800 text-slate-300"
                                }`}
                              >
                                {c.status === "SKIPPED" && (
                                  <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                  </svg>
                                )}
                                {c.status === "FULLY_PAID" && (
                                  <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                                <span>{c.status === "SKIPPED" ? "SKIPPED" : c.status}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-400 text-[11px]">
                              {c.status === "SKIPPED"
                                ? "Skipped"
                                : c.lastPaymentDate
                                ? formatDisplayDate(c.lastPaymentDate)
                                : isPaid
                                ? "Paid"
                                : "Pending"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {c.sourceSms && c.sourceSms.length > 0 && onViewSourceEmail ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const mappedSms: SourceEmailRecord[] = (c.sourceSms || []).map((sms) => ({
                                        id: sms.id,
                                        subscriptionId: subscription.id,
                                        subscriptionName: subscription.name,
                                        cycleMonth: c.cycleMonth,
                                        type: "PAYMENT" as const,
                                        subject: `SMS Alert: ${sms.sender}`,
                                        from: sms.sender,
                                        date: sms.date || sms.createdAt || new Date().toISOString(),
                                        bodySnippet: sms.body,
                                        bodyText: sms.body,
                                        extractedAmount: sms.extractedAmount,
                                        extractedDate: sms.extractedDate,
                                        accountOrCardDigits: sms.accountReference,
                                        createdAt: sms.createdAt || new Date().toISOString(),
                                      }));
                                      onViewSourceEmail(
                                        subscription,
                                        mappedSms[0],
                                        mappedSms,
                                        c.cycleMonth,
                                      );
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/30 transition cursor-pointer"
                                    title="View archived source loan recovery SMS"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                    <span>SMS</span>
                                  </button>
                                ) : firstEmail && onViewSourceEmail ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onViewSourceEmail(
                                        subscription,
                                        firstEmail,
                                        cycleEmails,
                                        c.cycleMonth,
                                      )
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-500/20 border border-indigo-500/30 px-2.5 py-1 text-[11px] font-medium text-indigo-300 hover:bg-indigo-500/30 transition cursor-pointer"
                                    title="View archived source statement & payment emails"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    <span>Email</span>
                                  </button>
                                ) : null}

                                <button
                                  type="button"
                                  onClick={() => setSelectedCycleForOverride(c)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-cyan-500/20 hover:text-cyan-300 hover:border-cyan-500/30 transition cursor-pointer"
                                  title="Manually edit amounts, dates, or payment status"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                  <span>Edit</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={isDeletingMonth === c.cycleMonth}
                                  onClick={() => handleDeleteCycle(c.cycleMonth)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/40 transition cursor-pointer disabled:opacity-50"
                                  title="Permanently delete this billing cycle"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  <span>Delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 px-4 sm:px-6 py-3.5 bg-slate-950/40">
          <span className="text-xs text-slate-400">
            {isPrepaidSub
              ? "All historical invoices are permanently stored in Firestore & Cloud Storage."
              : "All multi-month statement and payment records are saved in Firestore."}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] rounded-xl bg-white/10 px-4 py-1.5 text-xs font-medium text-white hover:bg-white/15 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {selectedCycleForOverride && (
        <ManualOverrideModal
          isOpen={Boolean(selectedCycleForOverride)}
          onClose={() => setSelectedCycleForOverride(null)}
          subscription={subscription}
          targetCycle={selectedCycleForOverride}
          onSaveOverride={handleSaveCycleOverride}
        />
      )}
    </div>
  );
}
