"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { InstamartOrder } from "@/lib/instamart/types";
import { formatMonthName, formatReadableDate } from "@/lib/dateFormatting";
import {
  Search,
  Calendar,
  Eye,
  X,
  Copy,
  Check,
  Package,
  MapPin,
  Clock,
  Receipt,
  ShoppingBag,
} from "lucide-react";

interface InstamartOrdersTableProps {
  orders: InstamartOrder[];
  totalOrders: number;
  availableMonths: string[];
  selectedMonth: string;
  onSelectMonth: (m: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isLoading: boolean;
}

export function InstamartOrdersTable({
  orders,
  totalOrders,
  availableMonths,
  selectedMonth,
  onSelectMonth,
  searchQuery,
  onSearchChange,
  isLoading,
}: InstamartOrdersTableProps) {
  const [activeOrder, setActiveOrder] = useState<InstamartOrder | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (activeOrder) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [activeOrder]);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6 shadow-xl backdrop-blur-md">
      {/* Top Controls: Search, Month Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Order Ledger & Receipts ({totalOrders})
            </h3>
            <p className="text-xs text-slate-400">
              Complete line-item history extracted from delivered grocery emails
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Month Filter */}
          <div className="relative">
            <select
              value={selectedMonth}
              onChange={(e) => onSelectMonth(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Months</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {formatMonthName(m)}
                </option>
              ))}
            </select>
          </div>

          {/* Search box */}
          <div className="relative min-w-[200px]">
            <input
              type="text"
              placeholder="Search items, order ID, address..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-cyan-400 focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/5 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
              <th className="pb-2.5 pl-2">Date & Time</th>
              <th className="pb-2.5">Order ID</th>
              <th className="pb-2.5">Items Preview</th>
              <th className="pb-2.5 text-center">Items Count</th>
              <th className="pb-2.5 text-right">Handling Fee</th>
              <th className="pb-2.5 text-right">Grand Total</th>
              <th className="pb-2.5 pr-2 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-sans">
            {orders.map((ord) => {
              const previewNames = ord.items
                .slice(0, 3)
                .map((it) => it.name)
                .join(", ");
              const remainingCount = ord.items.length - 3;

              return (
                <tr
                  key={ord.id}
                  onClick={() => setActiveOrder(ord)}
                  className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                >
                  {/* Date */}
                  <td className="py-3 pl-2 whitespace-nowrap">
                    <div className="font-semibold text-white">
                      {formatReadableDate(ord.orderDate)}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {ord.orderTime} • {ord.dayOfWeek.slice(0, 3)}
                    </div>
                  </td>

                  {/* Order ID */}
                  <td className="py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-slate-300 font-medium">
                        #{ord.orderId.slice(-8)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(ord.orderId, ord.id);
                        }}
                        className="text-slate-500 hover:text-cyan-300 transition"
                        title="Copy full order ID"
                      >
                        {copiedId === ord.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* Items Preview */}
                  <td className="py-3 max-w-xs truncate">
                    <span className="text-slate-300 text-[11px]">
                      {previewNames}
                    </span>
                    {remainingCount > 0 && (
                      <span className="ml-1 text-slate-500 text-[10px]">
                        +{remainingCount} more
                      </span>
                    )}
                  </td>

                  {/* Count */}
                  <td className="py-3 text-center whitespace-nowrap font-mono text-slate-300">
                    <span className="inline-flex rounded-lg bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-200">
                      {ord.itemCount} units
                    </span>
                  </td>

                  {/* Handling Fee */}
                  <td className="py-3 text-right whitespace-nowrap font-mono text-slate-400">
                    ₹{ord.handlingFee || 0}
                  </td>

                  {/* Grand Total */}
                  <td className="py-3 text-right whitespace-nowrap font-mono font-bold text-white text-sm">
                    ₹{ord.grandTotal.toLocaleString("en-IN")}
                  </td>

                  {/* Action */}
                  <td className="py-3 pr-2 text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveOrder(ord);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-500/40 transition cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Receipt</span>
                    </button>
                  </td>
                </tr>
              );
            })}

            {orders.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">
                  No orders found. Click &quot;Sync from Gmail&quot; to import your orders.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Order Detail Modal / Receipt Drawer rendered via Portal to escape parent container traps */}
      {mounted &&
        activeOrder &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md"
            onClick={() => setActiveOrder(null)}
          >
            <div
              className="relative w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-3xl border border-white/15 bg-slate-900 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Fixed Header */}
              <div className="flex items-start justify-between border-b border-white/10 p-5 sm:p-6 bg-slate-950/50 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                      <span>Order #{activeOrder.orderId}</span>
                    </h3>
                    <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>
                        {formatReadableDate(activeOrder.orderDate)} at {activeOrder.orderTime} ({activeOrder.dayOfWeek})
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveOrder(null)}
                  className="rounded-xl p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 scrollbar-thin">
                {/* Delivery Address */}
                {activeOrder.deliveryAddress && (
                  <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3.5 text-xs text-slate-300 flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-white block">
                        Delivered To:
                      </span>
                      <span className="text-slate-300 leading-relaxed">
                        {activeOrder.deliveryAddress}
                      </span>
                    </div>
                  </div>
                )}

                {/* Line Items List */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Order Items ({activeOrder.items.length} unique, {activeOrder.itemCount} units)
                  </h4>
                  <div className="divide-y divide-white/5 rounded-2xl border border-white/5 bg-white/[0.01] max-h-60 overflow-y-auto px-3.5 scrollbar-thin">
                    {activeOrder.items.map((it, idx) => (
                      <div
                        key={idx}
                        className="py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-white truncate">
                            {it.name}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span className="rounded bg-white/5 px-1.5 py-0.2 text-[10px] text-slate-300">
                              {it.category}
                            </span>
                            <span>
                              {it.quantity} × ₹{it.unitPrice}
                            </span>
                          </div>
                        </div>
                        <span className="font-mono font-bold text-white text-sm shrink-0">
                          ₹{it.price}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Price Breakdown */}
                <div className="rounded-2xl border border-white/10 bg-slate-800/40 p-4 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span>Item Bill</span>
                    <span className="font-mono">₹{activeOrder.itemBill}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Handling Fee</span>
                    <span className="font-mono">₹{activeOrder.handlingFee}</span>
                  </div>
                  {activeOrder.deliveryFee > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>Delivery Partner Fee</span>
                      <span className="font-mono">₹{activeOrder.deliveryFee}</span>
                    </div>
                  )}
                  {activeOrder.discount > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Discount / Coupon</span>
                      <span className="font-mono">-₹{activeOrder.discount}</span>
                    </div>
                  )}
                  {activeOrder.tip > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>Delivery Tip</span>
                      <span className="font-mono">₹{activeOrder.tip}</span>
                    </div>
                  )}

                  <div className="border-t border-white/10 pt-2.5 flex justify-between text-sm font-extrabold text-white">
                    <span>Grand Total Paid</span>
                    <span className="font-mono text-base text-cyan-300">
                      ₹{activeOrder.grandTotal}
                    </span>
                  </div>
                </div>
              </div>

              {/* Fixed Footer */}
              <div className="flex justify-end p-4 border-t border-white/10 bg-slate-950/50 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveOrder(null)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-white hover:bg-white/10 transition cursor-pointer"
                >
                  Close Receipt
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
