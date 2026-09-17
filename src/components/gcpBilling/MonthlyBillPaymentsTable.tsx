"use client";

import React from "react";
import { GcpMonthlySpend } from "@/lib/gcpBilling/types";
import {
  CreditCard,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Receipt,
  Layers,
  Sparkles,
} from "lucide-react";

interface MonthlyBillPaymentsTableProps {
  monthlyData: GcpMonthlySpend[];
  currency: string;
  onFilterMonth?: (invoiceMonth: string) => void;
}

export function MonthlyBillPaymentsTable({
  monthlyData,
  currency,
  onFilterMonth,
}: MonthlyBillPaymentsTableProps) {
  const [showAll, setShowAll] = React.useState(false);

  if (!monthlyData || monthlyData.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center backdrop-blur-md">
        <Receipt className="h-8 w-8 text-slate-500 mb-2" />
        <p className="text-sm font-medium text-slate-400">No monthly bill payments found</p>
      </div>
    );
  }

  const sortedData = [...monthlyData].sort((a, b) => b.invoiceMonth.localeCompare(a.invoiceMonth));
  const displayRows = showAll ? sortedData : sortedData.slice(0, 8);

  const totalInvoiced = monthlyData.reduce((acc, m) => acc + m.netCost, 0);
  const totalCredits = monthlyData.reduce((acc, m) => acc + m.credits, 0);
  const totalGross = monthlyData.reduce((acc, m) => acc + m.cost, 0);

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Receipt className="h-4 w-4" />
            </div>
            <h3 className="text-base font-bold text-white">Monthly Bill Invoices & Payments</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Historical billing cycles, monthly charges, and promotional credit deductions
          </p>
        </div>

        {/* Quick stats badge */}
        <div className="flex items-center gap-3 text-xs bg-slate-800/80 border border-white/10 px-3 py-1.5 rounded-xl">
          <span className="text-slate-400">
            Total Billed: <span className="text-white font-extrabold">{currency} {totalInvoiced.toFixed(2)}</span>
          </span>
          {totalCredits > 0 && (
            <>
              <span className="text-slate-500">|</span>
              <span className="text-emerald-400 font-semibold">
                Saved: {currency} {totalCredits.toFixed(2)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto mt-4">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/10 text-slate-400 font-semibold">
              <th className="py-2.5 px-3">Billing Cycle / Month</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Footprint</th>
              <th className="py-2.5 px-3 text-right">Gross Usage</th>
              <th className="py-2.5 px-3 text-right">Credits Applied</th>
              <th className="py-2.5 px-3 text-right">Net Amount Due / Paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-sans">
            {displayRows.map((m) => {
              const isCurrent = m.status === "CURRENT";
              return (
                <tr
                  key={m.invoiceMonth}
                  className="hover:bg-white/5 transition"
                >
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100 text-sm">
                        {m.formattedMonth}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-800/70 px-1.5 py-0.5 rounded">
                        {m.invoiceMonth}
                      </span>
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300">
                        <Clock className="h-3 w-3 animate-pulse text-cyan-400" />
                        <span>Current Cycle</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        <span>Invoiced / Paid</span>
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-slate-300 text-[11px]">
                    <span className="text-slate-200 font-medium">
                      {m.serviceCount} services
                    </span>
                    <span className="text-slate-500 mx-1">•</span>
                    <span className="text-slate-400">
                      {m.projectCount} {m.projectCount === 1 ? "project" : "projects"}
                    </span>
                  </td>

                  <td className="py-3 px-3 text-right text-slate-300 font-medium">
                    {currency} {m.cost.toFixed(2)}
                  </td>

                  <td className="py-3 px-3 text-right font-medium">
                    {m.credits > 0 ? (
                      <span className="text-emerald-400">
                        -{currency} {m.credits.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-right">
                    <span className="font-extrabold text-sm text-white">
                      {currency} {m.netCost.toFixed(2)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sortedData.length > 8 && (
        <div className="pt-3 mt-1 border-t border-white/5 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold px-3 py-1.5 rounded-xl hover:bg-white/5 transition cursor-pointer"
          >
            {showAll ? "Show Fewer Invoices" : `Show All ${sortedData.length} Invoices`}
          </button>
        </div>
      )}
    </div>
  );
}
