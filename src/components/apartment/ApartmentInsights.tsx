"use client";

import React, { useState, useMemo } from "react";
import { HomefyBillRecord } from "@/lib/apartment/types";

interface ApartmentInsightsProps {
  bills: HomefyBillRecord[];
}

export function ApartmentInsights({ bills }: ApartmentInsightsProps) {
  // Extract all available years from bills
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    bills.forEach((b) => {
      const d = b.lastDate || b.createdAt || (b.maintenance?.startDate);
      if (d) {
        const y = d.slice(0, 4);
        if (/^\d{4}$/.test(y)) {
          yearsSet.add(y);
        }
      }
    });
    const arr = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
    return arr.length > 0 ? arr : ["2026", "2025"];
  }, [bills]);

  const [selectedYear, setSelectedYear] = useState<string>(availableYears[0] || "2026");
  const [hoveredWaterIndex, setHoveredWaterIndex] = useState<number | null>(null);
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState<number | null>(null);

  // Filter bills by selected year
  const yearBills = useMemo(() => {
    if (selectedYear === "ALL") return bills;
    return bills.filter((b) => {
      const d = b.lastDate || b.createdAt || (b.maintenance?.startDate) || "";
      return d.startsWith(selectedYear);
    });
  }, [bills, selectedYear]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalWater = 0;
    let waterCount = 0;
    let minWater = Infinity;
    let maxWater = 0;

    let totalMaintenance = 0;
    let maintenanceCount = 0;

    let totalCorpus = 0;
    let corpusCount = 0;

    let totalOther = 0;

    yearBills.forEach((b) => {
      const amt = b.totalAmount || b.amount || 0;
      const cat = (b.category?.name || "").toLowerCase();

      if (cat.includes("water")) {
        totalWater += amt;
        waterCount++;
        if (amt < minWater) minWater = amt;
        if (amt > maxWater) maxWater = amt;
      } else if (cat.includes("maintenance")) {
        totalMaintenance += amt;
        maintenanceCount++;
      } else if (cat.includes("corpus")) {
        totalCorpus += amt;
        corpusCount++;
      } else {
        totalOther += amt;
      }
    });

    const grandTotal = totalWater + totalMaintenance + totalCorpus + totalOther;
    const avgWater = waterCount > 0 ? Math.round(totalWater / waterCount) : 0;

    return {
      totalWater,
      waterCount,
      avgWater,
      minWater: minWater === Infinity ? 0 : minWater,
      maxWater,
      totalMaintenance,
      maintenanceCount,
      totalCorpus,
      corpusCount,
      totalOther,
      grandTotal,
    };
  }, [yearBills]);

  // 12-Month Grid Data for Charts
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const monthlyBreakdown = useMemo(() => {
    // Structure: 12 months array
    const months = monthNames.map((name, i) => {
      const monthNum = String(i + 1).padStart(2, "0");
      return {
        monthIndex: i,
        monthName: name,
        monthKey: selectedYear === "ALL" ? monthNum : `${selectedYear}-${monthNum}`,
        water: 0,
        maintenance: 0,
        corpus: 0,
        other: 0,
        total: 0,
        waterBillId: "",
        maintenanceBillId: "",
        billsList: [] as HomefyBillRecord[],
      };
    });

    yearBills.forEach((b) => {
      const d = b.lastDate || b.createdAt || (b.maintenance?.startDate) || "";
      if (!d) return;

      const mStr = d.slice(5, 7);
      const mIdx = parseInt(mStr, 10) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        const amt = b.totalAmount || b.amount || 0;
        const cat = (b.category?.name || "").toLowerCase();

        months[mIdx].billsList.push(b);
        months[mIdx].total += amt;

        if (cat.includes("water")) {
          months[mIdx].water += amt;
          months[mIdx].waterBillId = b.billId;
        } else if (cat.includes("maintenance")) {
          months[mIdx].maintenance += amt;
          months[mIdx].maintenanceBillId = b.billId;
        } else if (cat.includes("corpus")) {
          months[mIdx].corpus += amt;
        } else {
          months[mIdx].other += amt;
        }
      }
    });

    return months;
  }, [yearBills, selectedYear]);

  // Max value for Water Chart scaling
  const maxWaterValue = useMemo(() => {
    const max = Math.max(...monthlyBreakdown.map((m) => m.water), 1500);
    return Math.ceil(max / 200) * 200;
  }, [monthlyBreakdown]);

  // Max value for Overall Stacked Chart scaling
  const maxTotalValue = useMemo(() => {
    const max = Math.max(...monthlyBreakdown.map((m) => m.total), 14000);
    return Math.ceil(max / 2000) * 2000;
  }, [monthlyBreakdown]);

  // Maintenance quarters breakdown
  const maintenanceQuarters = useMemo(() => {
    return [
      { name: "Q1 (Jan - Mar)", months: [0, 1, 2], expectedDue: "Mar 31" },
      { name: "Q2 (Apr - Jun)", months: [3, 4, 5], expectedDue: "Jun 30" },
      { name: "Q3 (Jul - Sep)", months: [6, 7, 8], expectedDue: "Sep 30" },
      { name: "Q4 (Oct - Dec)", months: [9, 10, 11], expectedDue: "Dec 31" },
    ].map((q) => {
      const qBills = yearBills.filter((b) => {
        const cat = (b.category?.name || "").toLowerCase();
        if (!cat.includes("maintenance")) return false;
        const d = b.lastDate || b.createdAt || (b.maintenance?.startDate) || "";
        const m = parseInt(d.slice(5, 7), 10) - 1;
        return q.months.includes(m);
      });

      const totalAmt = qBills.reduce((acc, b) => acc + (b.totalAmount || b.amount || 0), 0);
      const isPaid = qBills.length > 0 && qBills.every((b) => b.status === "PAID");
      const isApprovalPending = qBills.some((b) => b.status === "APPROVAL_PENDING");

      return {
        ...q,
        amount: totalAmt,
        bill: qBills[0] || null,
        status: isPaid ? "PAID" : isApprovalPending ? "APPROVAL_PENDING" : totalAmt > 0 ? "PENDING" : "NO_BILL",
      };
    });
  }, [yearBills]);

  // Category percentage shares
  const waterShare = metrics.grandTotal > 0 ? Math.round((metrics.totalWater / metrics.grandTotal) * 100) : 0;
  const maintenanceShare = metrics.grandTotal > 0 ? Math.round((metrics.totalMaintenance / metrics.grandTotal) * 100) : 0;
  const corpusShare = metrics.grandTotal > 0 ? Math.round((metrics.totalCorpus / metrics.grandTotal) * 100) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Year Filter Controls & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span>📈</span>
            <span>Apartment Outflow Insights & Usage</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Historical consumption trends, quarterly society maintenance, and expense breakdown.
          </p>
        </div>

        {/* Year Selector Pills */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-950 p-1 rounded-xl border border-white/10">
          <span className="text-[11px] text-slate-400 font-semibold px-2">Year:</span>
          {availableYears.map((yr) => (
            <button
              key={yr}
              onClick={() => setSelectedYear(yr)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                selectedYear === yr
                  ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {yr}
            </button>
          ))}
          <button
            onClick={() => setSelectedYear("ALL")}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
              selectedYear === "ALL"
                ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            All Years
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Grand Outflow */}
        <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/30 to-slate-900/80 p-4">
          <span className="text-xs font-semibold text-indigo-300 block">Total Society Outflow</span>
          <div className="mt-2 text-2xl font-black text-white font-mono tracking-tight">
            ₹{metrics.grandTotal.toLocaleString("en-IN")}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {selectedYear === "ALL" ? "All recorded years" : `Total spend in ${selectedYear}`}
          </p>
        </div>

        {/* Maintenance Outflow */}
        <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/30 to-slate-900/80 p-4">
          <span className="text-xs font-semibold text-cyan-300 block">Society Maintenance</span>
          <div className="mt-2 text-2xl font-black text-cyan-300 font-mono tracking-tight">
            ₹{metrics.totalMaintenance.toLocaleString("en-IN")}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {metrics.maintenanceCount} quarters billed ({maintenanceShare}% of total)
          </p>
        </div>

        {/* Water Meter Spend */}
        <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-950/30 to-slate-900/80 p-4">
          <span className="text-xs font-semibold text-teal-300 block">Water Meter Bills</span>
          <div className="mt-2 text-2xl font-black text-teal-300 font-mono tracking-tight">
            ₹{metrics.totalWater.toLocaleString("en-IN")}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Avg ₹{metrics.avgWater.toLocaleString("en-IN")}/mo ({metrics.waterCount} bills)
          </p>
        </div>

        {/* Corpus & Others */}
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/30 to-slate-900/80 p-4">
          <span className="text-xs font-semibold text-amber-300 block">Corpus & Other Dues</span>
          <div className="mt-2 text-2xl font-black text-amber-300 font-mono tracking-tight">
            ₹{(metrics.totalCorpus + metrics.totalOther).toLocaleString("en-IN")}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Special society funds & charges</p>
        </div>
      </div>

      {/* SECTION 1: WATER METER USAGE & BILL CHART */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 sm:p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/20 text-teal-300 font-bold text-xs">
                💧
              </span>
              <span>Water Meter Monthly Charges & Usage Trend</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Monthly meter charges for Flat {selectedYear}. Hover bars to see detailed billing amounts.
            </p>
          </div>

          {/* Mini Stats Pill */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-slate-400">
              Min: <strong className="text-emerald-400">₹{metrics.minWater}</strong>
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">
              Avg: <strong className="text-teal-300">₹{metrics.avgWater}</strong>
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">
              Peak: <strong className="text-rose-400">₹{metrics.maxWater}</strong>
            </span>
          </div>
        </div>

        {/* Visual Bar Chart */}
        <div className="relative pt-6 pb-2">
          {/* Chart Y-Axis Guides */}
          <div className="absolute inset-x-0 top-6 bottom-10 flex flex-col justify-between pointer-events-none opacity-20">
            <div className="border-b border-dashed border-teal-400 w-full" />
            <div className="border-b border-dashed border-teal-400 w-full" />
            <div className="border-b border-dashed border-teal-400 w-full" />
          </div>

          {/* Bars Container */}
          <div className="grid grid-cols-12 gap-1.5 sm:gap-3 items-end h-52 relative z-10 px-1">
            {monthlyBreakdown.map((m, idx) => {
              const heightPct = maxWaterValue > 0 ? Math.min(100, Math.round((m.water / maxWaterValue) * 100)) : 0;
              const isHovered = hoveredWaterIndex === idx;
              const isPeak = m.water > 0 && m.water === metrics.maxWater;

              return (
                <div
                  key={m.monthName}
                  className="flex flex-col items-center h-full justify-end group cursor-pointer"
                  onMouseEnter={() => setHoveredWaterIndex(idx)}
                  onMouseLeave={() => setHoveredWaterIndex(null)}
                >
                  {/* Tooltip on Hover */}
                  {isHovered && m.water > 0 && (
                    <div className="absolute -top-4 z-30 rounded-xl border border-teal-500/40 bg-slate-950 px-3 py-1.5 text-center shadow-xl pointer-events-none animate-in fade-in slide-in-from-bottom-1">
                      <span className="text-[10px] text-slate-400 font-medium block">
                        {m.monthName} {selectedYear} • {m.waterBillId || "Water Bill"}
                      </span>
                      <span className="text-xs font-black text-teal-300 font-mono">
                        ₹{m.water.toLocaleString("en-IN")}
                      </span>
                    </div>
                  )}

                  {/* Bar Graphic */}
                  <div className="w-full relative flex flex-col items-center justify-end h-full">
                    {/* Value Badge above Peak bar */}
                    {isPeak && (
                      <span className="text-[9px] font-black text-rose-400 font-mono mb-1 hidden sm:block">
                        Peak
                      </span>
                    )}

                    <div
                      style={{ height: `${Math.max(4, heightPct)}%` }}
                      className={`w-full max-w-[28px] rounded-t-lg transition-all duration-300 ${
                        m.water === 0
                          ? "bg-slate-800/40 border border-white/5"
                          : isPeak
                          ? "bg-gradient-to-t from-teal-600 via-teal-500 to-rose-400 shadow-lg shadow-teal-500/20"
                          : isHovered
                          ? "bg-gradient-to-t from-teal-500 to-cyan-300 shadow-lg shadow-teal-500/30"
                          : "bg-gradient-to-t from-teal-600/80 to-teal-400/90"
                      }`}
                    />
                  </div>

                  {/* Month Label */}
                  <span
                    className={`mt-2 text-[10px] font-semibold transition ${
                      isHovered ? "text-teal-300 font-bold" : "text-slate-400"
                    }`}
                  >
                    {m.monthName}
                  </span>

                  {/* Amount Value below label */}
                  <span className="text-[9px] font-mono text-slate-500 hidden sm:block">
                    {m.water > 0 ? `₹${m.water}` : "-"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Water Insight Callout Banner */}
        <div className="rounded-2xl border border-teal-500/30 bg-teal-950/20 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">💡</span>
            <p className="text-slate-300">
              Annual water utility total:{" "}
              <strong className="text-white font-mono">₹{metrics.totalWater.toLocaleString("en-IN")}</strong>.{" "}
              Average monthly run-rate is{" "}
              <strong className="text-teal-300 font-mono">₹{metrics.avgWater.toLocaleString("en-IN")}</strong>.
            </p>
          </div>
          <span className="text-[11px] text-teal-400/80 font-mono shrink-0">
            Sub-Meter Verified • Bluemoon Callisto
          </span>
        </div>
      </div>

      {/* SECTION 2: QUARTERLY SOCIETY MAINTENANCE */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 sm:p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300 font-bold text-xs">
                🏢
              </span>
              <span>Society Maintenance Schedule & Status</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Standard quarterly maintenance charges at ₹11,655 per quarter (approx. ₹3,885/month).
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400 uppercase tracking-wider block">Maintenance Total</span>
            <span className="text-base font-black text-cyan-300 font-mono">
              ₹{metrics.totalMaintenance.toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        {/* 4 Quarters Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {maintenanceQuarters.map((q) => {
            const isPaid = q.status === "PAID";
            const isApprovalPending = q.status === "APPROVAL_PENDING";
            const isPending = q.status === "PENDING";
            const hasBill = q.bill !== null;

            return (
              <div
                key={q.name}
                className={`rounded-2xl border p-4 space-y-3 transition flex flex-col justify-between ${
                  isPaid
                    ? "border-emerald-500/30 bg-emerald-950/15"
                    : isApprovalPending
                    ? "border-amber-500/30 bg-amber-950/15"
                    : isPending
                    ? "border-rose-500/30 bg-rose-950/15"
                    : "border-white/5 bg-slate-900/30 opacity-60"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{q.name}</span>
                    {isPaid ? (
                      <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[9px] font-black text-emerald-300">
                        PAID
                      </span>
                    ) : isApprovalPending ? (
                      <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[9px] font-black text-amber-300">
                        APPROVAL PENDING
                      </span>
                    ) : isPending ? (
                      <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[9px] font-black text-rose-300">
                        PENDING
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[9px] text-slate-500">
                        NOT BILLED
                      </span>
                    )}
                  </div>

                  <div className="mt-3 text-xl font-black text-white font-mono">
                    {hasBill ? `₹${(q.amount || 11655).toLocaleString("en-IN")}` : "₹11,655"}
                  </div>

                  <div className="text-[11px] text-slate-400 mt-1 font-mono">
                    {q.bill ? `Bill ${q.bill.billId}` : `Target Due: ${q.expectedDue}`}
                  </div>
                </div>

                {q.bill && (
                  <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Receipt</span>
                    <a
                      href={`/api/apartment/receipts/${q.bill.id}?type=receipt`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 font-semibold"
                    >
                      Download PDF ↗
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: OVERALL MONTHLY OUTFLOW STACKED COMPARISON & CATEGORY BREAKDOWN */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stacked Monthly Outflow (2 Cols) */}
        <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-slate-900/70 p-5 sm:p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">Monthly Expense Distribution</h3>
              <p className="text-xs text-slate-400">Total outflow per month combining maintenance and utilities.</p>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-sm bg-cyan-400" />
                Maintenance
              </span>
              <span className="flex items-center gap-1 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-sm bg-teal-400" />
                Water
              </span>
              <span className="flex items-center gap-1 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
                Corpus
              </span>
            </div>
          </div>

          {/* Stacked Chart Container */}
          <div className="grid grid-cols-12 gap-1.5 sm:gap-2 items-end h-48 pt-4 px-1">
            {monthlyBreakdown.map((m, idx) => {
              const maintPct = maxTotalValue > 0 ? (m.maintenance / maxTotalValue) * 100 : 0;
              const waterPct = maxTotalValue > 0 ? (m.water / maxTotalValue) * 100 : 0;
              const corpusPct = maxTotalValue > 0 ? (m.corpus / maxTotalValue) * 100 : 0;
              const isHovered = hoveredMonthIndex === idx;

              return (
                <div
                  key={m.monthName}
                  className="flex flex-col items-center h-full justify-end group cursor-pointer"
                  onMouseEnter={() => setHoveredMonthIndex(idx)}
                  onMouseLeave={() => setHoveredMonthIndex(null)}
                >
                  {/* Tooltip */}
                  {isHovered && m.total > 0 && (
                    <div className="absolute -top-3 z-30 rounded-xl border border-white/20 bg-slate-950 px-3 py-2 text-center shadow-2xl pointer-events-none">
                      <span className="text-[10px] text-slate-400 block font-medium">
                        {m.monthName} {selectedYear}
                      </span>
                      <span className="text-xs font-black text-white font-mono block">
                        ₹{m.total.toLocaleString("en-IN")}
                      </span>
                      {m.maintenance > 0 && (
                        <span className="text-[9px] text-cyan-300 font-mono block">
                          Maint: ₹{m.maintenance}
                        </span>
                      )}
                      {m.water > 0 && (
                        <span className="text-[9px] text-teal-300 font-mono block">
                          Water: ₹{m.water}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Stacked Bar */}
                  <div className="w-full max-w-[22px] flex flex-col justify-end h-full">
                    {/* Corpus Segment */}
                    {corpusPct > 0 && (
                      <div
                        style={{ height: `${Math.max(3, corpusPct)}%` }}
                        className="w-full bg-amber-400 rounded-t-sm"
                      />
                    )}
                    {/* Water Segment */}
                    {waterPct > 0 && (
                      <div
                        style={{ height: `${Math.max(3, waterPct)}%` }}
                        className="w-full bg-teal-400"
                      />
                    )}
                    {/* Maintenance Segment */}
                    {maintPct > 0 && (
                      <div
                        style={{ height: `${Math.max(3, maintPct)}%` }}
                        className="w-full bg-cyan-500 rounded-b-sm"
                      />
                    )}
                    {m.total === 0 && (
                      <div className="h-1 w-full bg-slate-800 rounded-sm opacity-40" />
                    )}
                  </div>

                  <span className="mt-2 text-[10px] font-semibold text-slate-400">{m.monthName}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Share Donut / Distribution Breakdown (1 Col) */}
        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 sm:p-6 space-y-4 shadow-xl flex flex-col justify-between">
          <div className="border-b border-white/10 pb-3">
            <h3 className="text-sm sm:text-base font-bold text-white">Share of Expenses</h3>
            <p className="text-xs text-slate-400">Breakdown by category for {selectedYear}</p>
          </div>

          <div className="space-y-3.5 py-2">
            {/* Maintenance Share */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  Maintenance
                </span>
                <span className="font-mono text-white font-bold">
                  {maintenanceShare}% (₹{metrics.totalMaintenance.toLocaleString("en-IN")})
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div style={{ width: `${maintenanceShare}%` }} className="h-full bg-cyan-400 rounded-full" />
              </div>
            </div>

            {/* Water Share */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-teal-300 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-teal-400" />
                  Water Charges
                </span>
                <span className="font-mono text-white font-bold">
                  {waterShare}% (₹{metrics.totalWater.toLocaleString("en-IN")})
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div style={{ width: `${waterShare}%` }} className="h-full bg-teal-400 rounded-full" />
              </div>
            </div>

            {/* Corpus Share */}
            {metrics.totalCorpus > 0 && (
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    Corpus Fund
                  </span>
                  <span className="font-mono text-white font-bold">
                    {corpusShare}% (₹{metrics.totalCorpus.toLocaleString("en-IN")})
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div style={{ width: `${corpusShare}%` }} className="h-full bg-amber-400 rounded-full" />
                </div>
              </div>
            )}
          </div>

          {/* Average monthly estimate */}
          <div className="rounded-2xl bg-slate-950 p-3.5 border border-white/5 text-center">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-medium">
              Effective Monthly Average
            </span>
            <span className="text-xl font-black text-indigo-300 font-mono mt-0.5 block">
              ₹{Math.round(metrics.grandTotal / (selectedYear === "ALL" ? (availableYears.length * 12) : 12)).toLocaleString("en-IN")}
              <span className="text-xs font-normal text-slate-400 font-sans"> / mo</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
