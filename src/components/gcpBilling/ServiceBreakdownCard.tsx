"use client";

import React from "react";
import { GcpServiceSpend } from "@/lib/gcpBilling/types";
import { Server, Layers, ArrowUpRight } from "lucide-react";

interface ServiceBreakdownCardProps {
  services: GcpServiceSpend[];
  totalSpend: number;
  currency: string;
  selectedService?: string | null;
  onSelectService?: (serviceName: string | null) => void;
}

const SERVICE_COLORS = [
  "from-cyan-500 to-blue-600",
  "from-purple-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-pink-500 to-rose-600",
  "from-violet-500 to-fuchsia-600",
  "from-sky-500 to-blue-500",
];

export function ServiceBreakdownCard({
  services,
  totalSpend,
  currency,
  selectedService,
  onSelectService,
}: ServiceBreakdownCardProps) {
  if (!services || services.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center backdrop-blur-md">
        <Server className="h-8 w-8 text-slate-500 mb-2" />
        <p className="text-sm font-medium text-slate-400">No service spend records found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-cyan-400" />
          <h3 className="text-base font-bold text-white">Spend by Service</h3>
        </div>
        {selectedService && onSelectService && (
          <button
            onClick={() => onSelectService(null)}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-medium underline cursor-pointer"
          >
            Clear Filter
          </button>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {services.map((service, index) => {
          const percent = totalSpend > 0 ? (service.netCost / totalSpend) * 100 : 0;
          const colorGradient = SERVICE_COLORS[index % SERVICE_COLORS.length];
          const isSelected = selectedService === service.serviceName;

          return (
            <div
              key={service.serviceName || service.serviceId || `service-${index}`}
              onClick={() => onSelectService && onSelectService(isSelected ? null : service.serviceName)}
              className={`p-2.5 rounded-xl transition cursor-pointer border ${
                isSelected
                  ? "bg-white/10 border-cyan-500/50 shadow-md"
                  : "hover:bg-white/5 border-transparent"
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-1.5">
                <div className="flex items-center gap-2 max-w-[65%]">
                  <span
                    className={`h-2.5 w-2.5 rounded-full bg-gradient-to-r ${colorGradient} flex-shrink-0`}
                  />
                  <span className="font-semibold text-slate-200 truncate" title={service.serviceName}>
                    {service.serviceName}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <span className="font-bold text-white">
                    {currency} {service.netCost.toFixed(2)}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 w-10 text-right">
                    {percent.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${colorGradient} transition-all duration-500`}
                  style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
                />
              </div>

              {/* Credits annotation if any */}
              {service.credits > 0 && (
                <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1 pl-4.5">
                  <span>Gross: {currency} {service.cost.toFixed(2)}</span>
                  <span className="text-emerald-400 font-medium">Credits: -{currency} {service.credits.toFixed(2)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
