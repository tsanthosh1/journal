"use client";

import React from "react";
import Link from "next/link";
import { AmazonSummary, AmazonOrderFilter } from "@/lib/amazon/types";
import {
  Calendar,
  Users,
  CreditCard,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Filter,
} from "lucide-react";

interface Props {
  summary: AmazonSummary;
  isKindleLinked: boolean;
  isLinkingKindle: boolean;
  onLinkKindle: () => void;
  onSelectFilter?: (filter: Partial<AmazonOrderFilter>) => void;
}

export function AmazonInsights({
  summary,
  isKindleLinked,
  isLinkingKindle,
  onLinkKindle,
  onSelectFilter,
}: Props) {
  const currencyFormatter = new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    style: "currency",
  });

  const maxMonthSpend = Math.max(
    ...summary.monthlyStats.map((m) => m.spend),
    1,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Kindle Unlimited Subscription Spotlight */}
      <div className="relative overflow-hidden rounded-4xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-slate-900/90 to-indigo-950/40 p-6 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 shadow-md">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-white">
                  Amazon Kindle Unlimited Subscription
                </h3>
                <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                  Active Monthly Plan
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                Detected <strong>{summary.kindleOrdersCount} billing cycles</strong> in your order history ({currencyFormatter.format(summary.kindleTotalSpend)} total). Automatically debited on the <strong>17th of each month</strong> at ₹169.00/mo.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {summary.kindleOrdersCount > 0 && onSelectFilter ? (
              <button
                type="button"
                onClick={() => onSelectFilter({ type: "KINDLE", offset: 0 })}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-400/20"
                title="View Kindle Unlimited order history"
              >
                <span>View {summary.kindleOrdersCount} Cycles</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : null}

            {isKindleLinked ? (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Linked to Subscriptions</span>
                <Link
                  href="/subscriptions"
                  className="ml-1 inline-flex items-center text-xs font-semibold text-cyan-300 hover:underline"
                >
                  View Tracker <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            ) : (
              <button
                type="button"
                onClick={onLinkKindle}
                disabled={isLinkingKindle}
                className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BookOpen className="h-4 w-4" />
                {isLinkingKindle ? "Linking to Subscriptions..." : "Link to Subscriptions Tracking"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid of Analytics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Monthly Spending Trend */}
        <div className="flex flex-col rounded-4xl border border-white/10 bg-slate-900/80 p-6 shadow-xl backdrop-blur-md lg:col-span-2">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-cyan-400/10 p-2 text-cyan-300">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  Monthly Spend Trends
                </h3>
                <p className="text-xs text-slate-400">
                  Spending volume across {summary.monthlyStats.length} calendar months • Click any month to view orders
                </p>
              </div>
            </div>
            <span className="text-xs font-medium text-slate-400">
              Peak: {currencyFormatter.format(maxMonthSpend)}
            </span>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            {summary.monthlyStats.map((item) => {
              const pct = Math.max(Math.round((item.spend / maxMonthSpend) * 100), 4);
              return (
                <div
                  key={item.month}
                  onClick={() => onSelectFilter?.({ month: item.month, offset: 0 })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectFilter?.({ month: item.month, offset: 0 });
                    }
                  }}
                  title={`Click to filter orders for ${item.formattedMonth}`}
                  className="group flex flex-col gap-1.5 cursor-pointer rounded-2xl p-2.5 transition hover:bg-white/5 active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200 group-hover:text-amber-300 transition flex items-center gap-1.5">
                      {item.formattedMonth}
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition" />
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-slate-400 group-hover:bg-white/10 group-hover:text-slate-200">
                        {item.ordersCount} {item.ordersCount === 1 ? "order" : "orders"}
                      </span>
                      <span className="font-bold text-white group-hover:text-amber-200">
                        {currencyFormatter.format(item.spend)}
                      </span>
                    </div>
                  </div>

                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 via-cyan-400 to-emerald-400 transition-all duration-500 group-hover:brightness-125"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recipient & Payment Method Breakdown */}
        <div className="flex flex-col gap-6">
          {/* Recipient Distribution */}
          <div className="flex flex-col rounded-4xl border border-white/10 bg-slate-900/80 p-6 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <div className="rounded-xl bg-fuchsia-400/10 p-2 text-fuchsia-300">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  Recipient Breakdown
                </h3>
                <p className="text-xs text-slate-400">
                  Click a recipient to filter their orders
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              {summary.recipientStats.map((item) => {
                const pct =
                  summary.totalSpend > 0
                    ? Math.round((item.spend / summary.totalSpend) * 100)
                    : 0;
                return (
                  <div
                    key={item.recipient}
                    onClick={() => onSelectFilter?.({ recipient: item.recipient, offset: 0 })}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectFilter?.({ recipient: item.recipient, offset: 0 });
                      }
                    }}
                    title={`Click to filter orders for ${item.recipient}`}
                    className="group flex flex-col gap-1.5 cursor-pointer rounded-2xl border border-white/5 bg-white/2 p-3 transition hover:border-fuchsia-400/40 hover:bg-white/5 active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white group-hover:text-fuchsia-300 transition flex items-center gap-1.5">
                        {item.recipient}
                        <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition" />
                      </span>
                      <span className="text-slate-400 group-hover:text-slate-200">
                        {item.ordersCount} orders ({pct}%)
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-fuchsia-400 group-hover:bg-fuchsia-300 transition"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="font-bold text-fuchsia-200">
                        {currencyFormatter.format(item.spend)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment Methods */}
          <div className="flex flex-col rounded-4xl border border-white/10 bg-slate-900/80 p-6 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <div className="rounded-xl bg-teal-400/10 p-2 text-teal-300">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  Payment Instruments
                </h3>
                <p className="text-xs text-slate-400">
                  Click to search orders by payment method
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              {summary.paymentStats.slice(0, 6).map((item) => (
                <div
                  key={item.method}
                  onClick={() => onSelectFilter?.({ search: item.method, offset: 0 })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectFilter?.({ search: item.method, offset: 0 });
                    }
                  }}
                  title={`Click to search orders paid with ${item.method}`}
                  className="group flex items-center justify-between cursor-pointer rounded-2xl border border-white/5 bg-white/2 p-3 text-xs transition hover:border-teal-400/40 hover:bg-white/5 active:scale-[0.99]"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-200 group-hover:text-teal-300 transition flex items-center gap-1.5">
                      {item.method}
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition" />
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {item.ordersCount} {item.ordersCount === 1 ? "order" : "orders"}
                    </span>
                  </div>
                  <span className="font-bold text-teal-200">
                    {currencyFormatter.format(item.spend)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
