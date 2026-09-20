"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authFetch";
import { SwiggyMetricCards } from "@/components/swiggy/SwiggyMetricCards";
import { SwiggyCharts } from "@/components/swiggy/SwiggyCharts";
import { SwiggyTopDishes } from "@/components/swiggy/SwiggyTopDishes";
import { SwiggyOrdersTable } from "@/components/swiggy/SwiggyOrdersTable";
import {
  SwiggyOrder,
  SwiggySummary,
  SwiggySyncProgress,
} from "@/lib/swiggy/types";
import {
  UtensilsCrossed,
  RefreshCw,
  Sparkles,
  BarChart2,
  Receipt,
  AlertCircle,
  CheckCircle2,
  Database,
} from "lucide-react";

type ActiveTab = "ANALYTICS" | "ORDERS";

export default function SwiggyPage() {
  const { user, userId, isSignedIn } = useAuth();
  const qUserId = user?.email || user?.uid || userId || "";

  const [activeTab, setActiveTab] = useState<ActiveTab>("ANALYTICS");
  const [summary, setSummary] = useState<SwiggySummary | null>(null);
  const [orders, setOrders] = useState<SwiggyOrder[]>([]);
  const [totalOrders, setTotalOrders] = useState<number>(0);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncType, setSyncType] = useState<"quick" | "full" | null>(null);

  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>("ALL");
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
        `/api/swiggy/summary?userId=${encodeURIComponent(qUserId)}&_t=${Date.now()}`
      );
      if (res.ok) {
        const data: SwiggySummary = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.error("Failed to load Swiggy summary:", err);
    }
  }, [isSignedIn, user, qUserId]);

  // Fetch orders list
  const fetchOrders = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        userId: qUserId,
        month: selectedMonth === "ALL" ? "" : selectedMonth,
        restaurant: selectedRestaurant === "ALL" ? "" : selectedRestaurant,
        search: searchQuery,
        limit: "100",
        _t: Date.now().toString(),
      });

      const res = await authFetch(user, `/api/swiggy/orders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setTotalOrders(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to load Swiggy orders:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, user, qUserId, selectedMonth, selectedRestaurant, searchQuery]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Handle Gmail Sync
  const handleSync = async (fullSync: boolean) => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      setSyncType(fullSync ? "full" : "quick");
      showToast(
        "info",
        fullSync
          ? "Starting full historical Swiggy sync from Gmail (may take up to a minute)..."
          : "Quick syncing recent Swiggy food orders..."
      );

      const res = await authFetch(user, "/api/swiggy/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: qUserId,
          fullSync,
          maxResults: fullSync ? 800 : 50,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to sync orders");
      }

      const progress: SwiggySyncProgress = await res.json();
      showToast("success", progress.statusMessage);

      // Refresh data
      await Promise.all([fetchSummary(), fetchOrders()]);
    } catch (err: any) {
      console.error("Sync error:", err);
      showToast("error", err.message || "Sync failed");
    } finally {
      setIsSyncing(false);
      setSyncType(null);
    }
  };

  // Derive distinct months from summary
  const availableMonths = useMemo(() => {
    if (!summary || !summary.monthlySpend) return [];
    return summary.monthlySpend.map((m) => m.month).reverse();
  }, [summary]);

  // Derive distinct restaurants from summary
  const availableRestaurants = useMemo(() => {
    if (!summary || !summary.topRestaurants) return [];
    return summary.topRestaurants.map((r) => r.name);
  }, [summary]);

  const handleFilterMonth = (month: string) => {
    setSelectedMonth(month);
    setActiveTab("ORDERS");
  };

  const handleFilterRestaurant = (restaurant: string) => {
    setSelectedRestaurant(restaurant);
    setActiveTab("ORDERS");
  };

  const handleMetricCardFilter = (filter: { month?: string; restaurant?: string }) => {
    if (filter.month !== undefined) setSelectedMonth(filter.month);
    if (filter.restaurant !== undefined) setSelectedRestaurant(filter.restaurant);
    setActiveTab("ORDERS");
  };

  return (
    <AuthGuard title="Swiggy Food">
      <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 selection:bg-orange-500/30">
        <FinanceTopBar title="Swiggy Food Orders" />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="flex items-center gap-3.5">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/25">
                <UtensilsCrossed className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Swiggy Food Delivery Tracker
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-orange-500/20 text-orange-400 border border-orange-500/30">
                    Restaurant Intel
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Automated email parsing, dining habit analytics, and receipt archive
                </p>
              </div>
            </div>

            {/* Sync Action Buttons */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleSync(false)}
                disabled={isSyncing}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-white text-xs font-semibold border border-white/10 shadow-sm transition active:scale-95 disabled:opacity-50 cursor-pointer"
                title="Fetch recent Swiggy orders (fast)"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-orange-400 ${
                    isSyncing && syncType === "quick" ? "animate-spin" : ""
                  }`}
                />
                <span>Quick Sync</span>
              </button>

              <button
                type="button"
                onClick={() => handleSync(true)}
                disabled={isSyncing}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold shadow-md shadow-orange-500/20 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                title="Scan all Gmail history for Swiggy food orders"
              >
                <Database
                  className={`w-3.5 h-3.5 ${
                    isSyncing && syncType === "full" ? "animate-spin" : ""
                  }`}
                />
                <span>Full History Sync</span>
              </button>
            </div>
          </div>

          {/* Toast notifications */}
          {toast && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 animate-in fade-in duration-200 ${
                toast.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : toast.type === "error"
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  : "bg-orange-500/10 border-orange-500/30 text-orange-300"
              }`}
            >
              {toast.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : toast.type === "error" ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <Sparkles className="w-4 h-4 shrink-0" />
              )}
              <span>{toast.message}</span>
            </div>
          )}

          {/* KPI Metric Cards */}
          {summary && (
            <SwiggyMetricCards
              summary={summary}
              onSelectFilter={handleMetricCardFilter}
            />
          )}

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-white/10 pb-1">
            <button
              type="button"
              onClick={() => setActiveTab("ANALYTICS")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === "ANALYTICS"
                  ? "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <BarChart2 className="w-4 h-4" />
              <span>Analytics & Insights</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("ORDERS")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === "ORDERS"
                  ? "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Orders Explorer ({totalOrders})</span>
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "ANALYTICS" && summary && (
            <div className="space-y-6">
              {/* Spend Trend Charts & Breakdown */}
              <SwiggyCharts
                monthlySpend={summary.monthlySpend}
                topRestaurants={summary.topRestaurants}
                cuisineBreakdown={summary.cuisineBreakdown}
                dayOfWeekBreakdown={summary.dayOfWeekBreakdown}
                timeSlotBreakdown={summary.timeSlotBreakdown}
                onSelectMonth={handleFilterMonth}
                onSelectRestaurant={handleFilterRestaurant}
              />

              {/* Top Dishes Leaderboard */}
              {summary.topDishes.length > 0 && (
                <SwiggyTopDishes dishes={summary.topDishes} />
              )}
            </div>
          )}

          {activeTab === "ORDERS" && (
            <SwiggyOrdersTable
              orders={orders}
              totalOrders={totalOrders}
              availableMonths={availableMonths}
              selectedMonth={selectedMonth}
              onSelectMonth={setSelectedMonth}
              availableRestaurants={availableRestaurants}
              selectedRestaurant={selectedRestaurant}
              onSelectRestaurant={setSelectedRestaurant}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              isLoading={isLoading}
            />
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
