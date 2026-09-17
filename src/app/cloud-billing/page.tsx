"use client";

import React, { useState, useEffect, useCallback } from "react";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { DailyBurnChart } from "@/components/gcpBilling/DailyBurnChart";
import { MonthlySpendChart } from "@/components/gcpBilling/MonthlySpendChart";
import { MonthlyBillPaymentsTable } from "@/components/gcpBilling/MonthlyBillPaymentsTable";
import { ServiceBreakdownCard } from "@/components/gcpBilling/ServiceBreakdownCard";
import { TopCostDriversTable } from "@/components/gcpBilling/TopCostDriversTable";
import { GcpAccountManagerModal } from "@/components/gcpBilling/GcpAccountManagerModal";
import { GcpImportCsvModal } from "@/components/gcpBilling/GcpImportCsvModal";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authFetch";
import {
  GcpBillingSummary,
  GcpBillingDatasetConfig,
  BillingPeriod,
} from "@/lib/gcpBilling/types";
import Link from "next/link";
import {
  Cloud,
  Filter,
  RefreshCw,
  Settings,
  DollarSign,
  TrendingUp,
  CreditCard,
  AlertCircle,
  FolderGit2,
  Lock,
  BarChart3,
  Calendar,
  Layers,
  UploadCloud,
  PlusCircle,
  BookmarkCheck,
  CheckCircle2,
} from "lucide-react";

