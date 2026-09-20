"use client";

import React, { useState } from "react";
import {
  SwiggyCuisine,
  SwiggyMonthlySpend,
  SwiggyRestaurantStat,
} from "@/lib/swiggy/types";
import {
  BarChart3,
  Store,
  Clock,
  Calendar,
  Sparkles,
  Utensils,
} from "lucide-react";

interface SwiggyChartsProps {
  monthlySpend: SwiggyMonthlySpend[];
  topRestaurants: SwiggyRestaurantStat[];
  cuisineBreakdown: Array<{
    cuisine: SwiggyCuisine;
    count: number;
    spend: number;
    percentage: number;
  }>;
  dayOfWeekBreakdown: Array<{ day: string; count: number; spend: number }>;
  timeSlotBreakdown: Array<{ slot: string; count: number; spend: number }>;
  onSelectMonth?: (month: string) => void;
  onSelectRestaurant?: (restaurant: string) => void;
}

const CUISINE_COLORS: Record<string, { bar: string; text: string; bg: string }> = {
  "Biryani & Rice": {
    bar: "bg-amber-500",
    text: "text-amber-300",
    bg: "bg-amber-500/10 border-amber-500/30",
  },
  "South Indian": {
    bar: "bg-emerald-500",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10 border-emerald-500/30",
  },
  "North Indian": {
    bar: "bg-orange-500",
    text: "text-orange-300",
    bg: "bg-orange-500/10 border-orange-500/30",
  },
  "Chinese & Asian": {
    bar: "bg-rose-500",
    text: "text-rose-300",
    bg: "bg-rose-500/10 border-rose-500/30",
  },
  "Fast Food & Burgers": {
    bar: "bg-red-500",
    text: "text-red-300",
    bg: "bg-red-500/10 border-red-500/30",
  },
  "Pizza & Italian": {
    bar: "bg-yellow-500",
    text: "text-yellow-300",
    bg: "bg-yellow-500/10 border-yellow-500/30",
  },
  "Desserts & Bakery": {
    bar: "bg-purple-500",
    text: "text-purple-300",
    bg: "bg-purple-500/10 border-purple-500/30",
  },
  "Beverages & Juices": {
    bar: "bg-sky-500",
    text: "text-sky-300",
    bg: "bg-sky-500/10 border-sky-500/30",
  },
  "Arabian & BBQ": {
    bar: "bg-indigo-500",
    text: "text-indigo-300",
    bg: "bg-indigo-500/10 border-indigo-500/30",
  },
  "Snacks & Chaat": {
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

export function SwiggyCharts({
  monthlySpend,
  topRestaurants,
  cuisineBreakdown,
  dayOfWeekBreakdown,
  timeSlotBreakdown,
  onSelectMonth,
  onSelectRestaurant,
}: SwiggyChartsProps) {
  const [hoveredMonth, setHoveredMonth] = useState<SwiggyMonthlySpend | null>(null);

  const maxMonthlySpend = Math.max(
    ...monthlySpend.map((m) => m.spend),
    1
  );

  const totalMonthlySpend = monthlySpend.reduce((acc, m) => acc + m.spend, 0);
  const avgMonthlySpend =
    monthlySpend.length > 0 ? totalMonthlySpend / monthlySpend.length : 0;

  const maxRestaurantSpend = Math.max(
    ...topRestaurants.map((r) => r.totalSpend),
    1
  );

  const maxDaySpend = Math.max(...dayOfWeekBreakdown.map((d) => d.spend), 1);
  const maxSlotSpend = Math.max(...timeSlotBreakdown.map((s) => s.spend), 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      {/* 1. Monthly Spend Trend (2 cols wide) */}
      <div className="lg:col-span-2 rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6 shadow-xl backdrop-blur-md flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Monthly Food Spend Trend
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
                  {hoveredMonth.discounts > 0 && (
                    <span className="text-rose-400">
                      ₹{hoveredMonth.discounts} saved
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-slate-500 text-[11px] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                Hover over bars to inspect monthly restaurant spend
              </span>
            )}
          </div>

          {/* Bar Canvas */}
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
                  <span
                    className={`text-[10px] font-mono transition-opacity duration-150 ${
                      isHovered ? "opacity-100 text-orange-300 font-bold" : "opacity-0 group-hover:opacity-100 text-slate-400"
                    }`}
                  >
                    ₹{Math.round(m.spend / 1000)}k
                  </span>

                  <div className="w-full flex items-end justify-center h-36">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full max-w-[32px] rounded-t-lg transition-all duration-200 ${
                        isHovered
                          ? "bg-gradient-to-t from-orange-600 to-amber-400 shadow-lg shadow-orange-500/30 scale-x-105"
                          : "bg-gradient-to-t from-slate-800 to-orange-500/60 hover:to-orange-400"
                      }`}
                    />
                  </div>

                  <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap group-hover:text-white transition-colors">
                    {m.displayMonth.split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
          <span>{monthlySpend.length} active months</span>
          <span>
            Total:{" "}
            <strong className="text-white font-mono">
              ₹{totalMonthlySpend.toLocaleString("en-IN")}
            </strong>
          </span>
        </div>
      </div>

      {/* 2. Top Restaurants Leaderboard (1 col) */}
      <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6 shadow-xl backdrop-blur-md flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 pb-3 border-b border-white/5">
            <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Store className="w-4 h-4" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Top Restaurants
            </h3>
          </div>

          <div className="mt-3 space-y-2.5 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
            {topRestaurants.slice(0, 8).map((rest, idx) => {
              const pct = Math.round((rest.totalSpend / maxRestaurantSpend) * 100);

              return (
                <div
                  key={rest.name}
                  onClick={() => onSelectRestaurant?.(rest.name)}
                  role={onSelectRestaurant ? "button" : undefined}
                  tabIndex={onSelectRestaurant ? 0 : undefined}
                  title={onSelectRestaurant ? `Click to filter orders from ${rest.name}` : undefined}
                  className={`p-2 rounded-xl bg-white/[0.02] border border-white/5 transition-colors ${
                    onSelectRestaurant ? "cursor-pointer hover:bg-white/[0.08] hover:border-amber-500/40" : "hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono text-slate-500 w-4">
                        #{idx + 1}
                      </span>
                      <span
                        className="font-medium text-slate-200 truncate max-w-[140px] sm:max-w-[170px]"
                        title={rest.name}
                      >
                        {rest.name}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-amber-300">
                        ₹{rest.totalSpend.toLocaleString("en-IN")}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-1.5">
                        ({rest.orderCount})
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className="h-full bg-gradient-to-r from-amber-600 to-orange-400 rounded-full"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-3 border-t border-white/5 text-[11px] text-slate-400 flex items-center justify-between">
          <span>{topRestaurants.length} unique eateries</span>
          <span>Ranked by orders & spend</span>
        </div>
      </div>

      {/* 3. Cuisine Breakdown (1 col) */}
      <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2 pb-3 border-b border-white/5">
          <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <Utensils className="w-4 h-4" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
            Favorite Cuisines
          </h3>
        </div>

        <div className="mt-3 space-y-2.5">
          {cuisineBreakdown.slice(0, 6).map((c) => {
            const styling =
              CUISINE_COLORS[c.cuisine] || CUISINE_COLORS["Other"];

            return (
              <div key={c.cuisine} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">
                    {c.cuisine}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white">
                      ₹{c.spend.toLocaleString("en-IN")}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      ({c.percentage}%)
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    style={{ width: `${Math.min(100, c.percentage)}%` }}
                    className={`h-full rounded-full ${styling.bar}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Dining Time Slots (1 col) */}
      <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2 pb-3 border-b border-white/5">
          <div className="h-7 w-7 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
            <Clock className="w-4 h-4" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
            Dining Time Slots
          </h3>
        </div>

        <div className="mt-3 space-y-2.5">
          {timeSlotBreakdown.map((slot) => {
            const pct = Math.round((slot.spend / maxSlotSpend) * 100);

            return (
              <div key={slot.slot} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 truncate max-w-[170px]">
                    {slot.slot}
                  </span>
                  <span className="font-mono text-cyan-300 font-bold">
                    {slot.count} orders
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    style={{ width: `${pct}%` }}
                    className="h-full rounded-full bg-cyan-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Day of Week Habits (1 col) */}
      <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2 pb-3 border-b border-white/5">
          <div className="h-7 w-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <Calendar className="w-4 h-4" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
            Orders by Day of Week
          </h3>
        </div>

        <div className="mt-3 space-y-2">
          {dayOfWeekBreakdown.map((d) => {
            const pct = Math.round((d.spend / maxDaySpend) * 100);

            return (
              <div key={d.day} className="flex items-center gap-2 text-xs">
                <span className="w-10 text-slate-400 font-medium text-[11px]">
                  {d.day.slice(0, 3)}
                </span>
                <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    style={{ width: `${pct}%` }}
                    className="h-full rounded-full bg-indigo-500"
                  />
                </div>
                <span className="font-mono text-slate-300 text-[11px] w-14 text-right">
                  {d.count} ord
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
