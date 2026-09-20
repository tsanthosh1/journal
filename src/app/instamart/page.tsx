"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authFetch";
import { InstamartMetricCards } from "@/components/instamart/InstamartMetricCards";
import { InstamartCharts } from "@/components/instamart/InstamartCharts";
import { InstamartTopItems } from "@/components/instamart/InstamartTopItems";
import { InstamartOrdersTable } from "@/components/instamart/InstamartOrdersTable";
import {
  InstamartOrder,
  InstamartSummary,
  InstamartSyncProgress,
} from "@/lib/instamart/types";
import {
  ShoppingBag,
  RefreshCw,
  Sparkles,
  BarChart2,
  Receipt,
  AlertCircle,
  CheckCircle2,
  Database,
} from "lucide-react";

type ActiveTab = "ANALYTICS" | "ORDERS";

export default function InstamartPage() {
  const { user, userId, isSignedIn } = useAuth();
  const qUserId = user?.email || user?.uid || userId || "";

  const [activeTab, setActiveTab] = useState<ActiveTab>("ANALYTICS");
  const [summary, setSummary] = useState<InstamartSummary | null>(null);
  const [orders, setOrders] = useState<InstamartOrder[]>([]);
  const [totalOrders, setTotalOrders] = useState<number>(0);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncType, setSyncType] = useState<"quick" | "full" | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [toast, setToast] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const showToast = (type: "success" | "error" | "info", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch summary data
  const fetchSummary = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const res = await authFetch(
        user,
        `/api/instamart/summary?userId=${encodeURIComponent(qUserId)}&_t=${Date.now()}`
      );
      if (res.ok) {
        const data: InstamartSummary = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.error("Failed to load Instamart summary:", err);
    }
  }, [isSignedIn, user, qUserId]);

  // Fetch orders list
  const fetchOrders = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        userId: qUserId,
        month: selectedMonth,
        search: searchQuery,
        limit: "100",
        _t: Date.now().toString(),
      });

      const res = await authFetch(user, `/api/instamart/orders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setTotalOrders(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to load Instamart orders:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, user, qUserId, selectedMonth, searchQuery]);

  useEffect(() => {
    fetchSummary();
    fetchOrders();
  }, [fetchSummary, fetchOrders]);

  // Handle Sync
  const handleSync = async (fullSync = false) => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncType(fullSync ? "full" : "quick");
    showToast(
      "info",
      fullSync
        ? "Starting full historical sync across all Instamart orders from Gmail..."
        : "Checking Gmail for recent Instamart orders..."
    );

    try {
      const res = await authFetch(user, "/api/instamart/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: qUserId,
          maxResults: fullSync ? 500 : 25,
          fullSync,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error || "Sync request failed");
      }

      const result: InstamartSyncProgress = await res.json();
      showToast(
        "success",
        `Sync completed: ${result.newlySynced} new orders archived (${result.skippedExisting} already in library).`
      );

      // Refresh data
      await Promise.all([fetchSummary(), fetchOrders()]);
    } catch (err: any) {
      console.error("Sync error:", err);
      showToast("error", err?.message || "Failed to sync orders from Gmail");
    } finally {
      setIsSyncing(false);
      setSyncType(null);
    }
  };

  const handleFilterMonth = (month: string) => {
    setSelectedMonth(month);
    setActiveTab("ORDERS");
  };

  const handleFilterCategory = (category: string) => {
    setSearchQuery(category);
    setActiveTab("ORDERS");
  };

  const handleMetricCardFilter = (filter: { month?: string; search?: string }) => {
    if (filter.month !== undefined) setSelectedMonth(filter.month);
    if (filter.search !== undefined) setSearchQuery(filter.search);
    setActiveTab("ORDERS");
  };

  const availableMonths = useMemo(() => {
    if (!summary?.monthlySpend) return [];
    return summary.monthlySpend.map((m) => m.month).reverse();
  }, [summary]);

  return (
    <AuthGuard title="Instamart">
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
        <FinanceTopBar title="Instamart" />

        {/* Toast Notification */}
        {toast && (
          <div className="fixed top-16 right-4 sm:right-8 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
            <div
              className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-xs font-semibold shadow-2xl backdrop-blur-xl ${
                toast.type === "success"
                  ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-200"
                  : toast.type === "error"
                  ? "bg-rose-950/90 border-rose-500/40 text-rose-200"
                  : "bg-slate-900/90 border-cyan-500/40 text-cyan-200"
              }`}
            >
              {toast.type === "success" && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              {toast.type === "error" && (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              {toast.type === "info" && (
                <RefreshCw className="w-4 h-4 text-cyan-400 shrink-0 animate-spin" />
              )}
              <span>{toast.message}</span>
            </div>
          </div>
        )}

        <main className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-12 py-6 sm:py-8 space-y-6 sm:space-y-8">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-6">
            <div className="flex items-center gap-3.5">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                  <span>Swiggy Instamart Intelligence</span>
                  <span className="rounded-full bg-orange-500/10 border border-orange-500/30 px-2.5 py-0.5 text-[11px] font-bold text-orange-400">
                    Auto Gmail Sync
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Track grocery spend, item frequency, inflation, and line-item delivery receipts
                </p>
              </div>
            </div>

            {/* Actions: Quick Sync & Full Backfill */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={isSyncing}
                onClick={() => handleSync(false)}
                className="inline-flex items-center gap-2 rounded-xl sm:rounded-2xl border border-white/10 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-cyan-400 ${
                    isSyncing && syncType === "quick" ? "animate-spin" : ""
                  }`}
                />
                <span>Sync Recent (25)</span>
              </button>

              <button
                type="button"
                disabled={isSyncing}
                onClick={() => handleSync(true)}
                className="inline-flex items-center gap-2 rounded-xl sm:rounded-2xl border border-orange-500/40 bg-orange-500/20 px-4 py-2 text-xs font-bold text-orange-300 hover:bg-orange-500/30 hover:border-orange-500/60 transition cursor-pointer shadow-lg shadow-orange-950/20 disabled:opacity-50"
              >
                <Database
                  className={`w-3.5 h-3.5 text-orange-400 ${
                    isSyncing && syncType === "full" ? "animate-spin" : ""
                  }`}
                />
                <span>Full History (All 194)</span>
              </button>
            </div>
          </div>

          {/* Metric KPI Cards */}
          {summary && (
            <InstamartMetricCards
              summary={summary}
              onSelectFilter={handleMetricCardFilter}
            />
          )}

          {/* View Mode Tabs */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("ANALYTICS")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
                  activeTab === "ANALYTICS"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Analytics & Insights</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("ORDERS")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
                  activeTab === "ORDERS"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Orders Explorer ({totalOrders})</span>
              </button>
            </div>

            <div className="text-xs text-slate-400 hidden sm:block">
              {summary ? `${summary.totalOrders} total orders parsed` : "Loading..."}
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === "ANALYTICS" && summary && (
            <div className="space-y-6 sm:space-y-8">
              <InstamartCharts
                monthlySpend={summary.monthlySpend}
                categories={summary.categoryBreakdown}
                dayOfWeekBreakdown={summary.dayOfWeekBreakdown}
                timeSlotBreakdown={summary.timeSlotBreakdown}
                onSelectMonth={handleFilterMonth}
                onSelectCategory={handleFilterCategory}
              />

              <InstamartTopItems items={summary.topItems} />
            </div>
          )}

          {activeTab === "ORDERS" && (
            <div>
              <InstamartOrdersTable
                orders={orders}
                totalOrders={totalOrders}
                availableMonths={availableMonths}
                selectedMonth={selectedMonth}
                onSelectMonth={setSelectedMonth}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                isLoading={isLoading}
              />
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
