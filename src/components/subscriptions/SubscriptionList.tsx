"use client";

import React, { useState, useMemo } from "react";
import {
  Subscription,
  SubscriptionCategory,
  formatDisplayDate,
} from "@/lib/subscriptionTypes";
import { SubscriptionAvatar } from "./SubscriptionAvatar";
import { SubscriptionCard } from "./SubscriptionCard";

interface SubscriptionListProps {
  subscriptions: Subscription[];
  onEdit: (sub: Subscription) => void;
  onOverride: (sub: Subscription) => void;
  onDelete: (id: string) => void;
  onQuickMarkPaid: (sub: Subscription) => void;
  onTestParser: (sub: Subscription) => void;
  onSelectSubscription?: (sub: Subscription) => void;
  onViewHistory?: (sub: Subscription) => void;
  onViewSourceEmail?: (sub: Subscription) => void;
}

export function SubscriptionList({
  subscriptions,
  onEdit,
  onOverride,
  onDelete,
  onQuickMarkPaid,
  onTestParser,
  onSelectSubscription,
  onViewHistory,
  onViewSourceEmail,
}: SubscriptionListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedSource, setSelectedSource] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"dueDate" | "amount" | "name">("dueDate");
  const [layoutMode, setLayoutMode] = useState<"grid" | "table">("grid");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categories: SubscriptionCategory[] = [
    "Credit Cards",
    "Utilities",
    "Services",
    "Entertainment",
    "Insurance",
    "Software & Tools",
    "Housing & Rent",
    "Other",
  ];

  const handleCopySubConfig = async (sub: Subscription) => {
    const configPayload = {
      name: sub.name,
      category: sub.category,
      billingType: sub.billingType,
      source: sub.source,
      currency: sub.currency,
      defaultAmount: sub.defaultAmount,
      billingCycle: sub.billingCycle,
      dueDayOfMonth: sub.dueDayOfMonth,
      emailConfig: sub.emailConfig
        ? {
            enabled: sub.emailConfig.enabled,
            statementQuery: sub.emailConfig.statementQuery,
            paymentQuery: sub.emailConfig.paymentQuery,
            parserModule: sub.emailConfig.parserModule,
            customRegex: sub.emailConfig.customRegex,
          }
        : undefined,
      notes: sub.notes,
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(configPayload, null, 2));
      setCopiedId(sub.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy config:", err);
    }
  };

  const filteredSubscriptions = useMemo(() => {
    return subscriptions
      .filter((sub) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = sub.name.toLowerCase().includes(q);
          const matchCat = sub.category.toLowerCase().includes(q);
          const matchNotes = sub.notes?.toLowerCase().includes(q);
          if (!matchName && !matchCat && !matchNotes) return false;
        }

        if (selectedCategory !== "ALL" && sub.category !== selectedCategory) {
          return false;
        }

        if (selectedStatus !== "ALL" && sub.currentCycle.status !== selectedStatus) {
          return false;
        }

        if (selectedSource !== "ALL" && sub.source !== selectedSource) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "dueDate") {
          const dA = a.currentCycle?.dueDate || "9999-99-99";
          const dB = b.currentCycle?.dueDate || "9999-99-99";
          return dA.localeCompare(dB);
        }
        if (sortBy === "amount") {
          const amtA = a.currentCycle?.statementTotal || a.defaultAmount || 0;
          const amtB = b.currentCycle?.statementTotal || b.defaultAmount || 0;
          return amtB - amtA;
        }
        if (sortBy === "name") {
          return a.name.localeCompare(b.name);
        }
        return 0;
      });
  }, [subscriptions, searchQuery, selectedCategory, selectedStatus, selectedSource, sortBy]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Search & Responsive Filter Bar */}
      <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-slate-900/70 p-4 sm:p-5 shadow-xl backdrop-blur-md">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5 sm:gap-4">
          {/* Search box */}
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search subscriptions, categories, notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-[42px] rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-xs sm:text-sm text-white placeholder-slate-400 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          {/* Filter Dropdowns and Layout Toggle */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* Category */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="min-h-[38px] flex-1 sm:flex-none rounded-xl sm:rounded-2xl border border-white/10 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 focus:border-cyan-400 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Status */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="min-h-[38px] flex-1 sm:flex-none rounded-xl sm:rounded-2xl border border-white/10 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 focus:border-cyan-400 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="UNPAID">Unpaid</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="FULLY_PAID">Fully Paid</option>
              <option value="MISMATCH_REVIEW">Review Needed</option>
              <option value="PAUSED">Paused</option>
            </select>

            {/* Source */}
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="min-h-[38px] flex-1 sm:flex-none rounded-xl sm:rounded-2xl border border-white/10 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 focus:border-cyan-400 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Sources</option>
              <option value="EMAIL_AUTOMATED">Gmail Auto</option>
              <option value="MANUAL">Manual</option>
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="min-h-[38px] flex-1 sm:flex-none rounded-xl sm:rounded-2xl border border-white/10 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 focus:border-cyan-400 focus:outline-none cursor-pointer"
            >
              <option value="dueDate">Due Date</option>
              <option value="amount">Amount</option>
              <option value="name">Name</option>
            </select>

            {/* Grid vs Table View Switcher */}
            <div className="hidden md:flex items-center rounded-xl sm:rounded-2xl border border-white/10 bg-slate-800/80 p-1">
              <button
                type="button"
                onClick={() => setLayoutMode("grid")}
                className={`p-1.5 rounded-lg transition ${
                  layoutMode === "grid"
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Grid View"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode("table")}
                className={`p-1.5 rounded-lg transition ${
                  layoutMode === "table"
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Table View"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Rendering: Grid or Responsive Table */}
      {filteredSubscriptions.length === 0 ? (
        <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-slate-900/60 p-8 sm:p-12 text-center backdrop-blur-md">
          <div className="mx-auto flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400">
            <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="mt-3 sm:mt-4 text-sm sm:text-base font-semibold text-white">No commitments matched</h3>
          <p className="mt-1 text-xs text-slate-400">
            Try adjusting your search criteria or add a new recurring commitment.
          </p>
        </div>
      ) : layoutMode === "table" ? (
        /* High-Density Responsive Table View */
        <div className="overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3.5">Account / Subscription</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Cycle & Source</th>
                  <th className="px-4 py-3.5">Due Date</th>
                  <th className="px-4 py-3.5 text-right">Statement Total</th>
                  <th className="px-4 py-3.5 text-right">Paid</th>
                  <th className="px-4 py-3.5 text-right">Balance</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium">
                {filteredSubscriptions.map((sub) => {
                  const isPrepaid =
                    Boolean(sub.isPrepaid) ||
                    sub.category === "Entertainment" ||
                    (!sub.dueDayOfMonth &&
                      sub.billingType === "BILL_GENERATED" &&
                      !sub.emailConfig?.paymentQuery);

                  const cycle = sub.currentCycle;
                  const total = cycle.statementTotal > 0 ? cycle.statementTotal : sub.defaultAmount;
                  const paid = isPrepaid ? total : cycle.paidAmount || 0;
                  const remaining = isPrepaid ? 0 : cycle.remainingBalance || Math.max(0, total - paid);
                  const isPaid = isPrepaid || cycle.status === "FULLY_PAID";
                  const isCopied = copiedId === sub.id;

                  return (
                    <tr key={sub.id} className="hover:bg-white/[0.02] transition">
                      <td className="px-4 py-3 font-semibold text-white">
                        <div className="flex items-center gap-3">
                          <SubscriptionAvatar
                            name={sub.name}
                            category={sub.category}
                            imageUrl={sub.imageUrl}
                            icon={sub.icon}
                            size="md"
                          />
                          <div className="flex items-center gap-1.5">
                            <span>{sub.name}</span>
                            {sub.source === "EMAIL_AUTOMATED" && (
                              <span className="rounded bg-indigo-500/20 px-1 py-0.2 text-[10px] text-indigo-300 font-mono">
                                AUTO
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{sub.category}</td>
                      <td className="px-4 py-3 text-slate-400">{sub.billingCycle}</td>
                      <td className="px-4 py-3 text-slate-200">
                        {isPrepaid ? (
                          <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] text-emerald-300 font-medium inline-flex items-center gap-1">
                            <span>⚡</span> Prepaid
                          </span>
                        ) : sub.isEndOfMonthDue ? (
                          <span className="text-cyan-300 text-xs">
                            End of Month ({formatDisplayDate(cycle.dueDate)})
                          </span>
                        ) : (
                          formatDisplayDate(cycle.dueDate)
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-white">
                        ₹{total.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400">
                        {cycle.status === "SKIPPED" ? (
                          <span className="text-slate-500 font-normal">—</span>
                        ) : (
                          `₹${paid.toLocaleString("en-IN")}`
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-300">
                        {isPrepaid || cycle.status === "SKIPPED" ? (
                          <span className="text-slate-500 font-normal">—</span>
                        ) : (
                          <span className={remaining > 0 ? "text-amber-400" : "text-slate-400"}>
                            ₹{remaining.toLocaleString("en-IN")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            cycle.status === "SKIPPED"
                              ? "bg-slate-800 text-slate-400 border border-white/10"
                              : isPrepaid
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : isPaid
                              ? "bg-emerald-500/20 text-emerald-300"
                              : cycle.status === "PARTIALLY_PAID"
                              ? "bg-sky-500/20 text-sky-300"
                              : cycle.status === "MISMATCH_REVIEW"
                              ? "bg-amber-500/20 text-amber-300 animate-pulse"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {cycle.status === "SKIPPED"
                            ? "⏭️ SKIPPED"
                            : isPrepaid
                            ? "⚡ PREPAID"
                            : cycle.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        {/* Copy Config JSON */}
                        <button
                          type="button"
                          onClick={() => handleCopySubConfig(sub)}
                          className={`rounded-lg px-2 py-1 text-[11px] font-medium transition cursor-pointer ${
                            isCopied
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-white/5 hover:bg-white/10 text-slate-300"
                          }`}
                          title={isCopied ? "Copied JSON!" : "Copy subscription config as JSON"}
                        >
                          {isCopied ? "✓ Copied" : "{ } Copy JSON"}
                        </button>

                        {sub.source === "EMAIL_AUTOMATED" && onViewSourceEmail && (
                          <button
                            type="button"
                            onClick={() => onViewSourceEmail(sub)}
                            className="rounded-lg bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/20 cursor-pointer"
                            title="View Archived Email in Storage"
                          >
                            ✉️
                          </button>
                        )}
                        {onViewHistory && (
                          <button
                            type="button"
                            onClick={() => onViewHistory(sub)}
                            className="rounded-lg bg-indigo-500/20 px-2 py-1 text-[11px] font-semibold text-indigo-300 hover:bg-indigo-500/30 cursor-pointer"
                            title="View Historical Ledger"
                          >
                            History 📜
                          </button>
                        )}
                        {!isPaid && (
                          <button
                            type="button"
                            onClick={() => onQuickMarkPaid(sub)}
                            className="rounded-lg bg-emerald-500/20 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/30 cursor-pointer"
                          >
                            Pay
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOverride(sub)}
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
                        >
                          Override
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(sub)}
                          className="rounded-lg p-1 text-slate-400 hover:text-white cursor-pointer"
                        >
                          ✎
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Adaptive Card Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5 xl:gap-6">
          {filteredSubscriptions.map((sub) => (
            <SubscriptionCard
              key={sub.id}
              subscription={sub}
              onEdit={onEdit}
              onOverride={onOverride}
              onDelete={onDelete}
              onQuickMarkPaid={onQuickMarkPaid}
              onSelect={onSelectSubscription}
              onTestParser={onTestParser}
              onViewHistory={onViewHistory}
              onViewSourceEmail={onViewSourceEmail}
            />
          ))}
        </div>
      )}
    </div>
  );
}
