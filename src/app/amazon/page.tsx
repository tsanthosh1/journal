"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authFetch";
import { AmazonMetricCards } from "@/components/amazon/AmazonMetricCards";
import { AmazonInsights } from "@/components/amazon/AmazonInsights";
import { AmazonOrdersTable } from "@/components/amazon/AmazonOrdersTable";
import { AmazonUploadModal } from "@/components/amazon/AmazonUploadModal";
import {
  AmazonOrder,
  AmazonOrderFilter,
  AmazonSummary,
  AmazonImportResult,
} from "@/lib/amazon/types";
import { formatReadableDate } from "@/lib/dateFormatting";
import {
  Package,
  Upload,
  BarChart2,
  ListOrdered,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Trash2,
} from "lucide-react";

export default function AmazonOrdersPage() {
  const { user, userId, isSignedIn } = useAuth();

  const [activeTab, setActiveTab] = useState<"INSIGHTS" | "ORDERS">("INSIGHTS");
  const [summary, setSummary] = useState<AmazonSummary | null>(null);
  const [orders, setOrders] = useState<AmazonOrder[]>([]);
  const [totalOrders, setTotalOrders] = useState<number>(0);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isKindleLinked, setIsKindleLinked] = useState<boolean>(false);
  const [isLinkingKindle, setIsLinkingKindle] = useState<boolean>(false);

  const [filter, setFilter] = useState<AmazonOrderFilter>({
    limit: 50,
    offset: 0,
  });

  const [toast, setToast] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const showToast = (type: "success" | "error" | "info", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 6000);
  };

  // Fetch summary & insights
  const fetchSummary = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const res = await authFetch(user, `/api/amazon/summary?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error("Failed to load Amazon summary:", err);
    }
  }, [isSignedIn, user]);

  // Fetch paginated orders
  const fetchOrders = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (filter.month) params.set("month", filter.month);
      if (filter.recipient) params.set("recipient", filter.recipient);
      if (filter.type) params.set("type", filter.type);
      if (filter.search) params.set("search", filter.search);
      if (filter.limit) params.set("limit", filter.limit.toString());
      if (filter.offset) params.set("offset", filter.offset.toString());
      params.set("_t", Date.now().toString());

      const res = await authFetch(user, `/api/amazon/orders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setTotalOrders(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to load Amazon orders:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, user, filter]);

  // Fetch Kindle Unlimited subscription status
  const fetchKindleStatus = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const res = await authFetch(user, `/api/amazon/link-subscription?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setIsKindleLinked(Boolean(data.isLinked));
      }
    } catch (err) {
      console.error("Failed to check Kindle subscription status:", err);
    }
  }, [isSignedIn, user]);

  // Initial load
  useEffect(() => {
    fetchSummary();
    fetchOrders();
    fetchKindleStatus();
  }, [fetchSummary, fetchOrders, fetchKindleStatus]);

  // JSON upload handler passed to modal
  const handleUploadEndpoint = async (
    jsonContents: string[],
    truncateFirst: boolean,
  ): Promise<AmazonImportResult> => {
    const res = await authFetch(user, "/api/amazon/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonContents, truncateFirst }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Upload failed");
    }

    return data;
  };

  const handleImportSuccess = (result: AmazonImportResult) => {
    const dupNotice =
      result.duplicatesInSource > 0
        ? ` (${result.duplicatesInSource} duplicates de-duplicated)`
        : "";
    const truncNotice = result.truncatedFirst ? " [Existing data was cleared]" : "";

    showToast(
      "success",
      `Successfully processed ${result.totalRows} orders (${result.importedOrders} new, ${result.updatedOrders} updated)${dupNotice}.${truncNotice}`,
    );
    fetchSummary();
    fetchOrders();
    fetchKindleStatus();
  };

  // Link Kindle Unlimited Subscription
  const handleLinkKindle = async () => {
    try {
      setIsLinkingKindle(true);
      const res = await authFetch(user, "/api/amazon/link-subscription", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to link subscription");
      }
      setIsKindleLinked(true);
      showToast("success", data.message || "Kindle Unlimited linked to Subscriptions!");
    } catch (err: any) {
      showToast("error", err.message || "Could not link Kindle subscription.");
    } finally {
      setIsLinkingKindle(false);
    }
  };

  // Delete an individual order
  const handleDeleteOrder = async (orderId: string) => {
    try {
      const res = await authFetch(user, `/api/amazon/orders?orderId=${encodeURIComponent(orderId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast("info", `Order ${orderId} deleted.`);
        fetchSummary();
        fetchOrders();
      }
    } catch (err) {
      showToast("error", "Failed to delete order.");
    }
  };

  // Clear all Amazon orders
  const handleClearAll = async () => {
    try {
      const res = await authFetch(user, "/api/amazon/orders?all=true", {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        showToast("info", data.message || "All Amazon orders cleared.");
        fetchSummary();
        fetchOrders();
      } else {
        showToast("error", data.error || "Failed to clear Amazon orders.");
      }
    } catch (err) {
      showToast("error", "Failed to clear Amazon orders.");
    }
  };

  // Filter click-through handler from insights & metric cards
  const handleSelectFilter = (newFilter: Partial<AmazonOrderFilter>) => {
    setFilter((prev) => ({
      ...prev,
      ...newFilter,
      offset: 0,
    }));
    setActiveTab("ORDERS");
  };

  const availableMonths = useMemo(() => {
    return summary?.monthlyStats.map((m) => m.month) || [];
  }, [summary]);

  const availableRecipients = useMemo(() => {
    return summary?.recipientStats.map((r) => r.recipient) || [];
  }, [summary]);

  return (
    <AuthGuard title="Amazon Orders">
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <FinanceTopBar title="Amazon Orders" />

        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 sm:px-10 lg:px-12">
          {/* Header */}
          <header className="flex flex-col gap-6 rounded-4xl border border-white/10 bg-white/3 p-6 shadow-2xl backdrop-blur-md lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-400">
                  Track Everything AI
                </span>
                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                  Order Analytics
                </span>
              </div>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Amazon Order History
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Direct JSON ingestion, spending breakdown, recipient distribution, and product image tracking.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {totalOrders > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete and truncate ALL Amazon orders?")) {
                      handleClearAll();
                    }
                  }}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-400 transition hover:bg-rose-500/20"
                >
                  <Trash2 className="h-4 w-4" />
                  Truncate Data
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setIsUploadModalOpen(true)}
                className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg transition hover:bg-amber-300"
              >
                <Upload className="h-4 w-4" />
                Upload JSON
              </button>
            </div>
          </header>

          {/* Metric Cards HUD */}
          <AmazonMetricCards
            summary={summary}
            isLoading={isLoading && !summary}
            onFilterClick={handleSelectFilter}
          />

          {/* Tab Switcher Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("INSIGHTS")}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
                  activeTab === "INSIGHTS"
                    ? "bg-amber-400 text-slate-950 shadow-md"
                    : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                <BarChart2 className="h-4 w-4" />
                Insights & Trends
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("ORDERS")}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
                  activeTab === "ORDERS"
                    ? "bg-amber-400 text-slate-950 shadow-md"
                    : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                <ListOrdered className="h-4 w-4" />
                Orders List {totalOrders > 0 ? `(${totalOrders})` : ""}
              </button>
            </div>

            <div className="text-xs text-slate-400">
              {summary?.dateRange.start && summary?.dateRange.end ? (
                <span>
                  Date Range: <strong>{formatReadableDate(summary.dateRange.start)}</strong> to{" "}
                  <strong>{formatReadableDate(summary.dateRange.end)}</strong>
                </span>
              ) : null}
            </div>
          </div>

          {/* Tab Views */}
          {activeTab === "INSIGHTS" ? (
            summary && summary.totalOrders > 0 ? (
              <AmazonInsights
                summary={summary}
                isKindleLinked={isKindleLinked}
                isLinkingKindle={isLinkingKindle}
                onLinkKindle={handleLinkKindle}
                onSelectFilter={handleSelectFilter}
              />
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-4xl border border-dashed border-white/10 bg-white/2 p-10 text-center">
                <Package className="h-12 w-12 text-slate-600" />
                <h3 className="mt-4 text-lg font-semibold text-white">
                  No Amazon orders imported yet
                </h3>
                <p className="mt-1 max-w-md text-sm text-slate-400">
                  Upload your Amazon order history JSON export to visualize monthly spend trends, recipient breakdown, and product items.
                </p>
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(true)}
                  className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg hover:bg-amber-300"
                >
                  <Upload className="h-4 w-4" />
                  Upload JSON File
                </button>
              </div>
            )
          ) : (
            <AmazonOrdersTable
              orders={orders}
              total={totalOrders}
              isLoading={isLoading}
              filter={filter}
              onFilterChange={setFilter}
              onDeleteOrder={handleDeleteOrder}
              onClearAll={handleClearAll}
              availableMonths={availableMonths}
              availableRecipients={availableRecipients}
            />
          )}
        </div>

        {/* Upload Modal */}
        <AmazonUploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onImportSuccess={handleImportSuccess}
          uploadEndpoint={handleUploadEndpoint}
        />

        {/* Toast Notification */}
        {toast ? (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900 px-5 py-3 shadow-2xl backdrop-blur-md">
            {toast.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : toast.type === "error" ? (
              <AlertCircle className="h-5 w-5 text-rose-400" />
            ) : (
              <Sparkles className="h-5 w-5 text-cyan-400" />
            )}
            <span className="text-sm font-medium text-white">{toast.message}</span>
          </div>
        ) : null}
      </main>
    </AuthGuard>
  );
}
