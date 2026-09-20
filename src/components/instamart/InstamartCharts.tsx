"use client";

import React, { useState } from "react";
import {
  InstamartCategoryStat,
  InstamartMonthlySpend,
} from "@/lib/instamart/types";
import {
  BarChart3,
  PieChart,
  Calendar,
  Clock,
  Sparkles,
} from "lucide-react";

interface InstamartChartsProps {
  monthlySpend: InstamartMonthlySpend[];
  categories: InstamartCategoryStat[];
  dayOfWeekBreakdown: Array<{ day: string; count: number; spend: number }>;
  timeSlotBreakdown: Array<{ slot: string; count: number; spend: number }>;
  onSelectMonth?: (month: string) => void;
  onSelectCategory?: (category: string) => void;
}

const CATEGORY_COLORS: Record<string, { bar: string; text: string; bg: string }> = {
  "Vegetables & Fruits": {
    bar: "bg-emerald-500",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10 border-emerald-500/30",
  },
  "Dairy, Bread & Eggs": {
    bar: "bg-amber-400",
    text: "text-amber-300",
    bg: "bg-amber-500/10 border-amber-500/30",
  },
  "Instant Food & Noodles": {
    bar: "bg-orange-500",
    text: "text-orange-300",
    bg: "bg-orange-500/10 border-orange-500/30",
  },
  "Snacks & Munchies": {
    bar: "bg-rose-500",
    text: "text-rose-300",
    bg: "bg-rose-500/10 border-rose-500/30",
  },
  "Pantry & Cooking Essentials": {
    bar: "bg-cyan-500",
    text: "text-cyan-300",
    bg: "bg-cyan-500/10 border-cyan-500/30",
  },
  "Baby & Child Care": {
    bar: "bg-indigo-500",
    text: "text-indigo-300",
    bg: "bg-indigo-500/10 border-indigo-500/30",
  },
  "Beverages & Drinks": {
    bar: "bg-sky-500",
    text: "text-sky-300",
    bg: "bg-sky-500/10 border-sky-500/30",
  },
  "Personal Care & Grooming": {
    bar: "bg-pink-500",
    text: "text-pink-300",
    bg: "bg-pink-500/10 border-pink-500/30",
  },
  "Household & Cleaning": {
    bar: "bg-teal-500",
    text: "text-teal-300",
    bg: "bg-teal-500/10 border-teal-500/30",
  },
  Other: {
    bar: "bg-slate-400",
    text: "text-slate-300",
    bg: "bg-slate-700/30 border-slate-600",
  },
};

