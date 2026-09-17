"use client";

import React, { useState } from "react";
import { GcpDailySpend } from "@/lib/gcpBilling/types";
import { Calendar, DollarSign, ArrowUpRight } from "lucide-react";

interface DailyBurnChartProps {
  data: GcpDailySpend[];
  currency: string;
}

export function DailyBurnChart({ data, currency }: DailyBurnChartProps) {
  const [hoveredDay, setHoveredDay] = useState<GcpDailySpend | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center backdrop-blur-md">
        <Calendar className="h-8 w-8 text-slate-500 mb-2" />
        <p className="text-sm font-medium text-slate-400">No daily spend records found for this period</p>
      </div>
    );
  }

  // Find max value to scale bars properly
  const maxNetCost = Math.max(...data.map((d) => Math.max(d.cost, d.netCost, 1)));
  const totalCost = data.reduce((acc, d) => acc + d.netCost, 0);
  const avgDailyCost = totalCost / data.length;

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-white/10">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>Daily Spend & Burn Rate</span>
            <span className="text-xs font-normal text-slate-400">({data.length} days)</span>
          </h3>
          <p className="text-xs text-slate-400">
            Avg Daily Burn: <span className="font-semibold text-cyan-400">{currency} {avgDailyCost.toFixed(2)}</span>
          </p>
        </div>

        {hoveredDay ? (
          <div className="flex items-center gap-3 text-xs bg-slate-800/80 border border-white/10 px-3 py-1.5 rounded-xl">
            <span className="font-semibold text-slate-300">{hoveredDay.date}</span>
            <span className="text-slate-400">|</span>
            <span className="text-cyan-300 font-bold">Gross: {currency} {hoveredDay.cost.toFixed(2)}</span>
            {hoveredDay.credits > 0 && (
              <span className="text-emerald-400 font-semibold">Credits: -{currency} {hoveredDay.credits.toFixed(2)}</span>
            )}
            <span className="text-white font-extrabold">Net: {currency} {hoveredDay.netCost.toFixed(2)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-cyan-600 to-cyan-400"></span>
              <span>Net Cost</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/60"></span>
              <span>Credits</span>
            </div>
          </div>
        )}
      </div>

      {/* Chart Canvas / Bar Visualization */}
      <div className="relative mt-6 flex h-52 items-end gap-1 sm:gap-2 pt-6">
        {/* Horizontal reference line for average */}
        <div
          className="absolute left-0 right-0 border-t border-dashed border-cyan-500/30 z-0 pointer-events-none"
          style={{
            bottom: `${Math.min(100, Math.max(10, (avgDailyCost / maxNetCost) * 100))}%`,
          }}
        >
          <span className="absolute right-0 -top-4 text-[10px] text-cyan-400/80 bg-slate-950/80 px-1 rounded">
            avg {currency} {avgDailyCost.toFixed(0)}
          </span>
        </div>

        {data.map((day) => {
          const heightPercent = Math.max(4, (day.netCost / maxNetCost) * 100);
          const creditPercent = day.cost > 0 ? (day.credits / maxNetCost) * 100 : 0;
          const isHovered = hoveredDay?.date === day.date;

          // Format day label: e.g. "15" or "09-15"
          const dayNumber = day.date.split("-").slice(1).join("/");

          return (
            <div
              key={day.date}
              className="group relative flex flex-1 flex-col items-center h-full justify-end cursor-pointer z-10"
              onMouseEnter={() => setHoveredDay(day)}
              onMouseLeave={() => setHoveredDay(null)}
            >
              {/* Tooltip on top */}
              {isHovered && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-950 px-2 py-1 text-[10px] font-bold text-cyan-300 shadow-xl border border-cyan-500/40 z-30">
                  {currency} {day.netCost.toFixed(2)}
                </div>
              )}

              {/* Bar Stack */}
              <div className="w-full max-w-[28px] flex flex-col justify-end items-center h-full">
                {/* Credit indicator bar if any */}
                {creditPercent > 0 && (
                  <div
                    style={{ height: `${creditPercent}%` }}
                    className="w-full rounded-t-sm bg-emerald-500/40 transition-all group-hover:bg-emerald-400/60"
                  />
                )}
                {/* Net Cost bar */}
                <div
                  style={{ height: `${heightPercent}%` }}
                  className={`w-full rounded-t-md transition-all duration-200 ${
                    isHovered
                      ? "bg-gradient-to-t from-cyan-400 to-cyan-200 shadow-lg shadow-cyan-500/30 scale-105"
                      : "bg-gradient-to-t from-cyan-600/80 to-cyan-400/90 group-hover:from-cyan-500 group-hover:to-cyan-300"
                  }`}
                />
              </div>

              {/* Date label at bottom */}
              <span
                className={`mt-2 text-[9px] sm:text-[10px] truncate max-w-full font-mono transition-colors ${
                  isHovered ? "text-cyan-300 font-bold" : "text-slate-400"
                }`}
              >
                {dayNumber}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
