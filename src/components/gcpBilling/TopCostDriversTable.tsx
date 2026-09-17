"use client";

import React, { useState } from "react";
import { GcpSkuSpend } from "@/lib/gcpBilling/types";
import { Search, ListFilter, Tag, Cpu } from "lucide-react";

interface TopCostDriversTableProps {
  skus: GcpSkuSpend[];
  currency: string;
  filterService?: string | null;
}

export function TopCostDriversTable({
  skus,
  currency,
  filterService,
}: TopCostDriversTableProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = skus.filter((item) => {
    if (filterService && item.serviceName !== filterService) {
      return false;
    }
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.description.toLowerCase().includes(term) ||
      item.serviceName.toLowerCase().includes(term) ||
      item.projectId.toLowerCase().includes(term)
    );
  });

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Cpu className="h-4 w-4 text-cyan-400" />
            <span>Top Cost Drivers (SKUs)</span>
            {filterService && (
              <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-md">
                Filtered: {filterService}
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400">
            Granular consumption and pricing across your resources
          </p>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search SKU, service or project..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl bg-slate-800/80 border border-white/10 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400">
          No matching SKUs or cost drivers found.
        </div>
      ) : (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Service & SKU</th>
                <th className="py-2.5 px-3">Project</th>
                <th className="py-2.5 px-3 text-right">Usage</th>
                <th className="py-2.5 px-3 text-right">Gross Cost</th>
                <th className="py-2.5 px-3 text-right">Credits</th>
                <th className="py-2.5 px-3 text-right">Net Spend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {filtered.map((item, idx) => (
                <tr
                  key={`${item.skuId}-${item.projectId}-${idx}`}
                  className="hover:bg-white/5 transition"
                >
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-200">
                      {item.description}
                    </div>
                    <div className="text-[11px] text-cyan-400/80 font-mono mt-0.5">
                      {item.serviceName}
                    </div>
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-300 text-[11px]">
                    <span className="bg-slate-800/60 px-2 py-0.5 rounded border border-white/5">
                      {item.projectId}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">
                    {item.usageAmount > 0 ? (
                      <span title={`${item.usageAmount} ${item.usageUnit}`}>
                        {item.usageAmount.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        <span className="text-[10px] text-slate-400">
                          {item.usageUnit}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">
                    {currency} {item.cost.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right text-emerald-400">
                    {item.credits > 0 ? `-${currency} ${item.credits.toFixed(2)}` : "-"}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-white">
                    {currency} {item.netCost.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
