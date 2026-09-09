"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { FinancialSummaryCards } from "@/components/subscriptions/FinancialSummaryCards";
import { OutflowsTimeline } from "@/components/subscriptions/OutflowsTimeline";
import { CurrentMonthActionHub } from "@/components/subscriptions/CurrentMonthActionHub";
import { SubscriptionDetailView } from "@/components/subscriptions/SubscriptionDetailView";
import { SubscriptionModal } from "@/components/subscriptions/SubscriptionModal";
import { ManualOverrideModal } from "@/components/subscriptions/ManualOverrideModal";
import { ParserSandboxModal } from "@/components/subscriptions/ParserSandboxModal";
import { HistoricalCyclesModal } from "@/components/subscriptions/HistoricalCyclesModal";
import { SourceEmailViewerModal } from "@/components/subscriptions/SourceEmailViewerModal";
import { GmailSyncBanner } from "@/components/subscriptions/GmailSyncBanner";
import { SyncConsoleModal } from "@/components/subscriptions/SyncConsoleModal";
import { SubscriptionsSkeleton } from "@/components/subscriptions/SubscriptionsSkeleton";
import { SourceEmailRecord, Subscription } from "@/lib/subscriptionTypes";
import { useAuth } from "@/context/AuthContext";

function SubscriptionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    user,
    userId,
    userEmail,
    isSignedIn,
    isGmailSynced,
    lastSyncAt,
    isLoading: isAuthLoading,
    signInWithGoogle,
    signOut,
    checkGmailSyncStatus,
  } = useAuth();

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isHistoricalSyncing, setIsHistoricalSyncing] = useState(false);
  const [isSmsSyncing, setIsSmsSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);

  const initialTab = (searchParams.get("tab") as any) || "commitments";
  const initialSubId = searchParams.get("subId");

  const [activeView, setActiveView] = useState<"commitments" | "action-hub" | "timeline" | "split">(
    ["commitments", "action-hub", "timeline", "split"].includes(initialTab)
      ? initialTab === "action-hub" ? "commitments" : initialTab
      : "commitments",
  );
  const [selectedSubId, setSelectedSubId] = useState<string | null>(initialSubId || null);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const subIdParam = searchParams.get("subId");

    if (tabParam) {
      if (tabParam === "action-hub" || tabParam === "subscriptions" || tabParam === "commitments") {
        setActiveView("commitments");
      } else if (tabParam === "timeline" || tabParam === "split") {
        setActiveView(tabParam);
      }
    }
    setSelectedSubId(subIdParam || null);
  }, [searchParams]);

  const handleSwitchTab = (tab: "commitments" | "action-hub" | "timeline" | "split") => {
    const normalizedTab = tab === "action-hub" ? "commitments" : tab;
    setActiveView(normalizedTab);
    setSelectedSubId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", normalizedTab);
    params.delete("subId");
    router.push(`/subscriptions?${params.toString()}`);
  };

  const handleSelectSubscription = (sub: Subscription) => {
    setSelectedSubId(sub.id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", activeView);
    params.set("subId", sub.id);
    router.push(`/subscriptions?${params.toString()}`);
  };

  const handleBackFromDetail = () => {
    setSelectedSubId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("subId");
    router.push(`/subscriptions?${params.toString()}`);
  };

  const activeSelectedSubscription = subscriptions.find((s) => s.id === selectedSubId);

  // Modals
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);

  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideSubscription, setOverrideSubscription] = useState<Subscription | null>(null);

  const [isSandboxModalOpen, setIsSandboxModalOpen] = useState(false);
  const [sandboxModule, setSandboxModule] = useState("HDFCCardParser");
  const [sandboxRegex, setSandboxRegex] = useState<any>(null);

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historySubscription, setHistorySubscription] = useState<Subscription | null>(null);

  const [isEmailViewerOpen, setIsEmailViewerOpen] = useState(false);
  const [emailViewerSubscription, setEmailViewerSubscription] = useState<Subscription | null>(null);
  const [emailViewerInitialRecord, setEmailViewerInitialRecord] = useState<SourceEmailRecord | null>(null);
  const [emailViewerScopedEmails, setEmailViewerScopedEmails] = useState<SourceEmailRecord[] | null>(null);
  const [emailViewerCycleMonth, setEmailViewerCycleMonth] = useState<string | null>(null);

  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [consoleSub, setConsoleSub] = useState<Subscription | null>(null);
  const [consoleMode, setConsoleMode] = useState<"current" | "historical">("current");

  const [bannerNotice, setBannerNotice] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  useEffect(() => {
    const auth = searchParams.get("auth");
    const authError = searchParams.get("auth_error");

    if (auth === "success") {
      setBannerNotice({
        type: "success",
        message: "Google Gmail OAuth connected successfully! Automated synchronization is ready.",
      });
      checkGmailSyncStatus();
    } else if (authError) {
      setBannerNotice({
        type: "error",
        message: `Google OAuth connection error: ${decodeURIComponent(authError)}`,
      });
    }
  }, [searchParams, checkGmailSyncStatus]);

  const fetchSubscriptions = useCallback(async () => {
    if (isAuthLoading) {
      // Do not complete loading until Firebase Auth determines active user state
      return;
    }

    try {
      const qUserId = user?.email || user?.uid || userId || "default_user";
      const res = await fetch(
        `/api/subscriptions?userId=${encodeURIComponent(qUserId)}&_t=${Date.now()}`,
        {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          },
        },
      );
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data.subscriptions || []);
      }
    } catch (err) {
      console.error("Error fetching subscriptions:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user, userId, isAuthLoading]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const handleSaveSubscription = async (subData: Partial<Subscription>) => {
    const qUserId = user?.email || user?.uid || userId || "default_user";
    if (editingSubscription) {
      const res = await fetch(`/api/subscriptions/${editingSubscription.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...subData, userId: qUserId }),
      });
      if (!res.ok) throw new Error("Failed to update subscription");
      const data = await res.json();
      if (data.subscription) {
        setSubscriptions((prev) =>
          prev.map((s) => (s.id === editingSubscription.id ? data.subscription : s)),
        );
      }
    } else {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...subData, userId: qUserId }),
      });
      if (!res.ok) throw new Error("Failed to create subscription");
      const data = await res.json();
      if (data.subscription) {
        setSubscriptions((prev) => [data.subscription, ...prev]);
      }
    }
    setIsSubscriptionModalOpen(false);
    setEditingSubscription(null);
    await fetchSubscriptions();
  };

  const handleDeleteSubscription = async (id: string) => {
    try {
      const res = await fetch(`/api/subscriptions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSubscriptions((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (err) {
      console.error("Error deleting subscription:", err);
    }
  };

  const handleSaveOverride = async (subIdOrData: any, maybeUpdates?: any) => {
    const subId = typeof subIdOrData === "string" ? subIdOrData : overrideSubscription?.id;
    const updates = typeof subIdOrData === "string" ? maybeUpdates : subIdOrData;

    if (!subId) return;
    try {
      const res = await fetch(`/api/subscriptions/${subId}/cycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to override subscription");
      }
      const data = await res.json();
      if (data.subscription) {
        setSubscriptions((prev) =>
          prev.map((s) => (s.id === subId ? data.subscription : s)),
        );
      }
      setIsOverrideModalOpen(false);
      setOverrideSubscription(null);
      await fetchSubscriptions();
    } catch (err) {
      console.error("Save override error:", err);
      throw err;
    }
  };

  const handleQuickMarkPaid = async (sub: Subscription) => {
    const total =
      (sub.currentCycle?.statementTotal && sub.currentCycle.statementTotal > 0)
        ? sub.currentCycle.statementTotal
        : (sub.defaultAmount || 0);

    const targetMonth = sub.currentCycle?.cycleMonth || new Date().toISOString().slice(0, 7);
    const todayIso = new Date().toISOString().split("T")[0];

    // 1. Optimistic UI update so card and button immediately transition to PAID
    const optimisticCycle = {
      ...sub.currentCycle,
      cycleMonth: targetMonth,
      statementTotal: total,
      paidAmount: total,
      remainingBalance: 0,
      lastPaymentDate: todayIso,
      status: "FULLY_PAID" as const,
      updatedAt: new Date().toISOString(),
    };
    const optimisticSub: Subscription = {
      ...sub,
      currentCycle: optimisticCycle,
    };

    setSubscriptions((prev) =>
      prev.map((s) => (s.id === sub.id ? optimisticSub : s)),
    );

    try {
      const res = await fetch(`/api/subscriptions/${sub.id}/cycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleMonth: targetMonth,
          statementTotal: total,
          paidAmount: total,
          remainingBalance: 0,
          lastPaymentDate: todayIso,
          dueDate: sub.currentCycle?.dueDate,
          status: "FULLY_PAID",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to mark as paid");
      }

      const resData = await res.json();
      if (resData.subscription) {
        setSubscriptions((prev) =>
          prev.map((s) => (s.id === sub.id ? resData.subscription : s)),
        );
      }

      setBannerNotice({
        type: "success",
        message: `Successfully marked "${sub.name}" as fully paid for ${targetMonth}!`,
      });

      // Background re-fetch to ensure all server aggregates stay in perfect sync
      await fetchSubscriptions();
    } catch (err) {
      console.error("Failed to mark as paid:", err);
      // Revert to server state on error
      await fetchSubscriptions();
      setBannerNotice({
        type: "error",
        message: `Failed to mark "${sub.name}" as paid: ${(err as Error).message}`,
      });
    }
  };

  const handleTriggerSync = async () => {
    setConsoleSub(null);
    setConsoleMode("current");
    setIsConsoleOpen(true);
  };

  const handleTriggerSmsSync = async () => {
    setIsSmsSyncing(true);
    setSyncSummary(null);
    try {
      const qUserId = user?.email || user?.uid || userId;
      if (!qUserId) return;
      const res = await fetch("/api/sync/sms/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: qUserId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "SMS synchronization failed");
      }

      setSyncSummary(data.summaryText || "SMS sync completed successfully.");
      await fetchSubscriptions();
    } catch (err) {
      setSyncSummary(`⚠️ SMS Sync Error: ${(err as Error).message}`);
    } finally {
      setIsSmsSyncing(false);
    }
  };

  const handleTriggerDeepHistoricalSync = async () => {
    setConsoleSub(null);
    setConsoleMode("historical");
    setIsConsoleOpen(true);
  };

  const handleOpenSourceEmailViewer = (
    sub: Subscription,
    initialRecord?: SourceEmailRecord,
    scopedEmails?: SourceEmailRecord[],
    cycleMonth?: string,
  ) => {
    setEmailViewerSubscription(sub);
    setEmailViewerInitialRecord(initialRecord || null);
    setEmailViewerScopedEmails(scopedEmails || null);
    setEmailViewerCycleMonth(cycleMonth || null);
    setIsEmailViewerOpen(true);
  };

  if (!isSignedIn && !isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <FinanceTopBar />
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="max-w-md w-full rounded-3xl border border-white/15 bg-slate-900/90 p-6 sm:p-8 text-center shadow-2xl backdrop-blur-xl space-y-6">
            <div className="h-16 w-16 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-3xl shadow-inner">
              🔒
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Private & Secure Vault</h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Sign in with your Google account to access your recurring commitments, statement ledger, and email synchronization.
              </p>
            </div>
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              className="w-full min-h-[46px] rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold text-sm shadow-xl hover:from-cyan-400 hover:to-blue-500 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <span>🔐</span> Sign in with Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500 selection:text-slate-950 font-sans pb-24">
      {/* App Top Bar */}
      <FinanceTopBar />

      <main className="mx-auto max-w-7xl px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
        {/* Banner Notice (OAuth / System Alerts) */}
        {bannerNotice && (
          <div
            className={`rounded-2xl border p-4 text-xs sm:text-sm font-medium flex items-center justify-between shadow-lg backdrop-blur-md ${
              bannerNotice.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/30 bg-rose-500/10 text-rose-300"
            }`}
          >
            <span>{bannerNotice.message}</span>
            <button
              type="button"
              onClick={() => setBannerNotice(null)}
              className="text-slate-400 hover:text-white ml-2 p-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Sync Summary Alert */}
        {syncSummary && (
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/40 p-4 text-xs sm:text-sm text-cyan-200 shadow-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🔄</span>
              <span>{syncSummary}</span>
            </div>
            <button
              type="button"
              onClick={() => setSyncSummary(null)}
              className="text-slate-400 hover:text-white p-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Hero Section & Actions */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-white">
                Subscriptions & Recurring Commitments
              </h1>
              <span className="rounded-full bg-cyan-400/10 border border-cyan-400/20 px-2.5 py-0.5 text-xs font-bold text-cyan-400">
                {subscriptions.length} active
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-400 max-w-2xl">
              Track statement-based credit cards and fixed bills with deterministic Gmail parsing, automatic payment reconciliation, and Firebase Storage source email archival.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setEditingSubscription(null);
                setIsSubscriptionModalOpen(true);
              }}
              className="min-h-[42px] flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-indigo-500 px-5 py-2.5 text-xs sm:text-sm font-bold text-slate-950 shadow-lg shadow-cyan-400/20 hover:opacity-95 transition active:scale-95 cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Subscription</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSandboxModule("AxisCardParser");
                setSandboxRegex(null);
                setIsSandboxModalOpen(true);
              }}
              className="min-h-[42px] flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-200 hover:bg-white/10 hover:border-cyan-400/50 transition cursor-pointer"
              title="Test Regex on raw email text"
            >
              <span>🧪</span>
              <span>Sandbox</span>
            </button>
          </div>
        </div>

        {/* If loading initial data, render full glassmorphic shimmer skeleton */}
        {isAuthLoading || isLoading ? (
          <SubscriptionsSkeleton />
        ) : activeSelectedSubscription ? (
          /* If a subscription is selected, render deep Detail View with back navigation */
          <SubscriptionDetailView
            subscription={activeSelectedSubscription}
            onBack={handleBackFromDetail}
            onEdit={(sub) => {
              setEditingSubscription(sub);
              setIsSubscriptionModalOpen(true);
            }}
            onDelete={handleDeleteSubscription}
            onOverride={(sub) => {
              setOverrideSubscription(sub);
              setIsOverrideModalOpen(true);
            }}
            onViewSourceEmail={handleOpenSourceEmailViewer}
            onRefreshSubscription={fetchSubscriptions}
          />
        ) : (
          <>
            {/* View Switcher: Commitments vs Outflows Timeline vs Split */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => handleSwitchTab("commitments")}
                  className={`min-h-[38px] px-3.5 sm:px-4 py-1.5 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-semibold transition cursor-pointer shrink-0 ${
                    activeView === "commitments" || activeView === "action-hub"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  📋 Commitments
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchTab("timeline")}
                  className={`min-h-[38px] px-3.5 sm:px-4 py-1.5 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-semibold transition cursor-pointer shrink-0 ${
                    activeView === "timeline"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  📅 Outflows Timeline
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchTab("split")}
                  className={`hidden lg:inline-flex min-h-[38px] px-3.5 sm:px-4 py-1.5 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-semibold transition cursor-pointer shrink-0 ${
                    activeView === "split"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  ⚡ Split Overview
                </button>
              </div>

              <span className="text-xs text-slate-400 hidden sm:inline">
                Deterministic Sync Engine v2.0
              </span>
            </div>

            {/* Main View Area */}
            {activeView === "timeline" ? (
              <OutflowsTimeline
                subscriptions={subscriptions}
                onOpenOverride={(sub) => {
                  setOverrideSubscription(sub);
                  setIsOverrideModalOpen(true);
                }}
              />
            ) : activeView === "split" ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-4 sticky top-6">
                  <OutflowsTimeline
                    subscriptions={subscriptions}
                    onOpenOverride={(sub) => {
                      setOverrideSubscription(sub);
                      setIsOverrideModalOpen(true);
                    }}
                  />
                </div>
                <div className="lg:col-span-8">
                  <CurrentMonthActionHub
                    subscriptions={subscriptions}
                    onSelectSubscription={handleSelectSubscription}
                    onQuickMarkPaid={handleQuickMarkPaid}
                    onEdit={(sub) => {
                      setEditingSubscription(sub);
                      setIsSubscriptionModalOpen(true);
                    }}
                    onOverride={(sub) => {
                      setOverrideSubscription(sub);
                      setIsOverrideModalOpen(true);
                    }}
                    onDelete={handleDeleteSubscription}
                    onViewHistory={(sub) => {
                      setHistorySubscription(sub);
                      setIsHistoryModalOpen(true);
                    }}
                    onTestParser={(sub) => {
                      setSandboxModule(sub.emailConfig?.parserModule || "AxisCardParser");
                      setSandboxRegex(sub.emailConfig?.customRegex);
                      setIsSandboxModalOpen(true);
                    }}
                  />
                </div>
              </div>
            ) : (
              <CurrentMonthActionHub
                subscriptions={subscriptions}
                onSelectSubscription={handleSelectSubscription}
                onQuickMarkPaid={handleQuickMarkPaid}
                onEdit={(sub) => {
                  setEditingSubscription(sub);
                  setIsSubscriptionModalOpen(true);
                }}
                onOverride={(sub) => {
                  setOverrideSubscription(sub);
                  setIsOverrideModalOpen(true);
                }}
                onDelete={handleDeleteSubscription}
                onViewHistory={(sub) => {
                  setHistorySubscription(sub);
                  setIsHistoryModalOpen(true);
                }}
                onTestParser={(sub) => {
                  setSandboxModule(sub.emailConfig?.parserModule || "AxisCardParser");
                  setSandboxRegex(sub.emailConfig?.customRegex);
                  setIsSandboxModalOpen(true);
                }}
              />
            )}

            {/* Bottom Section: Summary & Automation Tools */}
            <div className="mt-10 pt-8 border-t border-white/10 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                    Financial Summary & Burn Rate
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Aggregated metrics and spending breakdown across active commitments.
                  </p>
                </div>
              </div>

              {/* Financial Summary Aggregator Cards */}
              <FinancialSummaryCards subscriptions={subscriptions} />

              {/* Gmail & SMS Sync Status Banner */}
              <GmailSyncBanner
                isLoading={isAuthLoading}
                isConnected={isGmailSynced}
                lastSyncAt={lastSyncAt}
                userEmail={userEmail}
                isSyncing={isSyncing}
                isHistoricalSyncing={isHistoricalSyncing}
                isSmsSyncing={isSmsSyncing}
                onTriggerSync={handleTriggerSync}
                onTriggerHistoricalSync={handleTriggerDeepHistoricalSync}
                onTriggerSmsSync={handleTriggerSmsSync}
                onConnect={() => signInWithGoogle("/subscriptions")}
                onDisconnect={signOut}
              />
            </div>
          </>
        )}
      </main>

      {/* Modals */}
      <SubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => {
          setIsSubscriptionModalOpen(false);
          setEditingSubscription(null);
        }}
        onSave={handleSaveSubscription}
        initialData={editingSubscription}
        onOpenTestSandbox={() => {
          setIsSandboxModalOpen(true);
        }}
      />

      <ManualOverrideModal
        isOpen={isOverrideModalOpen}
        onClose={() => {
          setIsOverrideModalOpen(false);
          setOverrideSubscription(null);
        }}
        subscription={overrideSubscription}
        onSaveOverride={handleSaveOverride}
      />

      <ParserSandboxModal
        isOpen={isSandboxModalOpen}
        onClose={() => setIsSandboxModalOpen(false)}
        initialModule={sandboxModule}
        initialCustomRegex={sandboxRegex}
      />

      <HistoricalCyclesModal
        isOpen={isHistoryModalOpen}
        onClose={() => {
          setIsHistoryModalOpen(false);
          setHistorySubscription(null);
        }}
        subscription={historySubscription}
        onCyclesUpdated={fetchSubscriptions}
        onViewSourceEmail={handleOpenSourceEmailViewer}
      />

      {/* Source Email Viewer Modal */}
      <SourceEmailViewerModal
        isOpen={isEmailViewerOpen}
        onClose={() => {
          setIsEmailViewerOpen(false);
          setEmailViewerSubscription(null);
          setEmailViewerInitialRecord(null);
          setEmailViewerScopedEmails(null);
          setEmailViewerCycleMonth(null);
        }}
        subscription={emailViewerSubscription}
        initialEmail={emailViewerInitialRecord}
        scopedEmails={emailViewerScopedEmails}
        cycleMonth={emailViewerCycleMonth}
      />

      {/* Real-time Streaming Sync Console Modal */}
      <SyncConsoleModal
        isOpen={isConsoleOpen}
        onClose={() => {
          setIsConsoleOpen(false);
          fetchSubscriptions();
        }}
        userId={userId || "default_user"}
        initialSubscription={consoleSub}
        initialMode={consoleMode}
        onSyncComplete={fetchSubscriptions}
      />
    </div>
  );
}

export default function SubscriptionsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-r-transparent" />
            <span className="text-sm font-medium">Loading Subscriptions...</span>
          </div>
        </div>
      }
    >
      <SubscriptionsPageContent />
    </React.Suspense>
  );
}
