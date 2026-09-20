"use client";

import React, { useState } from "react";
import { AmazonOrder, AmazonOrderFilter } from "@/lib/amazon/types";
import { formatMonthName, formatReadableDate } from "@/lib/dateFormatting";
import {
  Search,
  ExternalLink,
  Trash2,
  BookOpen,
  RotateCcw,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  Package,
  Calendar,
  User,
  CreditCard,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Tag,
  Truck,
  AlertTriangle,
} from "lucide-react";

interface Props {
  orders: AmazonOrder[];
  total: number;
  isLoading: boolean;
  filter: AmazonOrderFilter;
  onFilterChange: (newFilter: AmazonOrderFilter) => void;
  onDeleteOrder: (orderId: string) => void;
  onClearAll?: () => void;
  availableMonths: string[];
  availableRecipients: string[];
}

export function AmazonOrdersTable({
  orders,
  total,
  isLoading,
  filter,
  onFilterChange,
  onDeleteOrder,
  onClearAll,
  availableMonths,
  availableRecipients,
}: Props) {
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

  const toggleExpand = (orderId: string) => {
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    orders.forEach((o) => {
      allExpanded[o.orderId] = true;
    });
    setExpandedOrders(allExpanded);
  };

  const collapseAll = () => {
    setExpandedOrders({});
  };

  const copyOrderId = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(orderId);
    setCopiedOrderId(orderId);
    setTimeout(() => {
      setCopiedOrderId(null);
    }, 2000);
  };

  const currencyFormatter = new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: "currency",
  });

  const currentPage = Math.floor((filter.offset || 0) / (filter.limit || 50)) + 1;
  const totalPages = Math.ceil(total / (filter.limit || 50)) || 1;

  const handlePageChange = (newPage: number) => {
    const newOffset = (newPage - 1) * (filter.limit || 50);
    onFilterChange({ ...filter, offset: newOffset });
  };

  const renderStatusBadge = (status?: string) => {
    if (!status) return null;
    const s = status.toLowerCase();
    let badgeClass = "border-slate-700 bg-slate-800/80 text-slate-300";
    let Icon = Truck;

    if (s.includes("delivered")) {
      badgeClass = "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
      Icon = Check;
    } else if (s.includes("cancel") || s.includes("return")) {
      badgeClass = "border-rose-500/30 bg-rose-500/10 text-rose-300";
      Icon = AlertTriangle;
    } else if (s.includes("arriving") || s.includes("out for delivery") || s.includes("dispatch")) {
      badgeClass = "border-cyan-500/30 bg-cyan-500/10 text-cyan-300";
      Icon = Truck;
    }

    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}>
        <Icon className="h-3 w-3" />
        <span className="truncate max-w-[200px]">{status}</span>
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Controls & Filter Card */}
      <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md">
        {/* Search Bar & Dropdowns */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by product name, ASIN, order ID, status, or recipient..."
              value={filter.search || ""}
              onChange={(e) => onFilterChange({ ...filter, search: e.target.value, offset: 0 })}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 py-2.5 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>

          {/* Dropdowns */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Month Dropdown */}
            <select
              value={filter.month || "ALL"}
              onChange={(e) =>
                onFilterChange({
                  ...filter,
                  month: e.target.value === "ALL" ? undefined : e.target.value,
                  offset: 0,
                })
              }
              aria-label="Filter by month"
              className="cursor-pointer rounded-2xl border border-white/10 bg-slate-950/80 px-3.5 py-2.5 text-xs font-semibold text-slate-300 focus:border-amber-400 focus:outline-none"
            >
              <option value="ALL">All Months</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {formatMonthName(m)}
                </option>
              ))}
            </select>

            {/* Recipient Dropdown */}
            <select
              value={filter.recipient || "ALL"}
              onChange={(e) =>
                onFilterChange({
                  ...filter,
                  recipient: e.target.value === "ALL" ? undefined : e.target.value,
                  offset: 0,
                })
              }
              aria-label="Filter by recipient"
              className="cursor-pointer rounded-2xl border border-white/10 bg-slate-950/80 px-3.5 py-2.5 text-xs font-semibold text-slate-300 focus:border-amber-400 focus:outline-none"
            >
              <option value="ALL">All Recipients</option>
              {availableRecipients.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Type Filter Chips, Controls & Truncate Action */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Filter:
            </span>
            {(
              [
                { id: "ALL", label: `All (${total})` },
                { id: "PHYSICAL", label: "Physical Orders" },
                { id: "KINDLE", label: "Kindle Unlimited" },
                { id: "REFUNDED", label: "Refunded Orders" },
                { id: "CANCELLED", label: "Cancelled / Returned" },
              ] as const
            ).map((t) => {
              const isSelected = (filter.type || "ALL") === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    onFilterChange({
                      ...filter,
                      type: t.id === "ALL" ? undefined : t.id,
                      offset: 0,
                    })
                  }
                  className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    isSelected
                      ? "bg-amber-400 text-slate-950 shadow-sm"
                      : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {orders.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={expandAll}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-white"
                  title="Expand all items"
                >
                  <Maximize2 className="h-3 w-3" />
                  Expand All
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-white"
                  title="Collapse multi-item orders"
                >
                  <Minimize2 className="h-3 w-3" />
                  Collapse All
                </button>
              </>
            ) : null}

            {onClearAll && total > 0 ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm("Are you sure you want to delete and truncate ALL Amazon orders? This action cannot be undone.")) {
                    onClearAll();
                  }
                }}
                className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-400 transition hover:bg-rose-500/20"
                title="Truncate all orders data"
              >
                <Trash2 className="h-3 w-3" />
                Truncate Data
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Orders List as Modern Cards with Product Images */}
      {isLoading ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 bg-slate-900/50 p-8 text-sm text-slate-400">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          Loading orders...
        </div>
      ) : orders.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-slate-900/30 p-10 text-center">
          <ShoppingBag className="h-12 w-12 text-slate-600" />
          <h4 className="mt-3 text-base font-semibold text-white">
            No Amazon orders found
          </h4>
          <p className="mt-1 max-w-sm text-xs text-slate-400">
            No orders match your filter criteria. Try clearing search keywords or selecting all months.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {orders.map((order) => {
            const isExpanded = expandedOrders[order.orderId];
            const hasMultipleItems = order.items.length > 1;
            const isCopied = copiedOrderId === order.orderId;
            const amazonDetailsUrl =
              order.orderUrl ||
              `https://www.amazon.in/your-orders/order-details?orderID=${order.orderId}`;

            const firstStructuredItem = order.orderItems?.[0];
            const firstThumbnail = firstStructuredItem?.imageUrl;

            return (
              <div
                key={order.orderId}
                className="group relative flex flex-col gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900/95 via-slate-900/90 to-slate-950/90 p-4 shadow-md transition hover:border-amber-400/30 hover:shadow-xl sm:p-5"
              >
                {/* Accent Highlight Bar */}
                {order.isKindleUnlimited ? (
                  <div className="absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-amber-400" />
                ) : (order.refundAmount || 0) > 0 ? (
                  <div className="absolute left-0 top-0 h-full w-1 rounded-l-2xl bg-rose-500" />
                ) : null}

                {/* Top Section: Thumbnail, Hero Title & Price */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  {/* Left: Thumbnail & Title */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0 pr-0 sm:pr-4">
                    {firstThumbnail ? (
                      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white p-1 shadow-sm overflow-hidden sm:h-20 sm:w-20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={firstThumbnail}
                          alt={order.items[0] || "Amazon product"}
                          className="h-full w-full object-contain"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-800 text-slate-500 sm:h-20 sm:w-20">
                        <Package className="h-8 w-8" />
                      </div>
                    )}

                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {renderStatusBadge(order.orderStatus)}
                        {order.totalSavings && order.totalSavings > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                            <Tag className="h-3 w-3" />
                            Saved {currencyFormatter.format(order.totalSavings)}
                          </span>
                        ) : null}
                      </div>

                      <h3 className="select-text text-base font-semibold leading-snug tracking-tight text-white transition group-hover:text-amber-100">
                        {order.items[0]}
                      </h3>

                      {firstStructuredItem?.asin ? (
                        <span className="font-mono text-[11px] text-slate-500 mt-0.5">
                          ASIN: {firstStructuredItem.asin}
                        </span>
                      ) : null}

                      {/* Multi-item collapsed trigger */}
                      {hasMultipleItems && !isExpanded ? (
                        <button
                          type="button"
                          onClick={() => toggleExpand(order.orderId)}
                          className="mt-1.5 inline-flex cursor-pointer items-center gap-1 self-start rounded-md bg-amber-400/10 px-2 py-0.5 text-xs font-semibold text-amber-400 transition hover:bg-amber-400/20"
                        >
                          <span>+{order.items.length - 1} more item{order.items.length > 2 ? "s" : ""} in this order</span>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Right: Amount & Currency */}
                  <div className="flex items-baseline justify-between sm:flex-col sm:items-end sm:justify-start gap-1 shrink-0">
                    <span className="font-mono text-xl font-bold tracking-tight text-white sm:text-2xl">
                      {currencyFormatter.format(order.totalAmount)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <CreditCard className="h-3 w-3 text-slate-500" />
                      {order.paymentMethod || "Amazon Pay"}
                    </span>
                  </div>
                </div>

                {/* Multi-item Expanded List with Thumbnails */}
                {hasMultipleItems && isExpanded ? (
                  <div className="flex flex-col gap-2.5 rounded-xl bg-slate-950/50 p-3.5 border border-white/5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      All Items in this Order ({order.items.length}):
                    </div>
                    {order.orderItems && order.orderItems.length > 0 ? (
                      order.orderItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/2 p-2 text-xs"
                        >
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            {item.imageUrl ? (
                              <div className="h-10 w-10 shrink-0 rounded-lg bg-white p-0.5 border border-white/10 overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={item.imageUrl}
                                  alt={item.title}
                                  className="h-full w-full object-contain"
                                  loading="lazy"
                                />
                              </div>
                            ) : (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-500">
                                <Package className="h-4 w-4" />
                              </div>
                            )}
                            <div className="flex flex-col flex-1 min-w-0">
                              <span className="font-medium text-slate-200 truncate">{item.title}</span>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                                <span>Qty: {item.quantity}</span>
                                {item.asin ? <span>• ASIN: {item.asin}</span> : null}
                              </div>
                            </div>
                          </div>
                          {item.price > 0 ? (
                            <span className="font-mono font-bold text-white shrink-0">
                              {currencyFormatter.format(item.price)}
                            </span>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      order.items.map((item, idx) => (
                        <div
                          key={idx}
                          className={`flex items-start gap-2.5 text-xs ${
                            idx === 0 ? "text-amber-200 font-semibold" : "text-slate-200"
                          }`}
                        >
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-slate-300">
                            {idx + 1}
                          </span>
                          <span className="leading-snug break-words select-text">{item}</span>
                        </div>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={() => toggleExpand(order.orderId)}
                      className="mt-1 self-start inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white"
                    >
                      <span>Show less</span>
                      <ChevronUp className="h-3 w-3" />
                    </button>
                  </div>
                ) : null}

                {/* Bottom Row: Metadata Pills & Quick Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2.5 text-xs">
                  {/* Metadata Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    {/* Order ID Pill */}
                    <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-xs">
                      <Package className="h-3 w-3 text-amber-400" />
                      <a
                        href={amazonDetailsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs font-medium text-amber-300 hover:text-amber-200 hover:underline"
                        title="View order on Amazon"
                      >
                        {order.orderId}
                      </a>
                      <button
                        type="button"
                        onClick={(e) => copyOrderId(order.orderId, e)}
                        className="cursor-pointer p-0.5 text-slate-400 hover:text-white"
                        title="Copy order ID"
                      >
                        {isCopied ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>

                    {/* Date Badge */}
                    <span className="inline-flex items-center gap-1 rounded-lg border border-white/5 bg-white/5 px-2 py-0.5 text-slate-300">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      <span>{formatReadableDate(order.orderDate)}</span>
                    </span>

                    {/* Recipient Badge */}
                    <span
                      className="inline-flex items-center gap-1 rounded-lg border border-white/5 bg-white/5 px-2 py-0.5 text-slate-300"
                      title={order.recipientCityPostal ? `${order.recipientStreet || ""}, ${order.recipientCityPostal}` : undefined}
                    >
                      <User className="h-3 w-3 text-amber-400/80" />
                      <span>To: {order.recipient}</span>
                    </span>

                    {/* Kindle Unlimited Badge */}
                    {order.isKindleUnlimited ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/15 px-2.5 py-0.5 font-semibold text-amber-300">
                        <BookOpen className="h-3 w-3" />
                        Kindle Unlimited
                      </span>
                    ) : null}

                    {/* Refunded Badge */}
                    {(order.refundAmount || 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/15 px-2.5 py-0.5 font-semibold text-rose-300">
                        <RotateCcw className="h-3 w-3" />
                        Refunded: {currencyFormatter.format(order.refundAmount || 0)}
                      </span>
                    ) : null}
                  </div>

                  {/* Actions: View on Amazon & Delete */}
                  <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                    <a
                      href={amazonDetailsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-amber-400/40 hover:bg-amber-400/10 hover:text-amber-300"
                      title="Open on Amazon.in"
                    >
                      <span>Amazon</span>
                      <ExternalLink className="h-3 w-3 opacity-70" />
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete Amazon order ${order.orderId}?`)) {
                          onDeleteOrder(order.orderId);
                        }
                      }}
                      className="cursor-pointer rounded-lg p-1 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400"
                      title="Delete order record"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 ? (
        <div className="flex flex-col items-center justify-between gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-lg backdrop-blur-md sm:flex-row sm:px-6">
          <div className="text-xs text-slate-400">
            Showing{" "}
            <strong>
              {(filter.offset || 0) + 1} - {Math.min((filter.offset || 0) + (filter.limit || 50), total)}
            </strong>{" "}
            of <strong>{total}</strong> orders
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(currentPage - 1)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>

            <span className="px-2 text-xs font-medium text-slate-400">
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