export function InstamartCharts({
  monthlySpend,
  categories,
  dayOfWeekBreakdown,
  timeSlotBreakdown,
  onSelectMonth,
  onSelectCategory,
}: InstamartChartsProps) {
  const [hoveredMonth, setHoveredMonth] = useState<InstamartMonthlySpend | null>(
    null
  );

  const maxMonthlySpend = Math.max(
    ...monthlySpend.map((m) => m.spend),
    1
  );

  const totalMonthlySpend = monthlySpend.reduce((acc, m) => acc + m.spend, 0);
  const avgMonthlySpend =
    monthlySpend.length > 0 ? totalMonthlySpend / monthlySpend.length : 0;

  const maxDaySpend = Math.max(...dayOfWeekBreakdown.map((d) => d.spend), 1);
  const maxSlotSpend = Math.max(...timeSlotBreakdown.map((s) => s.spend), 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      {/* 1. Monthly Spend Trend Chart (2 columns wide) */}
      <div className="lg:col-span-2 rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6 shadow-xl backdrop-blur-md flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Monthly Grocery Spend
              </h3>
            </div>
            <div className="text-right text-xs">
              <span className="text-slate-400">Avg Monthly: </span>
              <span className="font-bold text-white font-mono">
                ₹{avgMonthlySpend.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>

          {/* Inspector strip on hover */}
          <div className="h-9 mt-2 flex items-center px-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-slate-300">
            {hoveredMonth ? (
              <div className="flex items-center gap-4 w-full justify-between">
                <span className="font-semibold text-white">
                  {hoveredMonth.displayMonth}:
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-orange-300 font-mono font-bold">
                    ₹{hoveredMonth.spend.toLocaleString("en-IN")}
                  </span>
                  <span className="text-slate-400">
                    {hoveredMonth.orderCount} orders
                  </span>
                  <span className="text-slate-400">
                    {hoveredMonth.itemCount} items
                  </span>
                </div>
              </div>
            ) : (
              <span className="text-slate-500 text-[11px] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                Hover over bars to inspect monthly grocery details
              </span>
            )}
          </div>

          {/* Bar Chart Canvas */}
          <div className="mt-4 pt-6 h-56 flex items-end gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {monthlySpend.map((m) => {
              const heightPercent = Math.max(
                10,
                Math.round((m.spend / maxMonthlySpend) * 100)
              );
              const isHovered = hoveredMonth?.month === m.month;

              return (
                <div
                  key={m.month}
                  onClick={() => onSelectMonth?.(m.month)}
                  className={`flex-1 min-w-[48px] max-w-[80px] flex flex-col items-center gap-2 group ${
                    onSelectMonth ? "cursor-pointer transition hover:scale-105" : ""
                  }`}
                  onMouseEnter={() => setHoveredMonth(m)}
                  onMouseLeave={() => setHoveredMonth(null)}
                  title={onSelectMonth ? `Click to filter orders for ${m.displayMonth}` : undefined}
                >
                  <div className="text-[10px] font-mono text-slate-400 group-hover:text-orange-300 font-semibold transition">
                    ₹{m.spend > 1000 ? `${(m.spend / 1000).toFixed(1)}k` : m.spend}
                  </div>

                  <div className="w-full h-40 flex items-end justify-center rounded-xl bg-slate-800/40 p-1">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-lg transition-all duration-300 ${
                        isHovered
                          ? "bg-gradient-to-t from-orange-600 to-orange-400 shadow-lg shadow-orange-500/30 scale-[1.03]"
                          : "bg-gradient-to-t from-orange-600/70 to-amber-500/80 group-hover:from-orange-500 group-hover:to-amber-400"
                      }`}
                    />
                  </div>

                  <div className="text-[11px] font-medium text-slate-400 group-hover:text-white truncate">
                    {m.displayMonth.split(" ")[0]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Category Spend Breakdown (1 column wide) */}
      <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6 shadow-xl backdrop-blur-md flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 pb-3 border-b border-white/5">
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <PieChart className="w-4 h-4" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Spend by Category
            </h3>
          </div>

          <div className="mt-4 space-y-3 max-h-[290px] overflow-y-auto pr-1 scrollbar-thin">
            {categories.slice(0, 8).map((cat) => {
              const col = CATEGORY_COLORS[cat.category] || CATEGORY_COLORS.Other;

              return (
                <div
                  key={cat.category}
                  onClick={() => onSelectCategory?.(cat.category)}
                  role={onSelectCategory ? "button" : undefined}
                  tabIndex={onSelectCategory ? 0 : undefined}
                  title={onSelectCategory ? `Click to filter orders in ${cat.category}` : undefined}
                  className={`space-y-1 p-1.5 rounded-xl transition ${
                    onSelectCategory ? "cursor-pointer hover:bg-white/5 active:scale-[0.99]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white truncate max-w-[170px]" title={cat.category}>
                      {cat.category}
                    </span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-400 text-[11px]">
                        {cat.percentage}%
                      </span>
                      <span className="font-bold text-white">
                        ₹{cat.spend.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, Math.max(3, cat.percentage))}%` }}
                      className={`h-full rounded-full ${col.bar}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Day of Week Buying Pattern */}
      <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2 pb-3 border-b border-white/5">
          <div className="h-7 w-7 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
            <Calendar className="w-4 h-4" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
            Orders by Day of Week
          </h3>
        </div>

        <div className="mt-4 space-y-2.5">
          {dayOfWeekBreakdown.map((d) => {
            const widthPct = Math.max(5, Math.round((d.spend / maxDaySpend) * 100));

            return (
              <div key={d.day} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">{d.day}</span>
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-slate-400">{d.count} orders</span>
                    <span className="font-bold text-cyan-300">
                      ₹{d.spend.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    style={{ width: `${widthPct}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Time Slot Distribution (2 columns on large) */}
      <div className="lg:col-span-2 rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2 pb-3 border-b border-white/5">
          <div className="h-7 w-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <Clock className="w-4 h-4" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
            Order Time of Day Distribution
          </h3>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {timeSlotBreakdown.map((s) => {
            return (
              <div
                key={s.slot}
                className="rounded-2xl border border-white/5 bg-white/[0.02] p-3.5 flex flex-col justify-between"
              >
                <div>
                  <span className="text-xs font-semibold text-slate-300 block">
                    {s.slot}
                  </span>
                  <span className="text-lg font-extrabold text-white mt-1 block font-mono">
                    ₹{s.spend.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-white/5 pt-2">
                  <span>{s.count} orders</span>
                  <span className="text-indigo-400 font-medium">
                    {s.count > 0 ? `~₹${Math.round(s.spend / s.count)} / order` : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
