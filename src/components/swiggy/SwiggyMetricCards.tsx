"use client";

import React from "react";
import { SwiggySummary } from "@/lib/swiggy/types";
import { formatDateRange } from "@/lib/dateFormatting";
import {
  UtensilsCrossed,
  Calendar,
  Receipt,
  TrendingUp,
  Store,
  Tag,
  Sparkles,
  Flame,
} from "lucide-react";

interface SwiggyMetricCardsProps {
  summary: SwiggySummary;
  onSelectFilter?: (filter: { month?: string; restaurant?: string }) => void;
}

export function SwiggyMetricCards({ summary, onSelectFilter }: SwiggyMetricCardsProps) {
  const {
    totalSpend,
    totalOrders,
    averageOrderValue,
    averageMonthlySpend,
    totalSavings,
    firstOrderDate,
    latestOrderDate,
    monthlySpend = [],
    topRestaurants = [],
  } = summary;

  const activeMonths = monthlySpend.length || 1;
  const avgOrdersPerMonth =
    monthlySpend.length > 0
      ? (totalOrders / monthlySpend.length).toFixed(1)
      : "0";

  const topRest = topRestaurants[0];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
      {/* 1. Total Spend */}
      <div
        onClick={() => onSelectFilter?.({ month: undefined, restaurant: undefined })}
        role={onSelectFilter ? "button" : undefined}
        title={onSelectFilter ? "Click to view all orders" : undefined}
        className={`relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-orange-950/20 p-4 sm:p-5 shadow-xl backdrop-blur-md ${
          onSelectFilter ? "cursor-pointer transition hover:scale-[1.03] hover:border-orange-500/40" : ""
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-orange-400">
            Total Spend
          </span>
          <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
            <UtensilsCrossed className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 sm:mt-4 flex items-baseline gap-1.5">
          <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono">
            ₹{totalSpend.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div
          className="mt-2 text-[11px] text-slate-400 truncate"
          title={
            formatDateRange(firstOrderDate, latestOrderDate) || "All lifetime orders"
          }
        >
          {formatDateRange(firstOrderDate, latestOrderDate) || "All lifetime food deliveries"}
        </div>
      </div>

      {/* 2. Avg Monthly */}
      <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-emerald-950/20 p-4 sm:p-5 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Avg Monthly
          </span>
          <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <Calendar className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 sm:mt-4 flex items-baseline gap-1.5">
          <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono">
            ₹{averageMonthlySpend.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
          <span className="text-xs text-slate-400">/ mo</span>
        </div>
        <div
          className="mt-2 text-[11px] text-slate-400 truncate"
          title={`Across ${activeMonths} active ordering months`}
        >
          Across {activeMonths} active {activeMonths === 1 ? "month" : "months"}
        </div>
      </div>

      {/* 3. Total Orders */}
      <div
        onClick={() => onSelectFilter?.({ month: undefined, restaurant: undefined })}
        role={onSelectFilter ? "button" : undefined}
        title={onSelectFilter ? "Click to view all orders" : undefined}
        className={`relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-cyan-950/20 p-4 sm:p-5 shadow-xl backdrop-blur-md ${
          onSelectFilter ? "cursor-pointer transition hover:scale-[1.03] hover:border-cyan-500/40" : ""
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-cyan-300">
            Total Orders
          </span>
          <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
            <Receipt className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 sm:mt-4 flex items-baseline gap-1.5">
          <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono">
            {totalOrders}
          </span>
          <span className="text-xs text-slate-400">orders</span>
        </div>
        <div
          className="mt-2 text-[11px] text-emerald-400 flex items-center gap-1 font-medium truncate"
          title={`~${avgOrdersPerMonth} orders per month`}
        >
          <Sparkles className="w-3 h-3 shrink-0" />
          <span>~{avgOrdersPerMonth} orders / mo</span>
        </div>
      </div>

      {/* 4. Average Order Value (AOV) */}
      <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-blue-950/20 p-4 sm:p-5 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-blue-400">
            Avg Order Value
          </span>
          <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 sm:mt-4 flex items-baseline gap-1.5">
          <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono">
            ₹{averageOrderValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
          <span className="text-xs text-slate-400">/ order</span>
        </div>
        <div className="mt-2 text-[11px] text-slate-400 truncate">
          Typical restaurant meal
        </div>
      </div>

      {/* 5. Top Restaurant */}
      <div
        onClick={() => topRest && onSelectFilter?.({ restaurant: topRest.name })}
        role={topRest && onSelectFilter ? "button" : undefined}
        title={topRest && onSelectFilter ? `Click to filter orders from ${topRest.name}` : undefined}
        className={`relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-amber-950/20 p-4 sm:p-5 shadow-xl backdrop-blur-md ${
          topRest && onSelectFilter ? "cursor-pointer transition hover:scale-[1.03] hover:border-amber-500/40" : ""
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-amber-400">
            Top Restaurant
          </span>
          <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <Store className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 sm:mt-4 flex items-baseline gap-1.5">
          <span
            className="text-lg sm:text-xl font-extrabold tracking-tight text-white truncate max-w-full"
            title={topRest?.name || "No orders yet"}
          >
            {topRest ? topRest.name : "—"}
          </span>
        </div>
        <div className="mt-2 text-[11px] text-amber-300/80 flex items-center gap-1 font-medium truncate">
          <Flame className="w-3 h-3 shrink-0 text-amber-400" />
          <span>
            {topRest ? `${topRest.orderCount} orders · ₹${topRest.totalSpend.toLocaleString("en-IN")}` : "0 orders"}
          </span>
        </div>
      </div>

      {/* 6. Total Savings & Coupons */}
      <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-rose-950/20 p-4 sm:p-5 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-rose-400">
            Total Savings
          </span>
          <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
            <Tag className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 sm:mt-4 flex items-baseline gap-1.5">
          <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono">
            ₹{totalSavings.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="mt-2 text-[11px] text-rose-300/80 truncate">
          Discounts & coupons applied
        </div>
      </div>
    </div>
  );
}
