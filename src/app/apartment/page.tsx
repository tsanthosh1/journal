"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import { ApartmentInsights } from "@/components/apartment/ApartmentInsights";
import { HomefyBillRecord, HomefyApartment } from "@/lib/apartment/types";

export default function ApartmentPage() {
  const { user, userId, isSignedIn } = useAuth();
  const qUserId = user?.email || user?.uid || userId || "";

  const [bills, setBills] = useState<HomefyBillRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"BILLS" | "INSIGHTS">("BILLS");
  const [isLoadingBills, setIsLoadingBills] = useState(true);
  const [isRefreshingRealtime, setIsRefreshingRealtime] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "APPROVAL_PENDING" | "PAID">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Session & Auth state
  const [session, setSession] = useState<{
    mobile?: string;
    apartmentName?: string;
    flatNumber?: string;
    role?: string;
    hasToken?: boolean;
    updatedAt?: string;
  } | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"OTP" | "JWT" | "FLATS">("OTP");

  // OTP Form state
  const [mobileInput, setMobileInput] = useState("");
  const [countryCodeInput, setCountryCodeInput] = useState("+91");
  const [otpToken, setOtpToken] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState<"SEND" | "VERIFY">("SEND");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // JWT Form state
  const [jwtInput, setJwtInput] = useState("");

  // Flats list state
  const [apartments, setApartments] = useState<HomefyApartment[]>([]);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [isLoadingFlats, setIsLoadingFlats] = useState(false);

  // Bill Detail Modal state
  const [selectedBill, setSelectedBill] = useState<HomefyBillRecord | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Linking state
  const [isLinking, setIsLinking] = useState(false);
  const [linkSuccessBanner, setLinkSuccessBanner] = useState<string | null>(null);

  // 1. Fetch Session Status
  const fetchSession = async () => {
    if (!isSignedIn) {
      setSession(null);
      return;
    }
    try {
      const res = await fetch(`/api/apartment/auth/session?userId=${encodeURIComponent(qUserId)}`);
      const data = await res.json();
      if (data.success && data.session) {
        setSession(data.session);
        setMobileInput(data.session.mobile || "");
        setActiveRequestId(data.session.activeRequestId || null);
      } else {
        setSession(null);
      }
    } catch (err) {
      console.error("Failed to load Apartment session:", err);
    }
  };

  // 2. Fetch Bills
  const fetchBills = async (realtime = true) => {
    if (!isSignedIn) {
      setBills([]);
      setIsLoadingBills(false);
      setIsRefreshingRealtime(false);
      return;
    }
    if (realtime) {
      setIsRefreshingRealtime(true);
    } else {
      setIsLoadingBills(true);
    }

    try {
      const res = await fetch(`/api/apartment/bills?realtime=${realtime}&userId=${encodeURIComponent(qUserId)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.bills)) {
        setBills(data.bills);
        if (data.apartmentName || data.flatNumber) {
          setSession((prev) => ({
            ...prev,
            apartmentName: data.apartmentName || prev?.apartmentName,
            flatNumber: data.flatNumber || prev?.flatNumber,
          }));
        }
      }
    } catch (err) {
      console.error("Failed to fetch apartment bills:", err);
    } finally {
      setIsLoadingBills(false);
      setIsRefreshingRealtime(false);
    }
  };

  // 3. Fetch Flats for switching
  const fetchFlats = async () => {
    if (!isSignedIn) {
      setApartments([]);
      return;
    }
    setIsLoadingFlats(true);
    try {
      const res = await fetch(`/api/apartment/flats?userId=${encodeURIComponent(qUserId)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.apartments)) {
        setApartments(data.apartments);
        setActiveRequestId(data.activeRequestId);
      }
    } catch (err) {
      console.error("Failed to fetch flats:", err);
    } finally {
      setIsLoadingFlats(false);
    }
  };

  useEffect(() => {
    if (isSignedIn) {
      fetchSession();
      fetchBills(true);
    } else {
      setSession(null);
      setBills([]);
      setApartments([]);
      setIsLoadingBills(false);
    }
  }, [isSignedIn, qUserId]);

  // OTP: Send
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setIsAuthLoading(true);

    try {
      const res = await fetch("/api/apartment/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: mobileInput, countryCode: countryCodeInput }),
      });
      const data = await res.json();
      if (data.success && data.otpToken) {
        setOtpToken(data.otpToken);
        setOtpStep("VERIFY");
        setAuthSuccess(data.message || "OTP sent successfully! Enter code below.");
      } else {
        setAuthError(data.error || "Failed to send OTP.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Network error sending OTP.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // OTP: Verify
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setIsAuthLoading(true);

    try {
      const res = await fetch("/api/apartment/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: otpCode,
          otpToken,
          mobile: mobileInput,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAuthSuccess("Authentication successful! Refreshing bills...");
        await fetchSession();
        await fetchBills(true);
        setTimeout(() => {
          setIsAuthModalOpen(false);
          setOtpStep("SEND");
          setOtpCode("");
          setAuthSuccess(null);
        }, 1200);
      } else {
        setAuthError(data.error || "OTP verification failed.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Network error verifying OTP.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Direct JWT Save
  const handleSaveJwt = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setIsAuthLoading(true);

    try {
      const res = await fetch("/api/apartment/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: jwtInput, mobile: mobileInput }),
      });
      const data = await res.json();
      if (data.success) {
        setAuthSuccess("JWT saved and flat activated!");
        await fetchSession();
        await fetchBills(true);
        setTimeout(() => {
          setIsAuthModalOpen(false);
          setJwtInput("");
          setAuthSuccess(null);
        }, 1000);
      } else {
        setAuthError(data.error || "Failed to save JWT token.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Failed to save JWT token.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Switch Flat Request
  const handleSwitchFlat = async (requestId: string) => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/apartment/flats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (data.success) {
        setAuthSuccess(data.message || "Flat switched successfully!");
        setActiveRequestId(requestId);
        await fetchSession();
        await fetchBills(true);
        setTimeout(() => {
          setIsAuthModalOpen(false);
          setAuthSuccess(null);
        }, 1000);
      } else {
        setAuthError(data.error || "Failed to switch flat.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Failed to switch flat.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Logout / Clear session
  const handleClearSession = async () => {
    if (!confirm("Are you sure you want to disconnect your Homefy session?")) return;
    try {
      await fetch("/api/apartment/auth/session", { method: "DELETE" });
      setSession(null);
      setBills([]);
      setIsAuthModalOpen(false);
    } catch (e) {
      console.error("Failed to clear session:", e);
    }
  };

  // Open Bill Detail
  const handleOpenDetail = async (bill: HomefyBillRecord) => {
    setSelectedBill(bill);
    setIsLoadingDetail(true);

    try {
      const res = await fetch(`/api/apartment/bills/${bill.id}`);
      const data = await res.json();
      if (data.success && data.bill) {
        setSelectedBill(data.bill);
      }
    } catch (e) {
      console.warn("Could not load rich bill details:", e);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // 1-Click Link to Subscriptions
  const handleLinkSubscription = async (categoryName: string) => {
    setIsLinking(true);
    setLinkSuccessBanner(null);

    try {
      const res = await fetch("/api/apartment/link-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryName }),
      });
      const data = await res.json();
      if (data.success) {
        setLinkSuccessBanner(data.message || `Linked '${categoryName}' to Subscriptions.`);
        setTimeout(() => setLinkSuccessBanner(null), 6000);
      } else {
        alert(data.error || "Failed to link subscription.");
      }
    } catch (err: any) {
      alert(err.message || "Error linking subscription.");
    } finally {
      setIsLinking(false);
    }
  };

  // Filtered Bills
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      // Status filter
      if (statusFilter === "PENDING" && b.status !== "PENDING") return false;
      if (statusFilter === "APPROVAL_PENDING" && b.status !== "APPROVAL_PENDING") return false;
      if (statusFilter === "PAID" && b.status !== "PAID") return false;

      // Category filter
      const bCat = b.category?.name || "Maintenance Bill";
      if (categoryFilter !== "ALL" && bCat.toLowerCase() !== categoryFilter.toLowerCase()) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const num = (b.billId || "").toLowerCase();
        const cat = bCat.toLowerCase();
        const amt = String(b.totalAmount || b.amount);
        const notes = (b.notes || "").toLowerCase();
        if (!num.includes(q) && !cat.includes(q) && !amt.includes(q) && !notes.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [bills, statusFilter, categoryFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    let pendingDue = 0;
    let pendingCount = 0;
    let approvalPendingDue = 0;
    let approvalPendingCount = 0;
    let paidTotal = 0;
    let paidCount = 0;

    for (const b of bills) {
      const amt = b.totalAmount || b.amount || 0;
      if (b.status === "PENDING") {
        pendingDue += amt;
        pendingCount++;
      } else if (b.status === "APPROVAL_PENDING") {
        approvalPendingDue += amt;
        approvalPendingCount++;
      } else if (b.status === "PAID") {
        paidTotal += amt;
        paidCount++;
      }
    }

    return {
      pendingDue,
      pendingCount,
      approvalPendingDue,
      approvalPendingCount,
      paidTotal,
      paidCount,
      totalBills: bills.length,
    };
  }, [bills]);

  // Unique Categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    bills.forEach((b) => {
      if (b.category?.name) set.add(b.category.name);
    });
    return Array.from(set);
  }, [bills]);

  return (
    <AuthGuard
      title="Apartment Maintenance Ledger"
      description="Private Homefy society records, flat maintenance dues, water charges, and payment receipts. Sign in with your authorized Google account to access."
      icon="🏢"
      badge="Private & Encrypted"
    >
      <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white pb-24">
        <FinanceTopBar title="Apartment Management" />

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-12 py-6 space-y-6">
        {/* Success Banner */}
        {linkSuccessBanner && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-4 text-emerald-200 flex items-center justify-between shadow-lg shadow-emerald-950/50 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <span className="text-xl">✅</span>
              <div>
                <p className="text-sm font-semibold">{linkSuccessBanner}</p>
                <p className="text-xs text-emerald-300/80 mt-0.5">
                  View and manage payments on the{" "}
                  <Link href="/subscriptions" className="underline font-bold hover:text-white">
                    Subscriptions & Bills page
                  </Link>
                  .
                </p>
              </div>
            </div>
            <button
              onClick={() => setLinkSuccessBanner(null)}
              className="text-xs text-emerald-400 hover:text-white px-2 py-1 rounded-lg"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Header & Active Context */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-slate-900/90 p-5 sm:p-6 backdrop-blur-xl shadow-xl">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-400 font-black text-lg border border-indigo-500/30 shadow-inner">
                🏢
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  <span>{session?.apartmentName || "Apartment Management"}</span>
                  {session?.flatNumber && (
                    <span className="rounded-full bg-indigo-500/20 border border-indigo-500/40 px-2.5 py-0.5 text-xs font-bold text-indigo-300 font-mono">
                      {session.flatNumber}
                    </span>
                  )}
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Real-time society maintenance, water bills, receipts, and community accounts via Homefy.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Realtime Refresh Button */}
            <button
              onClick={() => fetchBills(true)}
              disabled={isRefreshingRealtime}
              className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 transition cursor-pointer disabled:opacity-50"
            >
              {isRefreshingRealtime ? (
                <svg className="h-3.5 w-3.5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              <span>{isRefreshingRealtime ? "Refreshing..." : "Refresh Realtime"}</span>
            </button>

            {/* Switch Flat Button */}
            <button
              onClick={() => {
                setAuthTab("FLATS");
                setIsAuthModalOpen(true);
                fetchFlats();
              }}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700/80 transition cursor-pointer"
            >
              <span>🏠</span>
              <span>Switch Flat</span>
            </button>

            {/* Auth / Account Settings */}
            <button
              onClick={() => {
                setAuthTab("OTP");
                setIsAuthModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700/80 transition cursor-pointer"
            >
              <span>⚙️</span>
              <span>{session?.mobile ? `+91 ${session.mobile}` : "Connect Account"}</span>
            </button>
          </div>
        </div>

        {/* View Switcher: Bills & Ledger vs Insights & Trends */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <button
            onClick={() => setActiveTab("BILLS")}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold transition cursor-pointer ${
              activeTab === "BILLS"
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <span>📋</span>
            <span>Bills & Community Ledger</span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-300">
              {bills.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("INSIGHTS")}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold transition cursor-pointer ${
              activeTab === "INSIGHTS"
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <span>📈</span>
            <span>Insights & Trends</span>
            <span className="rounded-full bg-teal-500/20 border border-teal-500/30 px-2 py-0.5 text-[10px] font-bold text-teal-300">
              Charts
            </span>
          </button>
        </div>

        {/* VIEW 1: INSIGHTS TAB */}
        {activeTab === "INSIGHTS" ? (
          <ApartmentInsights bills={bills} />
        ) : (
          <>
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Unpaid / Pending */}
          <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-300">Pending Due</span>
              <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                {stats.pendingCount} bills
              </span>
            </div>
            <div className="mt-2 text-2xl font-black tracking-tight text-white font-mono">
              ₹{stats.pendingDue.toLocaleString("en-IN")}
            </div>
            <p className="text-[11px] text-rose-300/70 mt-1">Awaiting your payment</p>
          </div>

          {/* Approval Pending */}
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300">Approval Pending</span>
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                {stats.approvalPendingCount} bills
              </span>
            </div>
            <div className="mt-2 text-2xl font-black tracking-tight text-white font-mono">
              ₹{stats.approvalPendingDue.toLocaleString("en-IN")}
            </div>
            <p className="text-[11px] text-amber-300/70 mt-1">Proof uploaded, society verifying</p>
          </div>

          {/* Paid Total */}
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-300">Paid Bills</span>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                {stats.paidCount} bills
              </span>
            </div>
            <div className="mt-2 text-2xl font-black tracking-tight text-white font-mono">
              ₹{stats.paidTotal.toLocaleString("en-IN")}
            </div>
            <p className="text-[11px] text-emerald-300/70 mt-1">Settled & approved</p>
          </div>

          {/* Track in Subscriptions Quick Actions */}
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-300">Subscription Links</span>
              <span className="text-[10px] text-indigo-400/80 font-mono">Auto-Sync</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <button
                onClick={() => handleLinkSubscription("Maintenance Bill")}
                disabled={isLinking}
                className="text-[11px] font-bold rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 px-2.5 py-1 hover:bg-indigo-500/30 transition cursor-pointer"
              >
                + Link Maintenance
              </button>
              <button
                onClick={() => handleLinkSubscription("Water Bill")}
                disabled={isLinking}
                className="text-[11px] font-bold rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 px-2.5 py-1 hover:bg-indigo-500/30 transition cursor-pointer"
              >
                + Link Water
              </button>
            </div>
            <p className="text-[10px] text-indigo-300/70 mt-2">1-click create in Subscriptions</p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-3 sm:p-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {(["ALL", "PENDING", "APPROVAL_PENDING", "PAID"] as const).map((tab) => {
              const label =
                tab === "ALL"
                  ? `All (${stats.totalBills})`
                  : tab === "PENDING"
                  ? `Pending (${stats.pendingCount})`
                  : tab === "APPROVAL_PENDING"
                  ? `Approval Pending (${stats.approvalPendingCount})`
                  : `Paid (${stats.paidCount})`;

              const isActive = statusFilter === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition whitespace-nowrap cursor-pointer ${
                    isActive
                      ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Search & Category Filter */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 focus:border-indigo-400 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <div className="relative flex-1 sm:w-64">
              <input
                type="text"
                placeholder="Search bills, amounts, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bills Grid */}
        {isLoadingBills ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <div className="relative mb-3 flex items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500/20 border-t-indigo-400" />
              <div className="absolute h-5 w-5 animate-pulse rounded-full bg-indigo-500/10" />
            </div>
            <p className="text-sm font-medium text-slate-300">Fetching real-time community bills from Homefy API...</p>
            <p className="text-xs text-slate-500 mt-1">Connecting to society GraphQL endpoint</p>
          </div>
        ) : filteredBills.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-12 text-center text-slate-400">
            <span className="text-4xl mb-3 block">📋</span>
            <p className="text-base font-bold text-white">No bills found</p>
            <p className="text-xs text-slate-400 mt-1">
              {searchQuery || categoryFilter !== "ALL" || statusFilter !== "ALL"
                ? "Try clearing your search filters or status selection."
                : "No bills have been published for this flat context."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBills.map((bill) => {
              const catName = bill.category?.name || "Maintenance Bill";
              const isPaid = bill.status === "PAID";
              const isApprovalPending = bill.status === "APPROVAL_PENDING";
              const isPending = bill.status === "PENDING";
              const amt = bill.totalAmount || bill.amount || 0;
              const dueDate = bill.lastDate ? bill.lastDate.split("T")[0] : null;
              const paidInfo = bill.paidRequest && bill.paidRequest.length > 0 ? bill.paidRequest[0] : null;

              return (
                <div
                  key={bill.id}
                  className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 backdrop-blur-md hover:border-indigo-500/40 transition flex flex-col justify-between space-y-4 shadow-lg"
                >
                  {/* Card Header */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 font-bold text-sm">
                          {catName.includes("Water") ? "💧" : catName.includes("Corpus") ? "🏦" : "🏢"}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                            {catName}
                          </div>
                          <div className="text-xs font-mono text-slate-400">{bill.billId}</div>
                        </div>
                      </div>

                      {/* Status Pill */}
                      {isPaid ? (
                        <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
                          PAID
                        </span>
                      ) : isApprovalPending ? (
                        <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-300">
                          PENDING APPROVAL
                        </span>
                      ) : (
                        <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2.5 py-0.5 text-[10px] font-extrabold text-rose-300">
                          UNPAID
                        </span>
                      )}
                    </div>

                    {/* Amount & Due Date */}
                    <div className="mt-4 flex items-baseline justify-between">
                      <div>
                        <span className="text-2xl font-black text-white font-mono tracking-tight">
                          ₹{amt.toLocaleString("en-IN")}
                        </span>
                        {bill.fineAmount > 0 && (
                          <span className="text-[11px] text-rose-400 ml-1.5 font-mono">
                            (+₹{bill.fineAmount} fine)
                          </span>
                        )}
                      </div>
                      {dueDate && (
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Due Date</span>
                          <span className="text-xs font-semibold text-slate-200 font-mono">{dueDate}</span>
                        </div>
                      )}
                    </div>

                    {/* Paid Proof Info or Maintenance Period */}
                    {bill.maintenance?.description && (
                      <p className="text-[11px] text-slate-300/80 mt-2.5 bg-white/5 rounded-xl p-2 font-mono">
                        {bill.maintenance.description}
                      </p>
                    )}

                    {isApprovalPending && paidInfo && (
                      <div className="mt-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200 flex items-center justify-between">
                        <span className="text-[11px]">Txn #{paidInfo.transactionNo || "Submitted"}</span>
                        <span className="text-[10px] text-amber-300 font-mono">
                          {paidInfo.date ? paidInfo.date.split("T")[0] : "Recent"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-1">
                    <button
                      onClick={() => handleOpenDetail(bill)}
                      className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
                    >
                      Details & Proof ↗
                    </button>

                    <div className="flex items-center gap-1.5">
                      {/* Invoice PDF */}
                      <a
                        href={`/api/apartment/receipts/${bill.id}?type=invoice`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-slate-800 hover:bg-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:text-white transition"
                        title="Download Invoice PDF"
                      >
                        📄 Invoice
                      </a>

                      {/* Receipt PDF */}
                      {(isPaid || isApprovalPending) && (
                        <a
                          href={`/api/apartment/receipts/${bill.id}?type=receipt`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-500/30 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:text-white transition"
                          title="Download Receipt PDF"
                        >
                          🧾 Receipt
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    )}
  </main>

      {/* Bill Detail Modal */}
      {selectedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                  {selectedBill.category?.name || "Apartment Bill"}
                </span>
                <h2 className="text-xl font-black text-white font-mono mt-0.5">
                  {selectedBill.billId}
                </h2>
                <p className="text-xs text-slate-400 font-mono">Internal ID: {selectedBill.id}</p>
              </div>
              <button
                onClick={() => setSelectedBill(null)}
                className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            {/* Financial Breakdown */}
            <div className="grid grid-cols-3 gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-center">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Base Amount</span>
                <span className="text-base font-bold text-white font-mono">
                  ₹{(selectedBill.amount || 0).toLocaleString("en-IN")}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Fine Amount</span>
                <span className="text-base font-bold text-rose-400 font-mono">
                  ₹{(selectedBill.fineAmount || 0).toLocaleString("en-IN")}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Payable</span>
                <span className="text-lg font-black text-indigo-300 font-mono">
                  ₹{(selectedBill.totalAmount || selectedBill.amount || 0).toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Timings */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-white/10 bg-slate-800/40 p-3">
                <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Due Date</span>
                <span className="font-semibold text-slate-200 font-mono">
                  {selectedBill.lastDate ? selectedBill.lastDate.split("T")[0] : "N/A"}
                </span>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-800/40 p-3">
                <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Bill Generated Date</span>
                <span className="font-semibold text-slate-200 font-mono">
                  {selectedBill.createdAt ? selectedBill.createdAt.split("T")[0] : "N/A"}
                </span>
              </div>
            </div>

            {/* Maintenance Scope */}
            {selectedBill.maintenance && (
              <div className="rounded-2xl border border-white/10 bg-slate-800/30 p-4 space-y-1.5 text-xs">
                <span className="font-bold text-slate-200">Maintenance Period</span>
                <p className="text-slate-300 font-mono">{selectedBill.maintenance.description}</p>
                {(selectedBill.maintenance.startDate || selectedBill.maintenance.endDate) && (
                  <div className="text-slate-400 text-[11px] font-mono">
                    Period: {selectedBill.maintenance.startDate?.split("T")[0]} to{" "}
                    {selectedBill.maintenance.endDate?.split("T")[0]}
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {selectedBill.notes && (
              <div className="rounded-2xl border border-white/10 bg-slate-800/30 p-4 space-y-1 text-xs">
                <span className="font-bold text-slate-200">Society Notes</span>
                <p className="text-slate-300 leading-relaxed">{selectedBill.notes}</p>
              </div>
            )}

            {/* Payment Proof / S3 Receipt Proof */}
            {selectedBill.paidRequest && selectedBill.paidRequest.length > 0 && (
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-300 text-xs">Payment Proof & Transaction</span>
                  <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                    Status: {selectedBill.paidRequest[0].status}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Payment Mode</span>
                    <span className="font-semibold text-slate-200 font-mono">
                      {selectedBill.paidRequest[0].paymentMode || "ACCOUNT / UPI"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Transaction #</span>
                    <span className="font-semibold text-slate-200 font-mono">
                      {selectedBill.paidRequest[0].transactionNo || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Payment Date</span>
                    <span className="font-semibold text-slate-200 font-mono">
                      {selectedBill.paidRequest[0].date
                        ? selectedBill.paidRequest[0].date.split("T")[0]
                        : "N/A"}
                    </span>
                  </div>
                </div>

                {/* Proof Image */}
                {selectedBill.paidRequest[0].image?.url && (
                  <div className="pt-2">
                    <span className="text-[11px] text-slate-400 block mb-1.5">
                      Uploaded Screenshot / Transfer Proof:
                    </span>
                    <a
                      href={selectedBill.paidRequest[0].image.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-xl border border-white/20 bg-black/40 hover:opacity-90 transition max-h-64"
                    >
                      <img
                        src={selectedBill.paidRequest[0].image.url}
                        alt="Payment Proof"
                        className="w-full object-contain max-h-64"
                      />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <div className="flex items-center gap-2">
                <a
                  href={`/api/apartment/receipts/${selectedBill.id}?type=invoice`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-white/15 bg-slate-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-700 transition"
                >
                  📄 Download Invoice
                </a>
                {(selectedBill.status === "PAID" || selectedBill.status === "APPROVAL_PENDING") && (
                  <a
                    href={`/api/apartment/receipts/${selectedBill.id}?type=receipt`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-emerald-500/30 bg-emerald-950/60 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-900 transition"
                  >
                    🧾 Download Receipt
                  </a>
                )}
              </div>

              <button
                onClick={() => setSelectedBill(null)}
                className="rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/20 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth & Flats Settings Modal */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Apartment Authentication</h3>
                <p className="text-xs text-slate-400">Configure phone number, OTP, or switch active flat</p>
              </div>
              <button
                onClick={() => {
                  setIsAuthModalOpen(false);
                  setAuthError(null);
                  setAuthSuccess(null);
                }}
                className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            {/* Error / Success Alerts */}
            {authError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                {authError}
              </div>
            )}
            {authSuccess && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                {authSuccess}
              </div>
            )}

            {/* Tab Navigation */}
            <div className="flex rounded-xl bg-slate-950 p-1 border border-white/10 gap-1">
              <button
                onClick={() => {
                  setAuthTab("OTP");
                  setAuthError(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  authTab === "OTP" ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Phone & OTP
              </button>
              <button
                onClick={() => {
                  setAuthTab("FLATS");
                  setAuthError(null);
                  fetchFlats();
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  authTab === "FLATS" ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Switch Flat
              </button>
              <button
                onClick={() => {
                  setAuthTab("JWT");
                  setAuthError(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  authTab === "JWT" ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Direct JWT
              </button>
            </div>

            {/* TAB 1: OTP Auth */}
            {authTab === "OTP" && (
              <div className="space-y-4">
                {otpStep === "SEND" ? (
                  <form onSubmit={handleSendOtp} className="space-y-3">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Enter your mobile number registered with Homefy. We will send a 6-digit SMS OTP to authenticate.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={countryCodeInput}
                        onChange={(e) => setCountryCodeInput(e.target.value)}
                        className="w-20 rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs font-mono text-white text-center"
                      />
                      <input
                        type="tel"
                        placeholder="10-digit mobile number"
                        value={mobileInput}
                        onChange={(e) => setMobileInput(e.target.value)}
                        className="flex-1 rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-indigo-400 focus:outline-none"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isAuthLoading}
                      className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 py-2.5 text-xs font-bold text-white transition disabled:opacity-50 cursor-pointer"
                    >
                      {isAuthLoading ? "Sending OTP..." : "Send OTP via SMS"}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-3">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Enter the 6-digit verification code received on {countryCodeInput} {mobileInput}:
                    </p>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="Enter 6-digit OTP"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2.5 text-center text-lg font-mono font-bold tracking-widest text-white focus:border-indigo-400 focus:outline-none"
                      required
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setOtpStep("SEND")}
                        className="rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-xs text-slate-300 hover:bg-slate-700"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={isAuthLoading}
                        className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 py-2 text-xs font-bold text-white transition disabled:opacity-50 cursor-pointer"
                      >
                        {isAuthLoading ? "Verifying..." : "Verify & Activate Context"}
                      </button>
                    </div>
                  </form>
                )}

                {session && (
                  <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
                    <div>
                      <span>Connected: </span>
                      <span className="font-mono text-white">
                        {session.apartmentName} ({session.flatNumber})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearSession}
                      className="text-rose-400 hover:underline cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Switch Flat */}
            {authTab === "FLATS" && (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {isLoadingFlats ? (
                  <div className="py-10 flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500/20 border-t-indigo-400" />
                    <span>Loading apartments & flats...</span>
                  </div>
                ) : apartments.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    No apartments found or not authenticated. Please log in first.
                  </p>
                ) : (
                  apartments.map((apt) => (
                    <div key={apt.id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 space-y-2">
                      <div className="font-bold text-xs text-indigo-300">{apt.name}</div>
                      <div className="space-y-1.5">
                        {(apt.requests || []).map((req) => {
                          const flat = req.flat;
                          const block = flat?.block?.blockName || "";
                          const flatNo = flat?.flatNumber || "";
                          const flatStr = block ? `${block}-${flatNo}` : flatNo;
                          const isActive = req.id === activeRequestId;

                          return (
                            <div
                              key={req.id}
                              className={`flex items-center justify-between rounded-xl p-2.5 text-xs ${
                                isActive
                                  ? "border border-indigo-500/40 bg-indigo-500/20 text-white"
                                  : "border border-white/5 bg-slate-900 text-slate-300"
                              }`}
                            >
                              <div>
                                <span className="font-bold font-mono text-sm">{flatStr}</span>
                                <span className="text-[10px] text-slate-400 ml-2 uppercase">({req.roleType})</span>
                              </div>
                              {isActive ? (
                                <span className="text-[11px] font-bold text-indigo-300">ACTIVE</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSwitchFlat(req.id)}
                                  disabled={isAuthLoading}
                                  className="rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[11px] font-semibold text-white transition cursor-pointer"
                                >
                                  Activate
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 3: Direct JWT */}
            {authTab === "JWT" && (
              <form onSubmit={handleSaveJwt} className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Paste an existing Homefy access token (JWT) to immediately activate flat context and synchronization.
                </p>
                <textarea
                  rows={4}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={jwtInput}
                  onChange={(e) => setJwtInput(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-slate-950 p-3 text-xs font-mono text-white focus:border-indigo-400 focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  disabled={isAuthLoading}
                  className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 py-2.5 text-xs font-bold text-white transition disabled:opacity-50 cursor-pointer"
                >
                  {isAuthLoading ? "Saving..." : "Save Token & Auto-Activate"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
    </AuthGuard>
  );
}
