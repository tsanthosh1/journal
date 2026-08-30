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

interface SubscriptionDetailViewProps {
  subscription: Subscription;
  onBack: () => void;
  onEdit: (sub: Subscription) => void;
  onDelete: (subId: string) => Promise<void>;
  onOverride: (sub: Subscription) => void;
  onViewSourceEmail?: (
    sub: Subscription,
    initialEmail?: SourceEmailRecord,
    scopedEmails?: SourceEmailRecord[],
    cycleMonth?: string,
  ) => void;
  onRefreshSubscription?: () => void;
}

export function SubscriptionDetailView({
  subscription,
  onBack,
  onEdit,
  onDelete,
  onOverride,
  onViewSourceEmail,
  onRefreshSubscription,
}: SubscriptionDetailViewProps) {
  const { user, userId } = useAuth();
  const [cycles, setCycles] = useState<HistoricalCycle[]>([]);
  const [isLoadingCycles, setIsLoadingCycles] = useState(true);
  const [selectedCycleForOverride, setSelectedCycleForOverride] = useState<HistoricalCycle | null>(null);
  const [isDeletingMonth, setIsDeletingMonth] = useState<string | null>(null);
  const [isDeletingSubscription, setIsDeletingSubscription] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  const fetchCycles = useCallback(async () => {
    setIsLoadingCycles(true);
    try {
      const res = await fetch(`/api/subscriptions/${subscription.id}/cycles`);
      if (res.ok) {
        const data = await res.json();
        setCycles(data.cycles || []);
      }
    } catch (err) {
      console.error("Error fetching cycles in detail view:", err);
    } finally {
      setIsLoadingCycles(false);
    }
  }, [subscription.id]);

  useEffect(() => {
    fetchCycles();
  }, [fetchCycles]);

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
    if (onRefreshSubscription) onRefreshSubscription();
  };

  const handleDeleteCycle = async (cycleMonth: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete cycle ${formatCycleMonth(cycleMonth)}? This will remove its ledger line and payment records.`,
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
      if (onRefreshSubscription) onRefreshSubscription();
    } catch (err) {
      alert(`Delete Error: ${(err as Error).message}`);
    } finally {
      setIsDeletingMonth(null);
    }
  };

  const handleTriggerDeepScan = async () => {
    setIsScanning(true);
    setScanNotice(null);
    try {
      const isSmsAutomated = subscription.source === "SMS_AUTOMATED" || subscription.smsConfig?.enabled;
      const qUserId = user?.email || user?.uid || userId || "default_user";

      if (isSmsAutomated) {
        const res = await fetch("/api/sync/sms/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: qUserId, subscriptionId: subscription.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "SMS sync failed");
        setScanNotice(`✅ SMS Reconciled: ${data.summaryText || "Synced records."}`);
      } else {
        const res = await fetch("/api/sync/historical", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: qUserId, subscriptionId: subscription.id, maxStatements: 50 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gmail sync failed");
        setScanNotice(`✅ Deep scan complete: Found ${data.cyclesFound || 0} cycles.`);
      }

      await fetchCycles();
      if (onRefreshSubscription) onRefreshSubscription();
    } catch (err) {
      setScanNotice(`⚠️ Sync Error: ${(err as Error).message}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleDeleteSelf = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${subscription.name}"? This action cannot be undone.`,
    );
    if (!confirmed) return;

    setIsDeletingSubscription(true);
    try {
      await onDelete(subscription.id);
      onBack();
    } catch (err) {
      alert(`Delete Error: ${(err as Error).message}`);
      setIsDeletingSubscription(false);
    }
  };

  const current = subscription.currentCycle;
  const isPaid = current.status === "FULLY_PAID";
  const isSkipped = current.status === "SKIPPED";
  const isPartiallyPaid = current.status === "PARTIALLY_PAID";
  const isUnpaid = current.status === "UNPAID";

  return (
    <div className="space-y-6">
      {/* Navigation Top Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer shadow-lg"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>Back to Listing</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(subscription)}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-slate-900/80 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer"
          >
            <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>Edit</span>
          </button>

          <button
            type="button"
            disabled={isDeletingSubscription}
            onClick={handleDeleteSelf}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2 text-xs sm:text-sm font-semibold text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/40 transition cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Hero Header Card */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-5 min-w-0">
            <SubscriptionAvatar
              name={subscription.name}
              imageUrl={subscription.imageUrl}
              category={subscription.category}
              size="lg"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white truncate">
                  {subscription.name}
                </h1>
                {subscription.category && (
                  <span className="rounded-full bg-cyan-400/10 border border-cyan-400/20 px-3 py-0.5 text-xs font-bold text-cyan-400">
                    {subscription.category}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                <span>Cycle: <strong className="text-white capitalize">{subscription.billingCycle.toLowerCase()}</strong></span>
                <span>•</span>
                <span>Type: <strong className="text-white">{subscription.billingType}</strong></span>
                <span>•</span>
                <span>Source: <strong className="text-cyan-300">{subscription.source}</strong></span>
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Default / Estimated</span>
              <span className="text-base sm:text-lg font-extrabold text-white font-mono">
                ₹{(subscription.defaultAmount || 0).toLocaleString("en-IN")}
              </span>
            </div>
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 block">Current Status</span>
              <span className="text-xs sm:text-sm font-bold text-cyan-400">
                {current.status}
              </span>
            </div>
          </div>
        </div>

        {scanNotice && (
          <div className="mt-4 rounded-2xl border border-cyan-500/30 bg-cyan-950/40 p-3.5 text-xs text-cyan-200 shadow-xl">
            {scanNotice}
          </div>
        )}
      </div>

      {/* Two Column Layout: Current Cycle & Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 6 cols: Current Active Cycle */}
        <div className="lg:col-span-6 rounded-3xl border border-white/10 bg-slate-900/60 p-5 sm:p-6 backdrop-blur-xl shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">Active Ledger Cycle</span>
              <h3 className="text-base font-bold text-white">
                {formatCycleMonth(current.cycleMonth)}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onOverride(subscription)}
              className="inline-flex items-center gap-1 rounded-xl bg-cyan-500/20 border border-cyan-500/30 px-3 py-1 text-xs font-bold text-cyan-300 hover:bg-cyan-500/30 transition cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              <span>Override Cycle</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Statement Total</span>
              <span className="text-base font-bold text-white font-mono">
                ₹{(current.statementTotal || 0).toLocaleString("en-IN")}
              </span>
            </div>

            <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/5 p-3">
              <span className="text-[10px] uppercase font-bold text-emerald-400 block">Paid Amount</span>
              <span className="text-base font-bold text-emerald-400 font-mono">
                ₹{(current.paidAmount || 0).toLocaleString("en-IN")}
              </span>
            </div>

            <div className="rounded-2xl border border-amber-500/10 bg-amber-500/5 p-3 col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-bold text-amber-300 block">Remaining</span>
              <span className="text-base font-bold text-amber-400 font-mono">
                ₹{(current.remainingBalance || 0).toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-2 text-xs text-slate-300">
            <div className="flex justify-between py-1 border-b border-white/5">
              <span className="text-slate-400">Statement Date:</span>
              <span className="font-medium text-white">{current.statementDate ? formatDisplayDate(current.statementDate) : "Not Generated"}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-white/5">
              <span className="text-slate-400">Payment Due Date:</span>
              <span className="font-medium text-white">{current.dueDate ? formatDisplayDate(current.dueDate) : `Day ${subscription.dueDayOfMonth || "N/A"}`}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-white/5">
              <span className="text-slate-400">Payment Status:</span>
              <span className={`font-bold ${isPaid ? "text-emerald-400" : isPartiallyPaid ? "text-sky-400" : "text-amber-400"}`}>
                {current.status}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Last Payment Cleared:</span>
              <span className="font-medium text-white">{current.lastPaymentDate ? formatDisplayDate(current.lastPaymentDate) : "None recorded"}</span>
            </div>
          </div>
        </div>

        {/* Right 6 cols: Sync Engine & Matching Configuration */}
        <div className="lg:col-span-6 rounded-3xl border border-white/10 bg-slate-900/60 p-5 sm:p-6 backdrop-blur-xl shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">Automated Sync Profile</span>
              <h3 className="text-base font-bold text-white">Parser & Matching Rules</h3>
            </div>
            <button
              type="button"
              disabled={isScanning}
              onClick={handleTriggerDeepScan}
              className="inline-flex items-center gap-1 rounded-xl bg-indigo-500/20 border border-indigo-500/30 px-3 py-1 text-xs font-bold text-indigo-300 hover:bg-indigo-500/30 transition cursor-pointer disabled:opacity-50"
            >
              <svg className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{isScanning ? "Syncing..." : "Reconcile Now"}</span>
            </button>
          </div>

          <div className="space-y-2.5 text-xs">
            {subscription.emailConfig?.statementQuery && (
              <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Statement Query</span>
                <code className="text-cyan-300 font-mono text-[11px] break-all block mt-0.5">
                  {subscription.emailConfig.statementQuery}
                </code>
              </div>
            )}

            {subscription.emailConfig?.paymentQuery && (
              <div className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Payment Query</span>
                <code className="text-indigo-300 font-mono text-[11px] break-all block mt-0.5">
                  {subscription.emailConfig.paymentQuery}
                </code>
              </div>
            )}

            {subscription.smsConfig?.enabled && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-2.5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 block">Android SMS Companion</span>
                <div className="text-slate-300 text-[11px]">
                  <span>Sender Code: <strong className="text-white font-mono">{subscription.smsConfig.senderQuery}</strong></span>
                  {subscription.smsConfig.accountOrLoanDigits && (
                    <span className="ml-3">Loan Account: <strong className="text-white font-mono">**{subscription.smsConfig.accountOrLoanDigits}</strong></span>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-slate-400 pt-1">
              <span>Duplicate Prevention:</span>
              <span className="font-mono text-slate-200">{subscription.dedupStrategy || "SAME_DAY_SAME_AMOUNT"}</span>
            </div>

            {subscription.allowSkip && (
              <div className="flex items-center gap-1.5 text-amber-300 text-[11px]">
                <span>⏭️</span>
                <span>Voluntary commitment (unpaid months marked as Skipped without penalty).</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Embedded Historical Ledger Section */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 sm:p-6 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">Full Historical Ledger</span>
            <h3 className="text-base font-bold text-white">Multi-Month Statements & Payment Records</h3>
          </div>
          <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-bold text-slate-400">
            {cycles.length} Cycles Archived
          </span>
        </div>

        {isLoadingCycles ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading historical cycles...</div>
        ) : cycles.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No historical cycles found yet. Click &quot;Reconcile Now&quot; to backfill from your Gmail or SMS logs.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/80">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Billing Cycle</th>
                  <th className="px-4 py-3">Statement Date</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3 text-right">Statement Amount</th>
                  <th className="px-4 py-3 text-right">Paid Amount</th>
                  <th className="px-4 py-3 text-right">Remaining</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3">Payment Date</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium">
                {cycles.map((c) => {
                  const cycleEmails = c.sourceEmails || [];
                  const firstEmail = cycleEmails.length > 0 ? cycleEmails[0] : null;
                  const isCyclePaid = c.status === "FULLY_PAID";

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
                      <td className="px-4 py-3 text-right font-bold text-white font-mono">
                        ₹{(c.statementTotal || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-mono">
                        ₹{(c.paidAmount || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-400 font-mono">
                        ₹{(c.remainingBalance || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            c.status === "SKIPPED"
                              ? "bg-slate-800 text-slate-400 border border-white/10"
                              : isCyclePaid
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
                          {isCyclePaid && (
                            <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          <span>{c.status === "SKIPPED" ? "SKIPPED" : c.status}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-[11px]">
                        {c.lastPaymentDate ? formatDisplayDate(c.lastPaymentDate) : isCyclePaid ? "Paid" : "Pending"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5 flex-nowrap shrink-0">
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
                              className="h-7 w-7 inline-flex items-center justify-center rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 hover:text-white transition cursor-pointer shrink-0"
                              title="View archived source loan recovery SMS"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
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
                              className="h-7 w-7 inline-flex items-center justify-center rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30 hover:text-white transition cursor-pointer shrink-0"
                              title="View archived source statement & payment emails"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => setSelectedCycleForOverride(c)}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-cyan-500/20 hover:text-cyan-300 hover:border-cyan-500/30 transition cursor-pointer shrink-0"
                            title="Manually edit amounts, dates, or payment status"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            disabled={isDeletingMonth === c.cycleMonth}
                            onClick={() => handleDeleteCycle(c.cycleMonth)}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-200 transition cursor-pointer disabled:opacity-50 shrink-0"
                            title="Permanently delete this billing cycle"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
