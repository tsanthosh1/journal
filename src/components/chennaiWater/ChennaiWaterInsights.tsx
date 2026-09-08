"use client";

import React, { useState, useMemo } from "react";
import { ChennaiWaterReceipt } from "@/lib/chennaiWater/types";

interface ChennaiWaterInsightsProps {
  receipts: ChennaiWaterReceipt[];
  halfYearTax?: string | number;
  annualValue?: string | number;
  onViewReceipt?: (receipt: ChennaiWaterReceipt) => void;
}

export function ChennaiWaterInsights({
  receipts,
  halfYearTax = "₹419.00",
  annualValue = "₹11,960.00",
  onViewReceipt,
}: ChennaiWaterInsightsProps) {
  // Extract all distinct years from receipts
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    receipts.forEach((r) => {
      let y = "";
      if (r.receipt_dt && r.receipt_dt.includes("/")) {
        y = r.receipt_dt.split("/")[2]?.trim();
      } else if (r.receipt_dt) {
        y = r.receipt_dt.slice(0, 4);
      } else if (r.receipt_ts) {
        y = r.receipt_ts.slice(0, 4);
      }
      if (/^\d{4}$/.test(y)) {
        yearsSet.add(y);
      }
    });
    const arr = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
    return arr.length > 0 ? arr : ["2026", "2025", "2023"];
  }, [receipts]);

  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  // Helper to extract year and month (1-12) from receipt
  const getReceiptDateParts = (r: ChennaiWaterReceipt) => {
    let year = "";
    let month = 0; // 1-12

    if (r.receipt_dt && r.receipt_dt.includes("/")) {
      const parts = r.receipt_dt.split("/");
      year = parts[2]?.trim();
      month = parseInt(parts[1], 10) || 0;
    } else if (r.receipt_dt && r.receipt_dt.includes("-")) {
      const parts = r.receipt_dt.split("-");
      year = parts[0]?.trim();
      month = parseInt(parts[1], 10) || 0;
    } else if (r.receipt_ts) {
      const datePart = r.receipt_ts.split(" ")[0].split("T")[0];
      const parts = datePart.split("-");
      year = parts[0]?.trim();
      month = parseInt(parts[1], 10) || 0;
    }

    return { year, month };
  };

  // Filtered receipts based on selectedYear
  const yearReceipts = useMemo(() => {
    if (selectedYear === "ALL") return receipts;
    return receipts.filter((r) => {
      const { year } = getReceiptDateParts(r);
      return year === selectedYear;
    });
  }, [receipts, selectedYear]);

  // Aggregate Metrics for Selected Year
  const metrics = useMemo(() => {
    const totalPaid = yearReceipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const count = yearReceipts.length;

    // Monthly average: if "ALL", divide by number of distinct active years * 12
    const denominatorMonths =
      selectedYear === "ALL" ? Math.max(1, availableYears.length * 12) : 12;
    const avgMonthly = Math.round(totalPaid / denominatorMonths);

    // Term I (Apr-Sep) vs Term II (Oct-Mar)
    let term1Amount = 0;
    let term2Amount = 0;

    yearReceipts.forEach((r) => {
      const { month } = getReceiptDateParts(r);
      const amt = Number(r.amount) || 0;
      if (month >= 4 && month <= 9) {
        term1Amount += amt;
      } else {
        term2Amount += amt;
      }
    });

    // Payment modes
    const modeCounts: Record<string, { count: number; total: number }> = {};
    yearReceipts.forEach((r) => {
      const mode = r.payment_mode || "BBPS";
      const amt = Number(r.amount) || 0;
      if (!modeCounts[mode]) {
        modeCounts[mode] = { count: 0, total: 0 };
      }
      modeCounts[mode].count += 1;
      modeCounts[mode].total += amt;
    });

    return {
      totalPaid,
      count,
      avgMonthly,
      term1Amount,
      term2Amount,
      modeCounts,
    };
  }, [yearReceipts, selectedYear, availableYears]);

  // 12-Month Bar Chart Data (Jan - Dec)
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const monthlyChartData = useMemo(() => {
    return monthNames.map((name, idx) => {
      const monthNumber = idx + 1;
      const matchingReceipts = yearReceipts.filter((r) => {
        const { month } = getReceiptDateParts(r);
        return month === monthNumber;
      });

      const totalAmount = matchingReceipts.reduce(
        (sum, r) => sum + (Number(r.amount) || 0),
        0
      );

      return {
        monthNumber,
        name,
        totalAmount,
        receipts: matchingReceipts,
        count: matchingReceipts.length,
      };
    });
  }, [yearReceipts]);

  const maxMonthAmount = useMemo(() => {
    const maxVal = Math.max(...monthlyChartData.map((m) => m.totalAmount));
    return maxVal > 0 ? maxVal : 2000;
  }, [monthlyChartData]);

  // Year-over-Year Summary for Comparison Chart
  const yoyData = useMemo(() => {
    return availableYears.map((yr) => {
      const yrReceipts = receipts.filter((r) => {
        const { year } = getReceiptDateParts(r);
        return year === yr;
      });
      const total = yrReceipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      return {
        year: yr,
        total,
        count: yrReceipts.length,
      };
    });
  }, [availableYears, receipts]);

  const maxYoyAmount = useMemo(() => {
    const maxVal = Math.max(...yoyData.map((y) => y.total));
    return maxVal > 0 ? maxVal : 4000;
  }, [yoyData]);

  const allTimeTotal = useMemo(() => {
    return receipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }, [receipts]);

  return (
    <div className="space-y-6">
      {/* Year Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-3.5 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
            Filter Period:
          </span>

          <button
            type="button"
            onClick={() => setSelectedYear("ALL")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              selectedYear === "ALL"
                ? "bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20 font-extrabold"
                : "bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700"
            }`}
          >
            <span>All Years</span>
            <span
              className={`rounded-md px-1.5 py-0.2 text-[10px] ${
                selectedYear === "ALL" ? "bg-slate-950/20 text-slate-950" : "bg-slate-700 text-slate-300"
              }`}
            >
              {receipts.length}
            </span>
          </button>

          {availableYears.map((yr) => {
            const yrCount = receipts.filter((r) => getReceiptDateParts(r).year === yr).length;
            const isSelected = selectedYear === yr;
            return (
              <button
                key={yr}
                type="button"
                onClick={() => setSelectedYear(yr)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20 font-extrabold"
                    : "bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700"
                }`}
              >
                <span>{yr}</span>
                <span
                  className={`rounded-md px-1.5 py-0.2 text-[10px] ${
                    isSelected ? "bg-slate-950/20 text-slate-950" : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {yrCount}
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Showing:{" "}
          <span className="text-white font-bold">
            {selectedYear === "ALL" ? "All Time History" : `Year ${selectedYear}`}
          </span>
        </div>
      </div>

      {/* 4 High-Impact Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Outflow */}
        <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-950/30 via-slate-900/60 to-slate-900 p-4.5 space-y-1 relative overflow-hidden">
          <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 bg-sky-500/10 rounded-full blur-2xl" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">
              {selectedYear === "ALL" ? "Total All-Time Outflow" : `${selectedYear} Total Outflow`}
            </span>
            <span className="text-xs">💰</span>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            ₹{metrics.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400">
            Across <span className="text-sky-300 font-semibold">{metrics.count}</span> verified receipts
          </p>
        </div>

        {/* Card 2: Average Monthly Outflow */}
        <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/30 via-slate-900/60 to-slate-900 p-4.5 space-y-1 relative overflow-hidden">
          <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 bg-blue-500/10 rounded-full blur-2xl" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-300">
              Avg. Monthly Outflow
            </span>
            <span className="text-xs">📅</span>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            ₹{metrics.avgMonthly.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400">
            Effective monthly water cost run-rate
          </p>
        </div>

        {/* Card 3: Base Tax vs Usage Charges */}
        <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-950/30 via-slate-900/60 to-slate-900 p-4.5 space-y-1 relative overflow-hidden">
          <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 bg-teal-500/10 rounded-full blur-2xl" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-300">
              Half-Year Base Tax
            </span>
            <span className="text-xs">⚖️</span>
          </div>
          <div className="text-2xl font-black text-teal-300 font-mono">
            {typeof halfYearTax === "number" ? `₹${halfYearTax.toFixed(2)}` : halfYearTax}
          </div>
          <p className="text-[11px] text-slate-400">
            ₹{(419 * 2).toFixed(2)} base/yr • Additional is usage charges
          </p>
        </div>

        {/* Card 4: Most Preferred Channel */}
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 via-slate-900/60 to-slate-900 p-4.5 space-y-1 relative overflow-hidden">
          <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 bg-emerald-500/10 rounded-full blur-2xl" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
              Payment Clearing
            </span>
            <span className="text-xs">⚡</span>
          </div>
          <div className="text-2xl font-black text-emerald-300">
            BBPS (Instant)
          </div>
          <p className="text-[11px] text-slate-400">
            4 of recent 4 payments cleared via BBPS
          </p>
        </div>
      </div>

      {/* GRAPH 1: Monthly Distribution Bar Chart */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span>📊</span> Monthly Water Outflow Distribution ({selectedYear === "ALL" ? "All Time Aggregated" : selectedYear})
            </h3>
            <p className="text-xs text-slate-400">
              Shows payment outflows across each month of the year. Hover over any bar to view receipts.
            </p>
          </div>
          <div className="text-xs text-slate-400 font-mono">
            Peak Month:{" "}
            <span className="text-sky-300 font-bold">
              ₹{maxMonthAmount.toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        {/* The Bar Chart Canvas */}
        <div className="pt-6 pb-2">
          <div className="grid grid-cols-12 gap-1.5 sm:gap-3 h-52 items-end px-2 border-b border-white/10">
            {monthlyChartData.map((m, idx) => {
              const heightPercent = m.totalAmount > 0 ? Math.max(12, Math.round((m.totalAmount / maxMonthAmount) * 100)) : 0;
              const hasPayments = m.totalAmount > 0;
              const isHovered = hoveredMonth === idx;

              return (
                <div
                  key={m.name}
                  className="flex flex-col items-center justify-end h-full relative group cursor-pointer"
                  onMouseEnter={() => setHoveredMonth(idx)}
                  onMouseLeave={() => setHoveredMonth(null)}
                >
                  {/* Amount Badge Above Bar */}
                  {hasPayments && (
                    <div
                      className={`text-[10px] font-mono font-bold mb-1 transition-all duration-200 text-center truncate w-full ${
                        isHovered ? "text-sky-300 scale-110 -translate-y-1" : "text-slate-300"
                      }`}
                    >
                      ₹{m.totalAmount > 999 ? `${(m.totalAmount / 1000).toFixed(1)}k` : m.totalAmount}
                    </div>
                  )}

                  {/* Interactive Tooltip */}
                  {isHovered && hasPayments && (
                    <div className="absolute bottom-full mb-6 z-30 w-52 rounded-2xl border border-sky-500/40 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md pointer-events-none transform -translate-x-1/2 left-1/2">
                      <div className="text-xs font-bold text-white border-b border-white/10 pb-1.5 mb-1.5 flex items-center justify-between">
                        <span>{m.name} {selectedYear !== "ALL" ? selectedYear : ""}</span>
                        <span className="font-mono text-sky-300">₹{m.totalAmount.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="space-y-1 text-[11px] text-slate-300">
                        {m.receipts.map((r, rIdx) => (
                          <div key={r.id || rIdx} className="flex items-center justify-between">
                            <span className="font-mono text-slate-400 text-[10px]">{r.receipt_no}</span>
                            <span className="font-bold text-white">₹{r.amount}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bar Element */}
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full rounded-t-xl transition-all duration-300 ${
                      hasPayments
                        ? isHovered
                          ? "bg-gradient-to-t from-sky-400 to-blue-500 shadow-lg shadow-sky-500/30"
                          : "bg-gradient-to-t from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500"
                        : "h-1 bg-slate-800/60 rounded-full"
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* X-Axis Month Labels */}
          <div className="grid grid-cols-12 gap-1.5 sm:gap-3 px-2 pt-2">
            {monthlyChartData.map((m, idx) => (
              <div
                key={m.name}
                className={`text-center text-[11px] font-semibold transition ${
                  m.totalAmount > 0
                    ? hoveredMonth === idx
                      ? "text-sky-300 font-bold"
                      : "text-slate-200"
                    : "text-slate-500"
                }`}
              >
                {m.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DUAL SECTION: YoY Comparison & Half-Yearly Cycle Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GRAPH 2: Year-over-Year Annual Comparison */}
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>📈</span> Year-over-Year (YoY) Outflows
              </h3>
              <p className="text-xs text-slate-400">Total payments made per calendar year</p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              All-Time: <span className="text-sky-300 font-bold">₹{allTimeTotal.toLocaleString("en-IN")}</span>
            </span>
          </div>

          <div className="space-y-3.5 pt-2">
            {yoyData.map((yd) => {
              const widthPct = Math.max(8, Math.round((yd.total / maxYoyAmount) * 100));
              const isSelected = selectedYear === yd.year;

              return (
                <div
                  key={yd.year}
                  onClick={() => setSelectedYear(yd.year)}
                  className={`p-3 rounded-2xl border transition cursor-pointer ${
                    isSelected
                      ? "border-sky-500/50 bg-sky-950/20"
                      : "border-white/5 bg-slate-950/40 hover:bg-slate-950/70"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{yd.year}</span>
                      <span className="text-[10px] text-slate-400">({yd.count} payments)</span>
                    </div>
                    <div className="font-mono font-bold text-sky-300 text-sm">
                      ₹{yd.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${widthPct}%` }}
                      className={`h-full rounded-full transition-all duration-500 ${
                        isSelected
                          ? "bg-gradient-to-r from-sky-400 to-blue-500"
                          : "bg-gradient-to-r from-sky-600 to-blue-600"
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* GRAPH 3: Half-Yearly Billing Terms Breakdown */}
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>🔄</span> Half-Yearly Cycle Outflows
              </h3>
              <p className="text-xs text-slate-400">
                Term I (Apr–Sep) vs Term II (Oct–Mar)
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {selectedYear === "ALL" ? "All Years" : selectedYear}
            </span>
          </div>

          <div className="space-y-4 pt-2">
            {/* Term I Card */}
            <div className="rounded-2xl border border-white/5 bg-slate-950/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-sky-300">Term I: April – September</div>
                  <div className="text-[11px] text-slate-400">Summer & monsoon term</div>
                </div>
                <div className="font-mono font-bold text-white text-base">
                  ₹{metrics.term1Amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  style={{
                    width: `${
                      metrics.totalPaid > 0
                        ? Math.round((metrics.term1Amount / metrics.totalPaid) * 100)
                        : 0
                    }%`,
                  }}
                  className="h-full bg-sky-500 rounded-full"
                />
              </div>
            </div>

            {/* Term II Card */}
            <div className="rounded-2xl border border-white/5 bg-slate-950/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-blue-300">Term II: October – March</div>
                  <div className="text-[11px] text-slate-400">Winter & financial year close term</div>
                </div>
                <div className="font-mono font-bold text-white text-base">
                  ₹{metrics.term2Amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  style={{
                    width: `${
                      metrics.totalPaid > 0
                        ? Math.round((metrics.term2Amount / metrics.totalPaid) * 100)
                        : 0
                    }%`,
                  }}
                  className="h-full bg-blue-500 rounded-full"
                />
              </div>
            </div>

            {/* Payment Channel Breakdown Pills */}
            <div className="pt-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Outflow by Payment Channel:
              </span>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(metrics.modeCounts).map(([mode, data]) => (
                  <div key={mode} className="rounded-xl border border-white/5 bg-slate-950/60 p-2.5 text-center">
                    <span className="text-[10px] font-mono text-slate-400 uppercase block">{mode}</span>
                    <span className="font-mono font-bold text-xs text-white block mt-0.5">
                      ₹{data.total.toLocaleString("en-IN")}
                    </span>
                    <span className="text-[10px] text-slate-500 block">{data.count} txns</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Period Payment Timeline */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>📜</span> Payment Receipts for {selectedYear === "ALL" ? "All Time" : `Year ${selectedYear}`}
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            {yearReceipts.length} total receipts
          </span>
        </div>

        <div className="space-y-2.5">
          {yearReceipts.map((r, idx) => (
            <div
              key={r.id || idx}
              className="flex items-center justify-between rounded-2xl border border-white/5 bg-slate-950/60 p-3.5 text-xs hover:border-white/15 transition"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 font-bold text-sm">
                  💧
                </span>
                <div>
                  <div className="font-mono font-bold text-white text-xs">{r.receipt_no}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {r.receipt_dt} • Via <span className="font-semibold text-slate-300">{r.payment_mode}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-mono font-bold text-emerald-300 text-sm">
                    ₹{Number(r.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-emerald-400/80 font-bold uppercase">Paid</span>
                </div>

                {onViewReceipt && (
                  <button
                    type="button"
                    onClick={() => onViewReceipt(r)}
                    className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 transition cursor-pointer"
                  >
                    View
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
