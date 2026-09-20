"use client";

import React from "react";
import { AmazonSummary, AmazonOrderFilter } from "@/lib/amazon/types";
import {
  DollarSign,
  Package,
  TrendingUp,
  RotateCcw,
  BookOpen,
  Users,
  ArrowUpRight,
} from "lucide-react";

interface Props {
  summary: AmazonSummary | null;
  isLoading?: boolean;
  onFilterClick?: (filter: Partial<AmazonOrderFilter>) => void;
}

export function AmazonMetricCards({ summary, isLoading, onFilterClick }: Props) {
  const currencyFormatter = new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: "currency",
  });

  const topRecipient = summary?.recipientStats?.[0];

  const cards: Array<{
    title: string;
    value: string;
    subtext: string;
    icon: any;
    color: string;
    filter: Partial<AmazonOrderFilter>;
    hint: string;
  }> = [
    {
      title: "Total Spend",
      value: summary ? currencyFormatter.format(summary.totalSpend) : "—",
      subtext: summary?.dateRange?.start
        ? `${summary.dateRange.start} to ${summary.dateRange.end || "now"}`
        : "Across all uploaded orders",
      icon: DollarSign,
      color: "from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-300",
      filter: { type: undefined, month: undefined, recipient: undefined, search: undefined, offset: 0 },
      hint: "View all orders",
    },
    {
      title: "Total Orders",
      value: summary ? summary.totalOrders.toLocaleString("en-IN") : "—",
      subtext: summary ? `${summary.totalItems} individual items purchased` : "Orders placed",
      icon: Package,
      color: "from-cyan-500/20 to-blue-500/10 border-cyan-500/30 text-cyan-300",
      filter: { type: undefined, month: undefined, recipient: undefined, search: undefined, offset: 0 },
      hint: "View all orders",
    },
    {
      title: "Avg Order Value (AOV)",
      value: summary ? currencyFormatter.format(summary.averageOrderValue) : "—",
      subtext: "Per checkout transaction",
      icon: TrendingUp,
      color: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-300",
      filter: { offset: 0 },
      hint: "Explore orders",
    },
    {
      title: "Refunds Received",
      value: summary ? currencyFormatter.format(summary.totalRefunded) : "—",
      subtext: summary
        ? `${summary.refundedOrdersCount} refunded / returned orders`
        : "Returned items",
      icon: RotateCcw,
      color: "from-rose-500/20 to-red-500/10 border-rose-500/30 text-rose-300",
      filter: { type: "REFUNDED", offset: 0 },
      hint: "View refunded orders",
    },
    {
      title: "Kindle Unlimited",
      value: summary ? `${summary.kindleOrdersCount} Cycles` : "—",
      subtext: summary
        ? `${currencyFormatter.format(summary.kindleTotalSpend)} total spend`
        : "₹169/month plan",
      icon: BookOpen,
      color: "from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-300",
      filter: { type: "KINDLE", offset: 0 },
      hint: "View Kindle orders",
    },
    {
      title: "Primary Recipient",
      value: topRecipient ? topRecipient.recipient : "—",
      subtext: topRecipient
        ? `${currencyFormatter.format(topRecipient.spend)} (${topRecipient.ordersCount} orders)`
        : "Delivery address",
      icon: Users,
      color: "from-fuchsia-500/20 to-pink-500/10 border-fuchsia-500/30 text-fuchsia-300",
      filter: topRecipient ? { recipient: topRecipient.recipient, offset: 0 } : {},
      hint: topRecipient ? `Filter by ${topRecipient.recipient}` : "View recipient orders",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        const isClickable = Boolean(onFilterClick && summary && summary.totalOrders > 0);

        return (
          <div
            key={idx}
            onClick={() => isClickable && onFilterClick?.(card.filter)}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={(e) => {
              if (isClickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onFilterClick?.(card.filter);
              }
            }}
            title={isClickable ? `${card.hint} (Click through to filtered listing)` : undefined}
            className={`group relative flex flex-col justify-between rounded-3xl border bg-gradient-to-br p-5 shadow-lg backdrop-blur-sm transition ${
              isClickable
                ? "cursor-pointer hover:scale-[1.03] hover:shadow-2xl hover:border-white/30"
                : ""
            } ${card.color}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {card.title}
              </span>
              <div className="flex items-center gap-1 rounded-xl bg-white/5 p-2 text-current transition group-hover:bg-white/10">
                <Icon className="h-4 w-4" />
                {isClickable && (
                  <ArrowUpRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
                )}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                {isLoading ? (
                  <div className="h-7 w-24 animate-pulse rounded bg-white/10" />
                ) : (
                  card.value
                )}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                <p className="line-clamp-1 flex-1">
                  {card.subtext}
                </p>
                {isClickable && (
                  <span className="shrink-0 text-[10px] font-semibold text-white/50 opacity-0 group-hover:opacity-100 transition ml-1">
                    Filter →
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
