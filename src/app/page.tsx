"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { useAuth } from "@/context/AuthContext";
import { LifeEvent, TimelineDaySummary, ACTIVITY_META_MAP } from "@/lib/timeline/types";
import { Subscription } from "@/lib/subscriptionTypes";
import { isPrepaidSubscription, isFixedTenure } from "@/lib/subscriptionUtils";
import { SubscriptionAvatar } from "@/components/subscriptions/SubscriptionAvatar";
import { VoiceRecorderModal } from "@/components/timeline/VoiceRecorderModal";
import { JournalChatDrawer } from "@/components/timeline/JournalChatDrawer";

export default function Home() {
  const router = useRouter();
  const { user, userId, userEmail, isSignedIn, isGmailSynced, signInWithGoogle } = useAuth();

  // Core Data States
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [daySummary, setDaySummary] = useState<TimelineDaySummary | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  // Loading & Action States
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isLoadingSubs, setIsLoadingSubs] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [quickNoteText, setQuickNoteText] = useState("");
  const [isSavingQuickNote, setIsSavingQuickNote] = useState(false);

  // Modals & Drawers
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);

  // Filter Tabs
  const [duesTab, setDuesTab] = useState<"pending" | "due_soon" | "settled">("pending");

  // Feedback Toast
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // Local Date Setup
  const now = new Date();
  const todayIso = now.toISOString().split("T")[0];
  const currentMonthStr = todayIso.slice(0, 7);

  const formattedDisplayDate = useMemo(() => {
    return now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  const greeting = useMemo(() => {
    const hour = now.getHours();
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    if (hour >= 17 && hour < 22) return "Good evening";
    return "Good night";
  }, []);

  // Dismiss toast automatically
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Fetch Today's Activities
  const fetchTodayEvents = useCallback(async () => {
    if (!isSignedIn) {
      setEvents([]);
      setDaySummary(null);
      setIsLoadingEvents(false);
      return;
    }
    try {
      setIsLoadingEvents(true);
      const qUserId = user?.email || user?.uid || userId || "";
      const res = await fetch(`/api/timeline/events?date=${todayIso}&userId=${encodeURIComponent(qUserId)}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setDaySummary(data.summary || null);
      }
    } catch (err) {
      console.error("Error fetching today's events:", err);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [isSignedIn, user, userId, todayIso]);

  // Fetch Subscriptions & Dues
  const fetchSubscriptions = useCallback(async () => {
    if (!isSignedIn) {
      setSubscriptions([]);
      setIsLoadingSubs(false);
      return;
    }
    try {
      setIsLoadingSubs(true);
      const qUserId = user?.email || user?.uid || userId || "";
      const res = await fetch(`/api/subscriptions?userId=${encodeURIComponent(qUserId)}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data.subscriptions || []);
      }
    } catch (err) {
      console.error("Error fetching subscriptions:", err);
    } finally {
      setIsLoadingSubs(false);
    }
  }, [isSignedIn, user, userId]);

  useEffect(() => {
    fetchTodayEvents();
    fetchSubscriptions();
  }, [fetchTodayEvents, fetchSubscriptions]);

  // Refresh All Data
  const handleRefreshAll = async () => {
    await Promise.all([fetchTodayEvents(), fetchSubscriptions()]);
    setToast({ type: "info", message: "Dashboard refreshed with latest data" });
  };

  // Run One-Click Unified Gmail Sync
  const handleRunSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setToast({ type: "info", message: "Starting synchronization across accounts & bills..." });

    try {
      const qUserId = user?.email || user?.uid || userId || "default_user";
      const res = await fetch("/api/sync/gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: qUserId }),
      });

      if (res.ok) {
        const data = await res.json();
        setToast({
          type: "success",
          message: data.result?.message || "Sync completed successfully!",
        });
        await fetchSubscriptions();
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({
          type: "error",
          message: data.error || "Sync failed. Check connection or Gmail token.",
        });
      }
    } catch (err: any) {
      setToast({ type: "error", message: err.message || "Failed to trigger sync" });
    } finally {
      setIsSyncing(false);
    }
  };

  // Quick Mark Subscription Paid
  const handleQuickMarkPaid = async (sub: Subscription, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (markingPaidId) return;

    setMarkingPaidId(sub.id);
    const total = sub.currentCycle?.statementTotal && sub.currentCycle.statementTotal > 0
      ? sub.currentCycle.statementTotal
      : (sub.defaultAmount || 0);

    const targetMonth = sub.currentCycle?.cycleMonth || currentMonthStr;

    // Optimistic Update
    setSubscriptions((prev) =>
      prev.map((s) => {
        if (s.id !== sub.id) return s;
        return {
          ...s,
          currentCycle: {
            ...s.currentCycle,
            statementTotal: total,
            paidAmount: total,
            remainingBalance: 0,
            lastPaymentDate: todayIso,
            status: "FULLY_PAID" as const,
          },
        };
      })
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
        throw new Error("Failed to mark as paid");
      }

      setToast({
        type: "success",
        message: `Marked "${sub.name}" as paid (₹${total.toLocaleString("en-IN")})`,
      });
      await fetchSubscriptions();
    } catch (err: any) {
      setToast({ type: "error", message: err.message || "Failed to mark as paid" });
      await fetchSubscriptions();
    } finally {
      setMarkingPaidId(null);
    }
  };

  // Quick Note Submission
  const handleQuickNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickNoteText.trim() || isSavingQuickNote) return;

    setIsSavingQuickNote(true);
    try {
      const qUserId = user?.email || user?.uid || userId || "default_user";
      const currentTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      
      const newEvent: Partial<LifeEvent> = {
        title: quickNoteText.trim(),
        description: "Quickly logged from home dashboard.",
        activityType: "GENERAL",
        date: todayIso,
        startTime: currentTime,
        tags: ["quick-note"],
        attributes: {},
        userId: qUserId,
      };

      const res = await fetch("/api/timeline/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: newEvent }),
      });

      if (res.ok) {
        setQuickNoteText("");
        setToast({ type: "success", message: "Moment logged to today's timeline!" });
        await fetchTodayEvents();
      } else {
        throw new Error("Failed to save event");
      }
    } catch (err: any) {
      setToast({ type: "error", message: err.message || "Could not log event" });
    } finally {
      setIsSavingQuickNote(false);
    }
  };

  // Process and Prioritize Dues
  const {
    pendingItems,
    dueSoonItems,
    settledItems,
    totalPendingAmount,
    totalPaidAmount,
    monthlyBurnRate,
  } = useMemo(() => {
    let pending: Array<{
      sub: Subscription;
      remaining: number;
      total: number;
      paid: number;
      dueDate?: string;
      daysDiff: number | null;
      isOverdue: boolean;
      isDueSoon: boolean;
      isPrepaid: boolean;
    }> = [];
    let dueSoon: typeof pending = [];
    let settled: typeof pending = [];
    let totalPending = 0;
    let totalPaid = 0;
    let monthlyBurn = 0;

    subscriptions.forEach((sub) => {
      const isPrepaid = isPrepaidSubscription(sub);
      const cycle = sub.currentCycle;
      const isTneb = sub.source === "TNEB_MODULE";
      const isApartment = sub.source === "APARTMENT_MODULE";
      const isChennaiWater = sub.source === "CHENNAI_WATER_MODULE";
      const isFixed = isFixedTenure(sub);
      const hasStatementConfig =
        isTneb ||
        isApartment ||
        isChennaiWater ||
        Boolean(sub.emailConfig?.statementQuery && sub.emailConfig.statementQuery.trim());
      const hasStatementTotal = cycle.statementTotal !== undefined && cycle.statementTotal > 0;

      const total = hasStatementTotal
        ? cycle.statementTotal
        : isFixed || !hasStatementConfig
        ? (sub.defaultAmount || 0)
        : 0;

      const paid = isPrepaid ? (cycle.paidAmount || total) : (cycle.paidAmount || 0);
      const isSettled =
        isPrepaid ||
        cycle.status === "FULLY_PAID" ||
        (total > 0 && paid >= total) ||
        (total === 0 && (cycle.remainingBalance === undefined || cycle.remainingBalance <= 0));

      const isSkipped = cycle.status === "SKIPPED" || cycle.status === "PAUSED";
      const remaining =
        isSettled || isSkipped
          ? 0
          : cycle.remainingBalance !== undefined && cycle.remainingBalance > 0
          ? cycle.remainingBalance
          : Math.max(0, total - paid);

      const isPaid = isSettled || remaining <= 0;

      // Monthly burn calculation
      let monthlyEquivalent = total;
      if (sub.billingCycle === "ANNUAL" || (sub.billingCycle as string) === "YEARLY") monthlyEquivalent = total / 12;
      else if (sub.billingCycle === "HALF_YEARLY") monthlyEquivalent = total / 6;
      else if (sub.billingCycle === "QUARTERLY") monthlyEquivalent = total / 3;
      else if ((sub.billingCycle as string) === "WEEKLY") monthlyEquivalent = total * 4.33;
      monthlyBurn += monthlyEquivalent;

      totalPaid += paid;

      let dueDate = isPrepaid ? undefined : cycle.dueDate;
      if (!isPrepaid && !dueDate && sub.dueDayOfMonth) {
        const [yStr, mStr] = currentMonthStr.split("-");
        const maxDays = new Date(Number(yStr), Number(mStr), 0).getDate();
        const validDay = Math.min(sub.dueDayOfMonth, maxDays);
        dueDate = `${currentMonthStr}-${String(validDay).padStart(2, "0")}`;
      }

      let daysDiff: number | null = null;
      if (dueDate) {
        const diffMs = new Date(dueDate).getTime() - new Date(todayIso).getTime();
        daysDiff = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      }

      const isOverdue = daysDiff !== null && daysDiff < 0 && remaining > 0;
      const isDueSoon = daysDiff !== null && daysDiff >= 0 && daysDiff <= 7 && remaining > 0;

      const item = {
        sub,
        remaining,
        total,
        paid,
        dueDate,
        daysDiff,
        isOverdue,
        isDueSoon,
        isPrepaid,
      };

      if (remaining > 0 && !isSkipped) {
        totalPending += remaining;
        pending.push(item);
        if (isDueSoon || isOverdue) {
          dueSoon.push(item);
        }
      } else {
        settled.push(item);
      }
    });

    // Sort pending: overdue first, then lowest daysDiff, then without date
    pending.sort((a, b) => {
      if (a.daysDiff === null && b.daysDiff === null) return 0;
      if (a.daysDiff === null) return 1;
      if (b.daysDiff === null) return -1;
      return a.daysDiff - b.daysDiff;
    });

    dueSoon.sort((a, b) => (a.daysDiff || 0) - (b.daysDiff || 0));

    return {
      pendingItems: pending,
      dueSoonItems: dueSoon,
      settledItems: settled,
      totalPendingAmount: totalPending,
      totalPaidAmount: totalPaid,
      monthlyBurnRate: monthlyBurn,
    };
  }, [subscriptions, todayIso, currentMonthStr]);

  const displayedDues = useMemo(() => {
    if (duesTab === "due_soon") return dueSoonItems;
    if (duesTab === "settled") return settledItems;
    return pendingItems;
  }, [duesTab, pendingItems, dueSoonItems, settledItems]);

  // Quick Hub links definitions
  const quickLinks = [
    {
      href: "/timeline",
      title: "Life Events Diary",
      icon: "📔",
      badge: "AI Voice & Schemas",
      description: "Speak your moments with auto-detect Tamil & English transcription. Auto-discovers schemas.",
      gradient: "from-cyan-500/10 to-blue-500/10 hover:border-cyan-400/50",
      accent: "text-cyan-400",
    },
    {
      href: "/subscriptions",
      title: "Subscriptions & Bills",
      icon: "💳",
      badge: "Commitments",
      description: "Deterministic sync for credit cards, utilities, EMIs, and recurring payments.",
      gradient: "from-indigo-500/10 to-purple-500/10 hover:border-indigo-400/50",
      accent: "text-indigo-400",
    },
    {
      href: "/tneb",
      title: "EB Electricity Bills",
      icon: "⚡",
      badge: "TNEB",
      description: "Check power consumption, fetch pending bills, and download official payment receipts.",
      gradient: "from-amber-500/10 to-orange-500/10 hover:border-amber-400/50",
      accent: "text-amber-400",
    },
    {
      href: "/apartment",
      title: "Apartment Maintenance",
      icon: "🏢",
      badge: "Homefy",
      description: "Audit monthly maintenance dues, water charges, and society balance sheets.",
      gradient: "from-emerald-500/10 to-teal-500/10 hover:border-emerald-400/50",
      accent: "text-emerald-400",
    },
    {
      href: "/chennai-water",
      title: "Chennai Metro Water",
      icon: "💧",
      badge: "CMWSSB",
      description: "Inspect water supply and sewerage taxes, consumer cards, and bill histories.",
      gradient: "from-sky-500/10 to-cyan-500/10 hover:border-sky-400/50",
      accent: "text-sky-400",
    },
    {
      href: "/statements",
      title: "Bank Statements",
      icon: "📑",
      badge: "Accounts",
      description: "Search transaction records, view spending breakdown, and categorize cash outflows.",
      gradient: "from-rose-500/10 to-pink-500/10 hover:border-rose-400/50",
      accent: "text-rose-400",
    },
    {
      href: "/import",
      title: "Import Statements",
      icon: "📥",
      badge: "Text Parser",
      description: "Upload and parse bank text statements, preview transactions, and save to Firestore.",
      gradient: "from-violet-500/10 to-indigo-500/10 hover:border-violet-400/50",
      accent: "text-violet-400",
    },
    {
      href: "/categories",
      title: "Category Rules",
      icon: "🏷️",
      badge: "Rules Engine",
      description: "Configure automated categorization patterns and reprocess historical transactions.",
      gradient: "from-yellow-500/10 to-amber-500/10 hover:border-yellow-400/50",
      accent: "text-yellow-400",
    },
    {
      href: "/sync/logs",
      title: "Sync Logs & Audit",
      icon: "📋",
      badge: "Diagnostics",
      description: "Trace file-based synchronization logs, regex diagnostic results, and worker executions.",
      gradient: "from-slate-500/10 to-zinc-500/10 hover:border-slate-400/50",
      accent: "text-slate-300",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24 selection:bg-cyan-500/30">
      <FinanceTopBar />

      {/* Floating Notification Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl text-xs font-semibold ${
              toast.type === "success"
                ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
                : toast.type === "error"
                ? "border-rose-500/40 bg-rose-950/90 text-rose-200"
                : "border-cyan-500/40 bg-slate-900/95 text-cyan-200"
            }`}
          >
            <span>{toast.type === "success" ? "✅" : toast.type === "error" ? "❌" : "ℹ️"}</span>
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8 xl:px-10 space-y-6 sm:space-y-8">
        {/* 1. HERO COMMAND HEADER */}
        <header className="relative overflow-hidden rounded-3xl md:rounded-4xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-cyan-950/30 p-6 sm:p-8 lg:p-10 shadow-2xl backdrop-blur-md">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/20 border border-cyan-500/30 px-3 py-0.5 text-xs font-bold text-cyan-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  {formattedDisplayDate}
                </span>
                {isSignedIn && (
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                    <span className="h-1 w-1 rounded-full bg-emerald-400" />
                    {userEmail || "Signed In"}
                  </span>
                )}
              </div>

              <h1 className="mt-3 text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
                {isSignedIn
                  ? `${greeting}, ${user?.displayName ? user.displayName.split(" ")[0] : "Santhosh"}`
                  : "Welcome to Track Everything AI"}
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                {isSignedIn
                  ? "Your unified personal command center for daily life activities, upcoming dues, and automated commitments."
                  : "Your personal private command center. Sign in to access your private diary, utility accounts, and financial commitments."}
              </p>
            </div>

            {/* Quick Action Buttons Group */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {isSignedIn ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsVoiceModalOpen(true)}
                    className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition active:scale-95 cursor-pointer"
                  >
                    <span className="text-base leading-none">🎙️</span>
                    <span>Speak & Log</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsChatDrawerOpen(true)}
                    className="flex items-center gap-2 rounded-2xl border border-indigo-500/30 bg-indigo-500/15 px-3.5 py-2.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/25 hover:border-indigo-500/50 transition active:scale-95 cursor-pointer"
                  >
                    <span className="text-sm">💬</span>
                    <span>Ask Diary AI</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRunSync}
                    disabled={isSyncing}
                    className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 px-3.5 py-2.5 text-xs font-semibold text-slate-200 transition active:scale-95 cursor-pointer disabled:opacity-50"
                    title="Synchronize Gmail statements & bills"
                  >
                    <span className={`text-sm ${isSyncing ? "animate-spin" : ""}`}>⚡</span>
                    <span>{isSyncing ? "Syncing..." : "Sync Bills"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRefreshAll}
                    className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 p-2.5 text-slate-300 hover:text-white transition cursor-pointer"
                    title="Refresh dashboard metrics"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => signInWithGoogle()}
                  className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-xl shadow-cyan-500/25 hover:from-cyan-400 hover:to-indigo-500 transition active:scale-95 cursor-pointer"
                >
                  <span className="text-base">🔐</span>
                  <span>Sign in with Google</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* 2. FOUR KEY METRIC HIGHLIGHT CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          {/* Card 1: Today's Activities */}
          <Link
            href="/timeline"
            className="group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/70 to-cyan-950/30 p-4 sm:p-5 shadow-xl backdrop-blur-md hover:border-cyan-400/40 hover:-translate-y-0.5 transition duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-cyan-300">
                Today's Diary
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                <span>{isSignedIn ? "📔" : "🔒"}</span>
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-white">
                {!isSignedIn ? "Locked" : isLoadingEvents ? "..." : events.length}
              </span>
              <span className="text-xs text-slate-400">{!isSignedIn ? "private" : "events logged"}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>
                {!isSignedIn
                  ? "Sign in to view"
                  : daySummary?.totalDurationMinutes
                  ? `${daySummary.totalDurationMinutes}m tracked`
                  : "Chronological stream"}
              </span>
              <span className="text-cyan-400 group-hover:translate-x-0.5 transition font-medium">
                {isSignedIn ? "Open →" : "Unlock →"}
              </span>
            </div>
          </Link>

          {/* Card 2: Pending Outflows */}
          <Link
            href="/subscriptions?tab=commitments"
            className="group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/70 to-amber-950/30 p-4 sm:p-5 shadow-xl backdrop-blur-md hover:border-amber-400/40 hover:-translate-y-0.5 transition duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-300">
                Pending Dues
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                <span>{isSignedIn ? "⏳" : "🔒"}</span>
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-amber-400">
                {!isSignedIn ? "Locked" : isLoadingSubs ? "..." : `₹${Math.round(totalPendingAmount).toLocaleString("en-IN")}`}
              </span>
              <span className="text-xs text-slate-400">{!isSignedIn ? "private" : "to clear"}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>
                {!isSignedIn
                  ? "Sign in to view"
                  : `${pendingItems.length} bill${pendingItems.length !== 1 ? "s" : ""} pending`}
              </span>
              <span className="text-amber-400 group-hover:translate-x-0.5 transition font-medium">
                {isSignedIn ? "Manage →" : "Unlock →"}
              </span>
            </div>
          </Link>

          {/* Card 3: Due in ≤ 7 Days */}
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/70 to-rose-950/30 p-4 sm:p-5 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-rose-300">
                Due in ≤ 7 Days
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
                <span>{isSignedIn ? "🚨" : "🔒"}</span>
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-white">
                {!isSignedIn ? "Locked" : isLoadingSubs ? "..." : dueSoonItems.length}
              </span>
              <span className="text-xs text-slate-400">{!isSignedIn ? "private" : "urgent"}</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-400 truncate">
              {!isSignedIn
                ? "Sign in to view urgent dues"
                : dueSoonItems.length > 0
                ? `${dueSoonItems[0].sub.name} (₹${Math.round(dueSoonItems[0].remaining).toLocaleString("en-IN")})`
                : "No imminent dues within 7 days"}
            </p>
          </div>

          {/* Card 4: Settled Outflows This Month */}
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/70 to-emerald-950/30 p-4 sm:p-5 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-300">
                Paid This Month
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <span>{isSignedIn ? "✓" : "🔒"}</span>
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400">
                {!isSignedIn ? "Locked" : isLoadingSubs ? "..." : `₹${Math.round(totalPaidAmount).toLocaleString("en-IN")}`}
              </span>
              <span className="text-xs text-slate-400">{!isSignedIn ? "private" : "cleared"}</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              {!isSignedIn
                ? "Sign in to view history"
                : `${settledItems.length} commitment${settledItems.length !== 1 ? "s" : ""} settled`}
            </p>
          </div>
        </div>

        {/* 3. MAIN DUAL DASHBOARD: TODAY'S ACTIVITIES & PENDING DUES */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: TODAY'S ACTIVITIES (7 Cols) */}
          <section className="lg:col-span-7 flex flex-col rounded-3xl border border-white/10 bg-slate-900/70 p-5 sm:p-6 shadow-2xl backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 font-bold text-sm">
                  🗓️
                </span>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-white">Today's Activities</h2>
                  <p className="text-[11px] text-slate-400">
                    Logged events & stream of moments for today
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsVoiceModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-2.5 py-1.5 text-xs font-semibold text-cyan-300 transition cursor-pointer"
                  title="Record new voice note for today"
                >
                  <span>🎙️</span>
                  <span className="hidden sm:inline">Add Moment</span>
                </button>
                <Link
                  href="/timeline"
                  className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition"
                >
                  View Timeline →
                </Link>
              </div>
            </div>

            {/* Activities List */}
            {!isSignedIn ? (
              <div className="rounded-2xl border border-dashed border-cyan-500/20 bg-slate-900/40 p-8 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-2xl">
                  🔒
                </div>
                <h3 className="text-sm sm:text-base font-bold text-white">Private Daily Diary</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Your timeline, voice recordings, and reflections are strictly confidential. Sign in to view and log your daily activity stream.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => signInWithGoogle()}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition cursor-pointer"
                  >
                    <span>🔐</span>
                    <span>Sign in with Google</span>
                  </button>
                </div>
              </div>
            ) : isLoadingEvents ? (
              <div className="space-y-2.5 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-2xl">
                  🎙️
                </div>
                <h3 className="mt-3 text-sm font-bold text-white">No moments logged yet today</h3>
                <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                  Click below or tap the microphone to speak your morning routine, meetings, meals, or reflections.
                </p>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsVoiceModalOpen(true)}
                    className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-cyan-500/20 hover:bg-cyan-400 transition cursor-pointer"
                  >
                    Start Voice Log
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {events.map((ev) => {
                  const meta = ACTIVITY_META_MAP[ev.activityType] || {
                    icon: "📌",
                    name: ev.activityType,
                    badgeColor: "bg-slate-800 text-slate-300 border-white/10",
                  };

                  return (
                    <div
                      key={ev.id}
                      className="group relative flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-900/90 p-3.5 transition hover:border-cyan-500/30 hover:bg-white/[0.03]"
                    >
                      {/* Icon */}
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-lg">
                        {meta.icon}
                      </span>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-bold text-white group-hover:text-cyan-200 transition truncate">
                            {ev.title}
                          </h4>
                          <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${meta.badgeColor}`}>
                            {meta.name}
                          </span>
                        </div>

                        {/* Line 2: Time, Duration, Mood, Tags */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400">
                          {ev.startTime ? (
                            <span className="font-mono text-[11px] text-cyan-300 font-medium">
                              {ev.startTime}
                              {ev.endTime ? ` – ${ev.endTime}` : ""}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500">Untimed</span>
                          )}

                          {ev.durationMinutes && (
                            <span className="rounded-md bg-white/5 px-1.5 py-0.2 text-[10px] text-slate-300">
                              {ev.durationMinutes}m
                            </span>
                          )}

                          {ev.mood && (
                            <span className="rounded-md bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 text-[10px] text-amber-300">
                              {ev.mood}
                            </span>
                          )}

                          {ev.tags && ev.tags.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              {ev.tags.slice(0, 3).map((tag) => (
                                <span key={tag} className="text-[11px] text-slate-400">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {ev.description && (
                          <p className="mt-1.5 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                            {ev.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick Text Entry Bar */}
            {isSignedIn && (
              <form onSubmit={handleQuickNoteSubmit} className="pt-2 border-t border-white/5 flex items-center gap-2">
                <input
                  type="text"
                  value={quickNoteText}
                  onChange={(e) => setQuickNoteText(e.target.value)}
                  placeholder="Log a quick activity (e.g. Reviewed PRs, Morning Chai, Gym 45m)..."
                  disabled={isSavingQuickNote}
                  className="flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!quickNoteText.trim() || isSavingQuickNote}
                  className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-40 transition cursor-pointer"
                >
                  {isSavingQuickNote ? "Saving..." : "Add"}
                </button>
              </form>
            )}
          </section>

          {/* RIGHT: PENDING DUES & COMMITMENTS (5 Cols) */}
          <section className="lg:col-span-5 flex flex-col rounded-3xl border border-white/10 bg-slate-900/70 p-5 sm:p-6 shadow-2xl backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 font-bold text-sm">
                  💳
                </span>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-white">Pending Dues</h2>
                  <p className="text-[11px] text-slate-400">
                    Unsettled bills & upcoming commitments
                  </p>
                </div>
              </div>

              {isSignedIn && (
                <Link
                  href="/subscriptions?tab=commitments"
                  className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition"
                >
                  Manage All →
                </Link>
              )}
            </div>

            {/* Filter Pills */}
            {isSignedIn && (
              <div className="flex items-center gap-1.5 rounded-2xl bg-slate-950/80 p-1 border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setDuesTab("pending")}
                  className={`flex-1 rounded-xl py-1.5 text-center font-semibold transition ${
                    duesTab === "pending"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Pending ({pendingItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDuesTab("due_soon")}
                  className={`flex-1 rounded-xl py-1.5 text-center font-semibold transition ${
                    duesTab === "due_soon"
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Due ≤7d ({dueSoonItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDuesTab("settled")}
                  className={`flex-1 rounded-xl py-1.5 text-center font-semibold transition ${
                    duesTab === "settled"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Settled ({settledItems.length})
                </button>
              </div>
            )}

            {/* Dues Items List */}
            {!isSignedIn ? (
              <div className="rounded-2xl border border-dashed border-amber-500/20 bg-slate-900/40 p-8 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-2xl">
                  🔒
                </div>
                <h3 className="text-sm sm:text-base font-bold text-white">Private Commitments & Dues</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Financial commitments, credit cards, bills, and account balances are protected. Sign in to view and manage upcoming dues.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => signInWithGoogle()}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-amber-500/20 hover:from-amber-400 hover:to-orange-500 transition cursor-pointer"
                  >
                    <span>🔐</span>
                    <span>Sign in with Google</span>
                  </button>
                </div>
              </div>
            ) : isLoadingSubs ? (
              <div className="space-y-2.5 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : displayedDues.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                <span className="text-2xl">🎉</span>
                <h3 className="mt-2 text-sm font-bold text-white">
                  {duesTab === "settled" ? "No settled items found" : "No pending dues in this view!"}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  {duesTab === "settled"
                    ? "Mark items as paid to see them here."
                    : "All tracked commitments are settled or on schedule."}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {displayedDues.map(({ sub, remaining, total, paid, dueDate, daysDiff, isOverdue, isDueSoon }) => {
                  const isMarking = markingPaidId === sub.id;

                  return (
                    <div
                      key={sub.id}
                      className="group relative flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/90 p-3.5 transition hover:border-amber-500/30 hover:bg-white/[0.03]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <SubscriptionAvatar name={sub.name} category={sub.category} size="sm" />
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-white truncate group-hover:text-amber-200 transition">
                            {sub.name}
                          </h4>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                            <span>{sub.category}</span>
                            <span>•</span>
                            {dueDate ? (
                              <span
                                className={`font-medium ${
                                  isOverdue
                                    ? "text-rose-400"
                                    : isDueSoon
                                    ? "text-amber-400 font-semibold"
                                    : "text-slate-300"
                                }`}
                              >
                                {isOverdue
                                  ? `Overdue by ${Math.abs(daysDiff!)}d`
                                  : daysDiff === 0
                                  ? "Due today!"
                                  : daysDiff !== null && daysDiff <= 7
                                  ? `Due in ${daysDiff}d`
                                  : `Due ${dueDate.slice(5)}`}
                              </span>
                            ) : (
                              <span>No fixed due date</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Amount & Quick Action */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="text-sm font-extrabold text-white">
                            ₹{Math.round(remaining > 0 ? remaining : total).toLocaleString("en-IN")}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {remaining > 0 ? "Remaining" : "Paid"}
                          </div>
                        </div>

                        {remaining > 0 ? (
                          <button
                            type="button"
                            onClick={(e) => handleQuickMarkPaid(sub, e)}
                            disabled={isMarking}
                            className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 transition cursor-pointer disabled:opacity-50"
                            title={`Quick mark ${sub.name} as paid`}
                          >
                            {isMarking ? "..." : "✓ Pay"}
                          </button>
                        ) : (
                          <span className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-2 py-1 text-[10px] font-bold text-emerald-300">
                            Paid
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bottom summary link */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
              <span>{settledItems.length} settled this cycle</span>
              <Link
                href="/subscriptions?tab=commitments"
                className="text-amber-400 hover:text-amber-300 font-medium transition"
              >
                Open Full Outflows Engine →
              </Link>
            </div>
          </section>
        </div>

        {/* 4. QUICK LINKS & SERVICES HUB */}
        <section className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white">Quick Links & Hub Services</h2>
              <p className="text-xs text-slate-400">
                Direct access to all integrated finance, utilities, and daily tools
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 p-5 sm:p-6 transition-all duration-300 hover:-translate-y-1 shadow-xl backdrop-blur-md ${link.gradient}`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{link.icon}</span>
                      <h3 className="text-base font-bold text-white group-hover:text-cyan-200 transition">
                        {link.title}
                      </h3>
                    </div>
                    <span className="rounded-md bg-white/5 border border-white/5 px-2 py-0.5 text-[10px] text-slate-400 font-medium">
                      {link.badge}
                    </span>
                  </div>
                  <p className="mt-2.5 text-xs text-slate-400 leading-relaxed">
                    {link.description}
                  </p>
                </div>

                <div className={`mt-5 flex items-center gap-1 text-xs font-semibold ${link.accent} group-hover:translate-x-1 transition`}>
                  <span>Explore</span>
                  <span>→</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>

      {/* Voice Recorder Modal */}
      <VoiceRecorderModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        targetDate={todayIso}
        onEventsSaved={async () => {
          setIsVoiceModalOpen(false);
          setToast({ type: "success", message: "Saved new activities to your timeline!" });
          await fetchTodayEvents();
        }}
      />

      {/* Journal Chat Drawer */}
      <JournalChatDrawer
        isOpen={isChatDrawerOpen}
        onClose={() => setIsChatDrawerOpen(false)}
        selectedDate={todayIso}
      />
    </div>
  );
}
