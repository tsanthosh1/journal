"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { SwiggyOrder } from "@/lib/swiggy/types";
import { formatMonthName, formatReadableDate } from "@/lib/dateFormatting";
import {
  Search,
  Receipt,
  Eye,
  X,
  Copy,
  Check,
  Clock,
  MapPin,
  UtensilsCrossed,
  Tag,
  Store,
  Sparkles,
} from "lucide-react";

interface SwiggyOrdersTableProps {
  orders: SwiggyOrder[];
  totalOrders: number;
  availableMonths: string[];
  selectedMonth: string;
  onSelectMonth: (m: string) => void;
  availableRestaurants: string[];
  selectedRestaurant: string;
  onSelectRestaurant: (r: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isLoading: boolean;
}

export function SwiggyOrdersTable({
  orders,
  totalOrders,
  availableMonths,
  selectedMonth,
  onSelectMonth,
  availableRestaurants,
  selectedRestaurant,
  onSelectRestaurant,
  searchQuery,
  onSearchChange,
  isLoading,
}: SwiggyOrdersTableProps) {
  const [activeOrder, setActiveOrder] = useState<SwiggyOrder | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when receipt modal is active
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

  // Handle Esc key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeOrder) {
        setActiveOrder(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
      {/* Top Controls: Search, Month Filter, Restaurant Filter */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Order Ledger & Receipts ({totalOrders})
            </h3>
            <p className="text-xs text-slate-400">
              Complete restaurant order receipts extracted from delivered emails
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Restaurant Filter */}
          <div className="relative">
            <select
              value={selectedRestaurant}
              onChange={(e) => onSelectRestaurant(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:border-orange-400 focus:outline-none cursor-pointer max-w-[150px] truncate"
            >
              <option value="ALL">All Restaurants</option>
              {availableRestaurants.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Month Filter */}
          <div className="relative">
            <select
              value={selectedMonth}
              onChange={(e) => onSelectMonth(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:border-orange-400 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Months</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {formatMonthName(m)}
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search dishes, restaurant, coupon..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-white/10 bg-slate-800 text-xs text-white placeholder-slate-500 focus:border-orange-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/5 text-slate-400">
              <th className="pb-3 pl-1 font-semibold">Date & Time</th>
              <th className="pb-3 font-semibold">Restaurant</th>
              <th className="pb-3 font-semibold">Dishes Ordered</th>
              <th className="pb-3 font-semibold text-center">Items</th>
              <th className="pb-3 font-semibold text-center">Speed</th>
              <th className="pb-3 font-semibold text-right">Total</th>
              <th className="pb-3 pr-1 font-semibold text-right">Receipt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    <span>Loading Swiggy orders...</span>
                  </div>
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">
                  No orders found matching the filter criteria.
                </td>
              </tr>
            ) : (
              orders.map((ord) => {
                const isCopied = copiedId === ord.orderId;

                return (
                  <tr
                    key={ord.id}
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    {/* Date */}
                    <td className="py-3 pl-1 text-slate-300 font-mono whitespace-nowrap">
                      <div className="font-semibold text-white">
                        {formatReadableDate(ord.orderDate)}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{ord.orderTime.slice(0, 5)}</span>
                        <span>•</span>
                        <span>{ord.dayOfWeek.slice(0, 3)}</span>
                      </div>
                    </td>

                    {/* Restaurant */}
                    <td className="py-3 font-medium text-white max-w-[180px]">
                      <div
                        className="truncate font-semibold text-slate-200 group-hover:text-orange-300 transition-colors"
                        title={ord.restaurantName}
                      >
                        {ord.restaurantName}
                      </div>
                      <div
                        className="text-[10px] text-slate-400 truncate max-w-[180px]"
                        title={ord.restaurantAddress}
                      >
                        {ord.restaurantAddress || "Chennai"}
                      </div>
                    </td>

                    {/* Dishes summary */}
                    <td className="py-3 max-w-[240px]">
                      <div
                        className="truncate text-slate-300"
                        title={ord.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}
                      >
                        {ord.items.map((i) => i.name).slice(0, 2).join(", ")}
                        {ord.items.length > 2 && (
                          <span className="text-slate-500 text-[11px] ml-1">
                            +{ord.items.length - 2} more
                          </span>
                        )}
                      </div>
                      {ord.couponCode && (
                        <div className="mt-0.5">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-500/10 text-rose-300 border border-rose-500/20">
                            <Tag className="w-2.5 h-2.5" />
                            {ord.couponCode} (-₹{ord.discount})
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Items count */}
                    <td className="py-3 text-center font-mono text-slate-400 whitespace-nowrap">
                      {ord.itemCount} units
                    </td>

                    {/* Delivery duration */}
                    <td className="py-3 text-center whitespace-nowrap">
                      {ord.deliveryDurationMinutes ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            ord.deliveryDurationMinutes <= 25
                              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                              : ord.deliveryDurationMinutes <= 40
                              ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                              : "bg-slate-700/30 text-slate-300"
                          }`}
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                          {ord.deliveryDurationMinutes}m
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">—</span>
                      )}
                    </td>

                    {/* Total */}
                    <td className="py-3 text-right font-mono font-bold text-white whitespace-nowrap">
                      ₹{ord.grandTotal.toLocaleString("en-IN")}
                    </td>

                    {/* Actions: View Receipt */}
                    <td className="py-3 pr-1 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setActiveOrder(ord)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-orange-500/10 hover:text-orange-300 hover:border-orange-500/30 transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Receipt</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Receipt Modal Popup rendered via Portal */}
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
              {/* Header */}
              <div className="flex items-start justify-between border-b border-white/10 p-5 sm:p-6 bg-slate-950/50 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
                    <UtensilsCrossed className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                      <span>Order #{activeOrder.orderId}</span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(activeOrder.orderId, activeOrder.orderId)
                        }
                        className="text-slate-400 hover:text-white transition"
                        title="Copy Order ID"
                      >
                        {copiedId === activeOrder.orderId ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </h3>
                    <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-orange-400" />
                      <span>
                        {formatReadableDate(activeOrder.orderDate)} at {activeOrder.orderTime} (
                        {activeOrder.dayOfWeek})
                      </span>
                      {activeOrder.deliveryDurationMinutes && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-400 font-medium">
                            Delivered in {activeOrder.deliveryDurationMinutes} mins
                          </span>
                        </>
                      )}
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

              {/* Body */}
              <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 scrollbar-thin">
                {/* Restaurant Details */}
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3.5 text-xs text-slate-300 flex items-start gap-2.5">
                  <Store className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-white block">
                      {activeOrder.restaurantName}
                    </span>
                    {activeOrder.restaurantAddress && (
                      <span className="text-slate-400 leading-relaxed block mt-0.5">
                        {activeOrder.restaurantAddress}
                      </span>
                    )}
                  </div>
                </div>

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

                {/* Items list */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Dishes ({activeOrder.items.length} items, {activeOrder.itemCount} units)
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
                              {it.cuisine}
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

                {/* Fees & Price breakdown */}
                <div className="rounded-2xl border border-white/10 bg-slate-800/40 p-4 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span>Item Total</span>
                    <span className="font-mono">₹{activeOrder.itemBill}</span>
                  </div>
                  {activeOrder.packagingFee > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>Restaurant Packaging</span>
                      <span className="font-mono">₹{activeOrder.packagingFee}</span>
                    </div>
                  )}
                  {activeOrder.platformFee > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>Platform Fee</span>
                      <span className="font-mono">₹{activeOrder.platformFee}</span>
                    </div>
                  )}
                  {activeOrder.deliveryFee > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>Delivery Fee</span>
                      <span className="font-mono">₹{activeOrder.deliveryFee}</span>
                    </div>
                  )}
                  {activeOrder.taxes > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>Taxes & GST</span>
                      <span className="font-mono">₹{activeOrder.taxes}</span>
                    </div>
                  )}
                  {activeOrder.discount > 0 && (
                    <div className="flex justify-between text-rose-400 font-medium">
                      <span>
                        Discount Applied
                        {activeOrder.couponCode ? ` (${activeOrder.couponCode})` : ""}
                      </span>
                      <span className="font-mono">-₹{activeOrder.discount}</span>
                    </div>
                  )}
                  {activeOrder.tip > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>Delivery Partner Tip</span>
                      <span className="font-mono">₹{activeOrder.tip}</span>
                    </div>
                  )}

                  <div className="border-t border-white/10 pt-2.5 flex justify-between text-sm font-extrabold text-white">
                    <span>Grand Total Paid</span>
                    <span className="font-mono text-base text-orange-400">
                      ₹{activeOrder.grandTotal}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
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