export default function CloudBillingPage() {
  const {
    user,
    userId,
    isSignedIn,
    isLoading: isAuthLoading,
    signInWithGoogle,
  } = useAuth();

  const [configs, setConfigs] = useState<GcpBillingDatasetConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");
  const [period, setPeriod] = useState<BillingPeriod>("mtd");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [chartView, setChartView] = useState<"monthly" | "daily">("monthly");

  const [summary, setSummary] = useState<GcpBillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Subscriptions & Bills Tracker Link State
  const [isSubscriptionLinked, setIsSubscriptionLinked] = useState(false);
  const [isLinkingSubscription, setIsLinkingSubscription] = useState(false);
  const [linkToast, setLinkToast] = useState<string | null>(null);

  const checkSubscriptionLink = useCallback(async () => {
    if (!isSignedIn || !user) return;
    try {
      const res = await authFetch(user, `/api/gcp-billing/link-subscription?_t=${Date.now()}`);
      const data = await res.json();
      if (data.success) {
        setIsSubscriptionLinked(Boolean(data.linked));
      }
    } catch (err) {
      console.error("Error checking subscription link:", err);
    }
  }, [user, isSignedIn]);

  const handleLinkSubscription = async () => {
    if (!isSignedIn || !user) return;
    setIsLinkingSubscription(true);
    try {
      const res = await authFetch(user, "/api/gcp-billing/link-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: "Google Cloud Platform" }),
      });
      const data = await res.json();
      if (data.success) {
        setIsSubscriptionLinked(true);
        setLinkToast("Google Cloud added to Subscriptions & Bills!");
        setTimeout(() => setLinkToast(null), 4000);
      } else {
        alert(`Failed to link subscription: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      alert(`Error linking subscription: ${err.message}`);
    } finally {
      setIsLinkingSubscription(false);
    }
  };

  // Fetch summary data using authenticated fetch
  const fetchData = useCallback(async () => {
    if (isAuthLoading) return;
    if (!isSignedIn || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const qUserId = user?.email || user?.uid || userId || "default_user";
      const params = new URLSearchParams({
        period,
        userId: qUserId,
      });
      if (selectedConfigId) {
        params.set("configId", selectedConfigId);
      }
      if (selectedProjectId) {
        params.set("projectId", selectedProjectId);
      }

      const res = await authFetch(
        user,
        `/api/gcp-billing/summary?${params.toString()}&_t=${Date.now()}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load GCP billing data");
      }

      setSummary(data.summary);
      if (data.configs) {
        setConfigs(data.configs);
        if (!selectedConfigId && data.config) {
          setSelectedConfigId(data.config.id);
        }
      }
    } catch (err: any) {
      console.error("Error fetching billing summary:", err);
      setError(err.message || "Failed to fetch GCP billing summary");
    } finally {
      setLoading(false);
    }
  }, [user, userId, isSignedIn, isAuthLoading, period, selectedConfigId, selectedProjectId]);

  useEffect(() => {
    fetchData();
    checkSubscriptionLink();
  }, [fetchData, checkSubscriptionLink]);

  // Calculate run-rate projection for MTD
  const calculateRunRate = () => {
    if (!summary || period !== "mtd") return null;
    const now = new Date();
    const currentDay = now.getDate();
    // Days in current month
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (currentDay <= 0) return null;

    const projected = summary.projectedMonthEnd || (summary.netCost / currentDay) * totalDays;
    return {
      projected,
      currentDay,
      totalDays,
    };
  };

  const runRate = calculateRunRate();
  const activeConfig = configs.find((c) => c.id === selectedConfigId);
  const currency = summary?.currency || activeConfig?.currency || "INR";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500 selection:text-slate-950">
      <FinanceTopBar title="Cloud Billing" />

      {/* Floating Link Toast */}
      {linkToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl border border-cyan-500/50 bg-slate-900/95 px-4 py-3 text-xs font-bold text-cyan-300 shadow-2xl shadow-cyan-500/30 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="h-4 w-4 text-cyan-400" />
          <span>{linkToast}</span>
          <Link
            href="/subscriptions"
            className="ml-2 underline text-white hover:text-cyan-200"
          >
            View Tracker →
          </Link>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Top Header & Controls */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              <Cloud className="h-4 w-4" />
              <span>Google Cloud Platform</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
              Cloud Billing & BigQuery Insights
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Live consumption, monthly bill payments, and daily burn rates exported from GCP BigQuery
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Account / Dataset Switcher Dropdown */}
            {configs.length > 0 && (
              <div className="relative">
                <select
                  value={selectedConfigId}
                  onChange={(e) => setSelectedConfigId(e.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-cyan-500"
                >
                  {configs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.isDefault ? "(Default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Manage Datasets Button */}
            <button
              onClick={() => setIsAccountModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5 text-cyan-400" />
              <span>Datasets</span>
            </button>

            {/* Import Historical Bill CSV Button */}
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer"
            >
              <UploadCloud className="h-3.5 w-3.5 text-cyan-400" />
              <span>Import Bill</span>
            </button>

            {/* Link to Subscriptions & Bills Tracker */}
            {isSubscriptionLinked ? (
              <Link
                href="/subscriptions"
                className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition cursor-pointer"
                title="Google Cloud is tracked in Subscriptions & Bills"
              >
                <BookmarkCheck className="h-3.5 w-3.5 text-cyan-400" />
                <span>Linked in Bills</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleLinkSubscription}
                disabled={isLinkingSubscription || !isSignedIn}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer disabled:opacity-50"
                title="Add Google Cloud to Subscriptions & Outflow Tracker"
              >
                {isLinkingSubscription ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                ) : (
                  <PlusCircle className="h-3.5 w-3.5 text-cyan-400" />
                )}
                <span>Add to Subs & Bills</span>
              </button>
            )}

            {/* Refresh Button */}
            <button
              onClick={fetchData}
              disabled={loading || !isSignedIn}
              className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Not Signed In State */}
        {!isAuthLoading && !isSignedIn && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-slate-900/80 p-12 text-center shadow-2xl backdrop-blur-md">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-4">
              <Lock className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold text-white">Sign In Required</h2>
            <p className="mt-2 max-w-md text-xs text-slate-400">
              Please sign in with your Google Account to authenticate and view your Google Cloud BigQuery billing metrics securely.
            </p>
            <button
              onClick={() => signInWithGoogle("/cloud-billing")}
              className="mt-6 rounded-2xl bg-cyan-500 px-6 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition cursor-pointer shadow-lg shadow-cyan-500/20"
            >
              Sign In with Google
            </button>
          </div>
        )}

        {/* Authenticated Content */}
        {isSignedIn && (
          <>
            {/* Filters Bar: Period & Project */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/70 p-3 backdrop-blur-md">
              {/* Period selector */}
              <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-white/5">
                {(
                  [
                    { id: "mtd", label: "Month to Date" },
                    { id: "last_month", label: "Last Month" },
                    { id: "30d", label: "Last 30 Days" },
                    { id: "90d", label: "Last 90 Days" },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPeriod(p.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                      period === p.id
                        ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-bold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Project filter dropdown */}
              <div className="flex items-center gap-2 text-xs">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-slate-400 font-medium">Project:</span>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">All GCP Projects</option>
                  {summary?.projectBreakdown.map((proj) => (
                    <option key={proj.projectId} value={proj.projectId}>
                      {proj.projectId} ({currency} {proj.netCost.toFixed(1)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <div className="flex-1">
                  <p className="font-bold">Error loading billing export</p>
                  <p className="mt-0.5 text-rose-200/80">{error}</p>
                </div>
                <button
                  onClick={fetchData}
                  className="rounded-xl bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Net Cost */}
              <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">Net Spend</span>
                  <div className="rounded-xl bg-cyan-500/10 p-2 text-cyan-400 border border-cyan-500/20">
                    <DollarSign className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-2xl sm:text-3xl font-extrabold text-white">
                    {currency} {summary ? summary.netCost.toFixed(2) : "0.00"}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Gross: {currency} {summary ? summary.totalCost.toFixed(2) : "0.00"}
                  </div>
                </div>
              </div>

              {/* Card 2: Credits Applied */}
              <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">Credits Applied</span>
                  <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-400 border border-emerald-500/20">
                    <CreditCard className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400">
                    -{currency} {summary ? summary.totalCredits.toFixed(2) : "0.00"}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {summary && summary.totalCost > 0
                      ? `${((summary.totalCredits / summary.totalCost) * 100).toFixed(1)}% offset via credits`
                      : "Free tier / promotion discounts"}
                  </div>
                </div>
              </div>

              {/* Card 3: Projected Month-End (or Daily Avg) */}
              <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    {period === "mtd" ? "Month-End Forecast" : "Avg Daily Burn"}
                  </span>
                  <div className="rounded-xl bg-amber-500/10 p-2 text-amber-400 border border-amber-500/20">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-2xl sm:text-3xl font-extrabold text-amber-300">
                    {currency}{" "}
                    {period === "mtd" && runRate
                      ? runRate.projected.toFixed(2)
                      : summary && summary.dailyAverage
                      ? summary.dailyAverage.toFixed(2)
                      : "0.00"}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {period === "mtd" && runRate
                      ? `Day ${runRate.currentDay} of ${runRate.totalDays} run rate`
                      : "Calculated across active period"}
                  </div>
                </div>
              </div>

              {/* Card 4: Active Footprint */}
              <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-xl backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-semibold uppercase tracking-wider">GCP Footprint</span>
                  <div className="rounded-xl bg-purple-500/10 p-2 text-purple-400 border border-purple-500/20">
                    <FolderGit2 className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-2xl sm:text-3xl font-extrabold text-white">
                    {summary?.projectBreakdown.length || 0}{" "}
                    <span className="text-sm font-normal text-slate-400">Projects</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {summary?.serviceBreakdown.length || 0} active Google Cloud services
                  </div>
                </div>
              </div>
            </div>

            {/* Project Breakdown Badges */}
            {summary && summary.projectBreakdown.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl border border-white/10 bg-slate-900/50">
                <span className="text-xs font-semibold text-slate-400">Projects Breakdown:</span>
                {summary.projectBreakdown.map((proj) => (
                  <button
                    key={proj.projectId}
                    onClick={() =>
                      setSelectedProjectId(
                        selectedProjectId === proj.projectId ? "" : proj.projectId
                      )
                    }
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-mono transition border ${
                      selectedProjectId === proj.projectId
                        ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300 font-bold"
                        : "bg-slate-800/60 border-white/5 text-slate-300 hover:bg-slate-800 cursor-pointer"
                    }`}
                  >
                    <span>{proj.projectId}</span>
                    <span className="text-slate-400">({currency} {proj.netCost.toFixed(2)})</span>
                  </button>
                ))}
              </div>
            )}

            {/* Charts & Breakdown Grid with View Switcher */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Chart Card (2 Cols) with Monthly vs Daily Toggle */}
              <div className="lg:col-span-2 flex flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Chart View:</span>
                    <div className="flex items-center gap-1 bg-slate-900 border border-white/10 p-1 rounded-xl">
                      <button
                        onClick={() => setChartView("monthly")}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          chartView === "monthly"
                            ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                        <span>Monthly Chart</span>
                      </button>
                      <button
                        onClick={() => setChartView("daily")}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          chartView === "daily"
                            ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Daily Burn</span>
                      </button>
                    </div>
                  </div>
                </div>

                {chartView === "monthly" ? (
                  <MonthlySpendChart
                    data={summary?.monthlyTrends || []}
                    currency={currency}
                  />
                ) : (
                  <DailyBurnChart
                    data={summary?.dailyTrends || []}
                    currency={currency}
                  />
                )}
              </div>

              {/* Service Breakdown (1 Col) */}
              <div>
                <ServiceBreakdownCard
                  services={summary?.serviceBreakdown || []}
                  totalSpend={summary?.netCost || 0}
                  currency={currency}
                  selectedService={selectedService}
                  onSelectService={setSelectedService}
                />
              </div>
            </div>

            {/* Monthly Bill Invoices & Payments Table */}
            <div>
              <MonthlyBillPaymentsTable
                monthlyData={summary?.monthlyTrends || []}
                currency={currency}
              />
            </div>

            {/* Top Cost Drivers (SKUs) Table */}
            <div>
              <TopCostDriversTable
                skus={summary?.topSkus || []}
                currency={currency}
                filterService={selectedService}
              />
            </div>
          </>
        )}
      </main>

      {/* Account / Dataset Configuration Modal */}
      <GcpAccountManagerModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        user={user}
        configs={configs}
        currentConfigId={selectedConfigId}
        onSelectConfig={(id) => {
          setSelectedConfigId(id);
          fetchData();
        }}
        onConfigsUpdated={() => {
          fetchData();
        }}
      />

      {/* Historical Bill CSV Import Modal */}
      <GcpImportCsvModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        user={user}
        onImportComplete={() => {
          fetchData();
        }}
      />
    </div>
  );
}
