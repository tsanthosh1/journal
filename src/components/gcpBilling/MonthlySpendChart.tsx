"use client";

import React, { useState, useMemo } from "react";
import { GcpMonthlySpend } from "@/lib/gcpBilling/types";
import { BarChart3, TrendingUp, Sparkles, Zap, ShieldCheck } from "lucide-react";

interface MonthlySpendChartProps {
  data: GcpMonthlySpend[];
  currency: string;
}

export function MonthlySpendChart({ data, currency }: MonthlySpendChartProps) {
  const [hoveredMonth, setHoveredMonth] = useState<GcpMonthlySpend | null>(null);
  const [range, setRange] = useState<"6m" | "12m" | "all">("12m");
  const [scaleMode, setScaleMode] = useState<"smart" | "linear">("smart");

  // 1. Slice data based on selected time range
  const displayData = useMemo(() => {
    if (!data || data.length === 0) return [];
    if (range === "6m") return data.slice(-6);
    if (range === "12m") return data.slice(-12);
    return data;
  }, [data, range]);

  // 2. Statistical calculations for the active view
  const stats = useMemo(() => {
    if (!displayData || displayData.length === 0) {
      return {
        maxNetCost: 1,
        minNetCost: 0,
        medianNetCost: 1,
        totalNetSpend: 0,
        avgMonthlySpend: 0,
        highestMonth: null as GcpMonthlySpend | null,
        hasOutlier: false,
        baselineCap: 250,
      };
    }

    const netCosts = displayData.map((m) => m.netCost);
    const sorted = [...netCosts].sort((a, b) => a - b);
    const max = Math.max(...netCosts, 1);
    const min = Math.min(...netCosts);
    const median = sorted[Math.floor(sorted.length / 2)] || 1;
    const total = netCosts.reduce((acc, c) => acc + c, 0);
    const avg = total / displayData.length;
    const highest = displayData.reduce(
      (prev, curr) => (curr.netCost > prev.netCost ? curr : prev),
      displayData[0]
    );
    // Outlier detected if max is more than 3.5x the median
    const hasOutlier = max > Math.max(median * 3.5, 300);
    const baselineCap = Math.max(median * 2.2, 200);

    return {
      maxNetCost: max,
      minNetCost: min,
      medianNetCost: median,
      totalNetSpend: total,
      avgMonthlySpend: avg,
      highestMonth: highest,
      hasOutlier,
      baselineCap,
    };
  }, [displayData]);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-72 flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center backdrop-blur-md">
        <BarChart3 className="h-8 w-8 text-slate-500 mb-2" />
        <p className="text-sm font-medium text-slate-400">No monthly billing records found</p>
      </div>
    );
  }

  // Adaptive piecewise scaling formula:
  // Baseline months (0 to 2.2x median) scale smoothly across 8% - 55% of height so their variations are clearly visible.
  // The outlier spike (e.g. June 2026 at ₹6,719) maps from 55% to 95% height.
  const getBarHeightPercent = (netCost: number) => {
    if (netCost <= 0) return 4;

    if (scaleMode === "smart" && stats.hasOutlier) {
      if (netCost <= stats.baselineCap) {
        const ratio = netCost / stats.baselineCap;
        return Math.max(8, 8 + ratio * 47); // 8% to 55%
      } else {
        const outlierRatio = (netCost - stats.baselineCap) / (stats.maxNetCost - stats.baselineCap);
        return 55 + Math.pow(Math.max(0, outlierRatio), 0.5) * 40; // 55% to 95%
      }
    }

    // Strict linear scale
    const raw = (netCost / stats.maxNetCost) * 100;
    return Math.max(6, Math.min(95, raw));
  };

  const isWideDataset = displayData.length > 14;

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/80 to-slate-950/80 p-5 shadow-2xl backdrop-blur-md">
      {/* 1. Header (Fixed height, no layout shift) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10 min-h-[3.5rem]">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            <span>Monthly Billing & Invoiced Spend</span>
            <span className="text-xs font-normal text-slate-400">
              ({displayData.length} of {data.length} months)
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Historical invoice totals, free-tier discounts, and monthly consumption trends
          </p>
        </div>

        {/* View Controls: Time Range & Scale Mode */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Outlier Smart / Linear toggle */}
          {stats.hasOutlier && (
            <div className="flex items-center bg-slate-950/80 border border-white/10 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setScaleMode("smart")}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                  scaleMode === "smart"
                    ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Balanced view so baseline months remain clearly visible alongside spike months"
              >
                <Zap className="h-3 w-3" />
                <span>Smart Scale</span>
              </button>
              <button
                type="button"
                onClick={() => setScaleMode("linear")}
                className={`px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                  scaleMode === "linear"
                    ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Strict linear proportion against the highest month"
              >
                Linear
              </button>
            </div>
          )}

          {/* Range Selector */}
          <div className="flex items-center bg-slate-950/80 border border-white/10 rounded-lg p-0.5">
            {(["6m", "12m", "all"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                  range === r
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {r === "6m" ? "6M" : r === "12m" ? "12M" : "All Time"}
              </button>
            ))}
          </div>

          {/* Static Legend */}
          <div className="hidden sm:flex items-center gap-3 pl-2 text-[11px] text-slate-400 border-l border-white/10">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-400"></span>
              <span>Net Invoiced</span>
            </div>
            {stats.hasOutlier && (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                <span>Spike</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Fixed-Height Inspector Strip (Strictly 44px, overflow-hidden, ZERO layout shift) */}
      <div className="h-11 flex items-center justify-between px-3 my-3 rounded-xl bg-slate-800/60 border border-white/5 text-xs overflow-hidden select-none">
        {hoveredMonth ? (
          <div className="flex items-center justify-between w-full min-w-0 animate-in fade-in duration-100">
            <div className="flex items-center gap-2 min-w-0 truncate">
              <span className="font-bold text-white text-sm whitespace-nowrap">
                {hoveredMonth.formattedMonth}
              </span>
              <span className="text-[10px] bg-slate-700/80 text-cyan-300 font-mono px-1.5 py-0.5 rounded border border-white/5 whitespace-nowrap">
                {hoveredMonth.invoiceMonth}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-medium whitespace-nowrap ${
                  hoveredMonth.status === "CURRENT"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                }`}
              >
                {hoveredMonth.status === "CURRENT" ? "Current Cycle" : "Paid"}
              </span>
              {stats.highestMonth?.invoiceMonth === hoveredMonth.invoiceMonth && stats.hasOutlier && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-bold whitespace-nowrap flex items-center gap-1">
                  <Zap className="h-2.5 w-2.5" /> Outlier Spike
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 sm:gap-5 whitespace-nowrap font-mono text-xs shrink-0 pl-2">
              <span className="text-slate-400 hidden md:inline">
                Gross: <span className="text-slate-200">{currency} {hoveredMonth.cost.toFixed(2)}</span>
              </span>
              {hoveredMonth.credits > 0 && (
                <span className="text-slate-400 hidden sm:inline">
                  Credits: <span className="text-emerald-400">-{currency} {hoveredMonth.credits.toFixed(2)}</span>
                </span>
              )}
              <span className="text-slate-400">
                Net Bill: <span className="text-white font-extrabold text-sm font-sans">{currency} {hoveredMonth.netCost.toFixed(2)}</span>
              </span>
              <span className="text-[11px] text-slate-500 hidden lg:inline font-sans">
                ({hoveredMonth.serviceCount} services • {hoveredMonth.projectCount} {hoveredMonth.projectCount === 1 ? "proj" : "projs"})
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full min-w-0 text-slate-400">
            <div className="flex items-center gap-2 truncate">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">Hover over any month bar to inspect charges, credits, and project footprint</span>
            </div>
            <div className="flex items-center gap-3 sm:gap-4 text-slate-300 whitespace-nowrap shrink-0 pl-2 text-xs">
              <span>
                Avg: <span className="text-cyan-300 font-semibold font-mono">{currency} {stats.avgMonthlySpend.toFixed(0)}/mo</span>
              </span>
              {stats.highestMonth && (
                <span>
                  Peak: <span className="text-amber-300 font-semibold font-mono">{stats.highestMonth.formattedMonth.split(" ")[0]} ({currency} {stats.highestMonth.netCost.toFixed(0)})</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Independent Chart Drawing Canvas (Height: 208px - 100% separated from month labels) */}
      <div className="relative mt-1 h-52 w-full pt-6 pb-0 select-none">
        {/* Y-Axis Horizontal Grid Lines */}
        <div className="absolute inset-0 top-6 bottom-0 flex flex-col justify-between pointer-events-none">
          <div className="relative w-full flex items-center">
            <div className="w-full border-t border-dashed border-white/10"></div>
            <span className="absolute right-0 -top-2.5 text-[9px] font-mono text-slate-500 bg-slate-900/90 px-1.5 rounded">
              {stats.hasOutlier && scaleMode === "smart"
                ? `⚡ Peak: ${currency} ${stats.maxNetCost.toFixed(0)}`
                : `${currency} ${stats.maxNetCost.toFixed(0)}`}
            </span>
          </div>
          <div className="relative w-full flex items-center">
            <div className="w-full border-t border-dashed border-white/5"></div>
            <span className="absolute right-0 -top-2.5 text-[9px] font-mono text-slate-500 bg-slate-900/90 px-1.5 rounded">
              {stats.hasOutlier && scaleMode === "smart"
                ? `Baseline: ~${currency} ${stats.baselineCap.toFixed(0)}`
                : `${currency} ${(stats.maxNetCost * 0.5).toFixed(0)}`}
            </span>
          </div>
          <div className="relative w-full flex items-center">
            <div className="w-full border-t border-white/10"></div>
            <span className="absolute right-0 -top-2.5 text-[9px] font-mono text-slate-500 bg-slate-900/90 px-1.5 rounded">
              {currency} 0
            </span>
          </div>
        </div>

        {/* Average Benchmark Dashed Line (Scaled with the same formula, strictly within canvas) */}
        <div
          className="absolute left-0 right-0 border-t border-dashed border-cyan-500/40 z-0 pointer-events-none transition-all duration-300"
          style={{
            bottom: `${Math.min(90, Math.max(10, getBarHeightPercent(stats.avgMonthlySpend)))}%`,
          }}
        >
          <span className="absolute left-1 -top-3.5 text-[9px] font-semibold text-cyan-300 bg-slate-950/90 px-1.5 py-0.5 rounded border border-cyan-500/30">
            Avg {currency} {stats.avgMonthlySpend.toFixed(0)}
          </span>
        </div>

        {/* Bars Container */}
        <div className="relative h-full w-full flex items-end justify-between gap-1 sm:gap-1.5 px-0.5 z-10">
          {displayData.map((month) => {
            const isHovered = hoveredMonth?.invoiceMonth === month.invoiceMonth;
            const isCurrent = month.status === "CURRENT";
            const isSpike = stats.hasOutlier && month.invoiceMonth === stats.highestMonth?.invoiceMonth;
            const heightPercent = getBarHeightPercent(month.netCost);

            return (
              <div
                key={month.invoiceMonth}
                className="group relative flex flex-1 flex-col items-center h-full justify-end cursor-pointer"
                onMouseEnter={() => setHoveredMonth(month)}
                onMouseLeave={() => setHoveredMonth(null)}
              >
                {/* Background Pillar Track (Full height of the drawing canvas) */}
                <div className="w-full max-w-[48px] h-full flex flex-col justify-end items-center rounded-xl bg-white/[0.02] group-hover:bg-white/[0.06] p-1 transition-colors">
                  {/* The Actual Spend Bar */}
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full rounded-lg transition-colors duration-150 relative flex flex-col justify-end overflow-hidden ${
                      isHovered
                        ? isSpike
                          ? "bg-gradient-to-t from-amber-600 via-rose-500 to-amber-300 ring-2 ring-amber-300 ring-offset-1 ring-offset-slate-900 shadow-lg shadow-amber-500/30"
                          : "bg-gradient-to-t from-cyan-600 via-cyan-400 to-cyan-200 ring-2 ring-cyan-300 ring-offset-1 ring-offset-slate-900 shadow-lg shadow-cyan-500/30"
                        : isSpike
                        ? "bg-gradient-to-t from-amber-600/90 via-rose-500/90 to-amber-400/90"
                        : isCurrent
                        ? "bg-gradient-to-t from-cyan-800/80 via-cyan-500/80 to-cyan-400 ring-1 ring-cyan-400/50"
                        : "bg-gradient-to-t from-cyan-600/80 via-blue-600/80 to-cyan-400/90 group-hover:from-cyan-500 group-hover:to-cyan-300"
                    }`}
                  >
                    {/* Outlier Spark Indicator */}
                    {isSpike && (
                      <div className="absolute top-1 left-1/2 -translate-x-1/2 text-amber-200">
                        <Zap className="h-2.5 w-2.5 fill-amber-300 text-amber-200" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Dedicated X-Axis Month Labels Area (Separated below canvas - ZERO label collision) */}
      <div className="mt-2 h-9 w-full flex items-start justify-between gap-1 sm:gap-1.5 px-0.5 select-none">
        {displayData.map((month, idx) => {
          const isHovered = hoveredMonth?.invoiceMonth === month.invoiceMonth;
          const isCurrent = month.status === "CURRENT";

          // Smart thinning when viewing > 14 months so labels never collide
          const shouldShowLabel =
            !isWideDataset ||
            isHovered ||
            idx === 0 ||
            idx === displayData.length - 1 ||
            idx % (displayData.length > 24 ? 3 : 2) === 0;

          return (
            <div
              key={month.invoiceMonth}
              className="flex flex-1 flex-col items-center justify-start pointer-events-none min-w-0"
            >
              {shouldShowLabel ? (
                <div className="flex flex-col items-center">
                  <span
                    className={`text-[10px] sm:text-xs font-medium whitespace-nowrap transition-colors ${
                      isHovered
                        ? "text-cyan-300 font-bold"
                        : isCurrent
                        ? "text-cyan-400"
                        : "text-slate-400"
                    }`}
                  >
                    {month.formattedMonth.split(" ")[0]}
                  </span>
                  <span className="text-[8px] sm:text-[9px] text-slate-500 font-mono">
                    {month.invoiceMonth.slice(2, 4)}/{month.invoiceMonth.slice(4, 6)}
                  </span>
                </div>
              ) : (
                <div className="h-1.5 w-1.5 rounded-full bg-slate-700/60 mt-1.5" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
