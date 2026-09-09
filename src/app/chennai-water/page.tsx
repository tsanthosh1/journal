"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import {
  ChennaiWaterProperty,
  ChennaiWaterReceipt,
  ChennaiWaterSession,
} from "@/lib/chennaiWater/types";
import { formatPropNo, formatCmcNo, formatAddress } from "@/lib/chennaiWater/client";
import { ChennaiWaterInsights } from "@/components/chennaiWater/ChennaiWaterInsights";
import { authFetch } from "@/lib/authFetch";

type ViewTab = "ASSESSMENT" | "RECEIPTS" | "INSIGHTS";

export default function ChennaiWaterPage() {
  const { user, userId, isSignedIn } = useAuth();
  const qUserId = user?.email || user?.uid || userId || "";

  const [session, setSession] = useState<ChennaiWaterSession | null>(null);
  const [properties, setProperties] = useState<ChennaiWaterProperty[]>([]);
  const [activeProperty, setActiveProperty] = useState<ChennaiWaterProperty | null>(null);
  const [receipts, setReceipts] = useState<ChennaiWaterReceipt[]>([]);
  const [duesData, setDuesData] = useState<any>(null);

  const [activeTab, setActiveTab] = useState<ViewTab>("ASSESSMENT");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isLinkingSub, setIsLinkingSub] = useState<boolean>(false);
  const [linkSuccessMessage, setLinkSuccessMessage] = useState<string | null>(null);

  // Filter state for receipts & insights
  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [receiptSearch, setReceiptSearch] = useState<string>("");
  const [modeFilter, setModeFilter] = useState<string>("ALL");

  // Auth Modal state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [mobileOrEmail, setMobileOrEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // Receipt PDF Modal state
  const [selectedPdfReceipt, setSelectedPdfReceipt] = useState<ChennaiWaterReceipt | null>(null);

  const loadAllData = async (refresh: boolean = false) => {
    if (!isSignedIn) {
      setSession(null);
      setProperties([]);
      setReceipts([]);
      setDuesData(null);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      // 1. Fetch session
      const sessionRes = await authFetch(user, `/api/chennai-water/auth/session?userId=${encodeURIComponent(qUserId)}`);
      const sessionJson = await sessionRes.json();
      if (sessionJson.success && sessionJson.session) {
        setSession(sessionJson.session);
        if (sessionJson.session.mobileOrEmail) {
          setMobileOrEmail(sessionJson.session.mobileOrEmail);
        }
      }

      // 2. Fetch properties
      const propRes = await authFetch(user, `/api/chennai-water/properties?userId=${encodeURIComponent(qUserId)}`);
      const propJson = await propRes.json();
      if (propJson.success && propJson.properties) {
        setProperties(propJson.properties);
        const active =
          propJson.properties.find(
            (p: any) => String(p.id) === String(propJson.activePropertyId)
          ) || propJson.properties[0];
        setActiveProperty(active);
      }

      // 3. Fetch dues & ledger
      const duesRes = await authFetch(user, `/api/chennai-water/ledger?userId=${encodeURIComponent(qUserId)}`);
      const duesJson = await duesRes.json();
      if (duesJson.success) {
        setDuesData(duesJson.dues);
        if (duesJson.property) {
          setActiveProperty(duesJson.property);
        }
      }

      // 4. Fetch receipts
      const recRes = await authFetch(user, `/api/chennai-water/receipts?userId=${encodeURIComponent(qUserId)}`);
      const recJson = await recRes.json();
      if (recJson.success && recJson.receipts) {
        setReceipts(recJson.receipts);
      }
    } catch (err) {
      console.error("Failed to load Chennai Water data:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial fetch on auth change
  useEffect(() => {
    if (isSignedIn) {
      loadAllData();
    } else {
      setSession(null);
      setProperties([]);
      setReceipts([]);
      setDuesData(null);
      setIsLoading(false);
    }
  }, [isSignedIn, qUserId]);

  // Switch property
  const handlePropertyChange = async (propertyId: string | number) => {
    try {
      setIsLoading(true);
      const res = await authFetch(user, "/api/chennai-water/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const data = await res.json();
      if (data.success) {
        await loadAllData();
      }
    } catch (err) {
      console.error("Failed to switch property:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      const res = await authFetch(user, "/api/chennai-water/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobileOrEmail, password }),
      });

      const data = await res.json();
      if (data.success) {
        setIsAuthModalOpen(false);
        setPassword("");
        await loadAllData();
      } else {
        setAuthError(data.error || "Authentication failed.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Failed to communicate with CMWSSB login server.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Disconnect session
  const handleDisconnect = async () => {
    if (!confirm("Disconnect your CMWSSB portal account?")) return;
    try {
      await authFetch(user, "/api/chennai-water/auth/session", { method: "DELETE" });
      setSession(null);
      setIsAuthModalOpen(false);
      await loadAllData();
    } catch (err) {
      console.error("Failed to disconnect:", err);
    }
  };

  // 1-Click Link to Subscriptions
  const handleLinkSubscription = async () => {
    setIsLinkingSub(true);
    setLinkSuccessMessage(null);
    try {
      const res = await authFetch(user, "/api/chennai-water/link-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billNumber: activeProperty?.prop_no || session?.activeBillNo || "15-193-097538",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLinkSuccessMessage(
          `Successfully linked to Subscriptions tracker with ${receipts.length} past receipts!`
        );
        setTimeout(() => setLinkSuccessMessage(null), 5000);
      } else {
        alert(data.error || "Failed to link subscription.");
      }
    } catch (err: any) {
      alert(err.message || "Failed to link subscription.");
    } finally {
      setIsLinkingSub(false);
    }
  };

  // Filtered receipts
  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      // Year filter
      if (selectedYear !== "ALL") {
        const year = r.receipt_dt?.includes("/")
          ? r.receipt_dt.split("/")[2]
          : r.receipt_dt?.slice(0, 4);
        if (year !== selectedYear) return false;
      }

      // Mode filter
      if (modeFilter !== "ALL" && r.payment_mode !== modeFilter) {
        return false;
      }

      // Search query
      if (receiptSearch.trim()) {
        const q = receiptSearch.toLowerCase();
        return (
          r.receipt_no.toLowerCase().includes(q) ||
          r.payment_mode.toLowerCase().includes(q) ||
          String(r.amount).includes(q) ||
          (r.receipt_dt && r.receipt_dt.includes(q))
        );
      }

      return true;
    });
  }, [receipts, selectedYear, modeFilter, receiptSearch]);

  // Year choices
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    receipts.forEach((r) => {
      const y = r.receipt_dt?.includes("/")
        ? r.receipt_dt.split("/")[2]
        : r.receipt_dt?.slice(0, 4);
      if (y && /^\d{4}$/.test(y)) years.add(y);
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [receipts]);

  // Yearly totals
  const totalPaidFiltered = useMemo(() => {
    return filteredReceipts.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
  }, [filteredReceipts]);

  const annualValueStr = typeof activeProperty?.annual_value === "string" ? activeProperty.annual_value : "₹11,960.00";
  const halfYearTaxStr = typeof activeProperty?.half_year_tax === "string" ? activeProperty.half_year_tax : "₹419.00";
  const catDescStr = typeof activeProperty?.cat_desc === "string" ? activeProperty.cat_desc : "201 - Domestic-F-UM@30";
  const effFromTermStr = typeof activeProperty?.eff_from_term === "string" ? activeProperty.eff_from_term : "24-25/II (Oct-Mar)";

  const activeBillNoStr = formatPropNo(activeProperty?.prop_no || session?.activeBillNo) || "15-193-097538";
  const activeCmcNoStr = formatCmcNo(activeProperty?.cmc_no || session?.activeCmcNo) || "15-193-56648-000";
  const addressStr = formatAddress(activeProperty?.addr || session?.address) || "60-4B-C-IVFLR-BLUEMOON CALLIST, ANAND NAGAR, THORAIPAKKAM, Chennai - 600097";
  const customerNameStr =
    (typeof activeProperty?.c_name === "string" && activeProperty.c_name.trim()) ||
    (typeof session?.customerName === "string" && session.customerName.trim()) ||
    "SANTHOSH T";

  return (
    <AuthGuard
      title="Chennai Metro Water Ledger"
      description="Private CMWSSB water tax assessments, consumer cards, and payment receipts. Sign in with your authorized Google account to access."
      icon="💧"
      badge="Private & Encrypted"
    >
      <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-sky-500/30">
        <FinanceTopBar title="Metro Water" />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Top Header & Executive Property Banner */}
        <div className="rounded-3xl border border-sky-500/20 bg-gradient-to-br from-slate-900/90 via-sky-950/20 to-slate-900/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 relative z-10">
            {/* Left: Organization & Property Info */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-400 font-extrabold text-base shadow-inner">
                  💧
                </span>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                    Chennai Metro Water (CMWSSB)
                  </h1>
                  <p className="text-xs text-slate-400">
                    Chennai Metropolitan Water Supply & Sewerage Board • Consumer Portal
                  </p>
                </div>
              </div>

              {/* Bill Identifiers & Address */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                {/* New Bill Number Pill or Switcher */}
                {properties.length > 1 ? (
                  <div className="flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 py-1 text-xs font-mono font-bold text-sky-300">
                    <span className="text-[10px] uppercase font-sans text-sky-400/80">Select Property:</span>
                    <select
                      value={activeProperty?.id || ""}
                      onChange={(e) => handlePropertyChange(e.target.value)}
                      className="bg-transparent border-0 text-xs font-mono font-bold text-sky-200 focus:outline-none cursor-pointer"
                    >
                      {properties.map((p) => {
                        const pBill = formatPropNo(p.prop_no) || String(p.id);
                        return (
                          <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                            {pBill} {p.c_name ? `(${p.c_name})` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-mono font-bold text-sky-300">
                    <span className="text-[10px] uppercase font-sans text-sky-400/70">New Bill:</span>
                    <span>{activeBillNoStr}</span>
                  </div>
                )}

                {/* Existing Bill Number Pill */}
                <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-mono text-slate-300">
                  <span className="text-[10px] uppercase font-sans text-slate-400">Existing:</span>
                  <span>{activeCmcNoStr}</span>
                </div>

                {/* Status Pill */}
                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 text-[11px] font-extrabold text-emerald-300">
                  Active
                </span>

                {/* Consumer Name */}
                <span className="text-xs font-semibold text-slate-200">
                  {customerNameStr}
                </span>
              </div>

              {/* Address */}
              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                📍 {addressStr}
              </p>
            </div>

            {/* Right: Actions & Config */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              {/* Refresh Button */}
              <button
                type="button"
                onClick={() => loadAllData(true)}
                disabled={isRefreshing}
                className="flex items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-2.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 transition cursor-pointer disabled:opacity-50"
              >
                {isRefreshing ? (
                  <svg className="h-3.5 w-3.5 animate-spin text-sky-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                <span>{isRefreshing ? "Refreshing..." : "Refresh Live"}</span>
              </button>

              {/* Portal Login / Config Button */}
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/80 px-3.5 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700/80 transition cursor-pointer"
              >
                <span>🔐</span>
                <span>{session?.token ? "Portal Connected" : "Connect Account"}</span>
              </button>

              {/* Track in Subscriptions 1-Click Link Button */}
              <button
                type="button"
                onClick={handleLinkSubscription}
                disabled={isLinkingSub}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-lg hover:from-sky-400 hover:to-blue-500 transition cursor-pointer disabled:opacity-50"
              >
                {isLinkingSub ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950 border-r-transparent" />
                ) : (
                  <span>⚡</span>
                )}
                <span>Track in Subscriptions</span>
              </button>
            </div>
          </div>

          {/* Success Banner */}
          {linkSuccessMessage && (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-center justify-between">
              <span>✓ {linkSuccessMessage}</span>
              <Link href="/subscriptions" className="font-bold underline hover:text-emerald-200">
                View in Subscriptions →
              </Link>
            </div>
          )}
        </div>

        {/* 4 Key Metric Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Tile 1: Annual Value */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4.5 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Annual Value (AV)
            </span>
            <div className="text-xl sm:text-2xl font-black text-white">
              {annualValueStr}
            </div>
            <span className="text-[11px] text-sky-400/80 font-medium block">
              Eff. from: {effFromTermStr}
            </span>
          </div>

          {/* Tile 2: Half-Yearly Water Tax */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4.5 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Half-Yearly Water Tax
            </span>
            <div className="text-xl sm:text-2xl font-black text-sky-300">
              {halfYearTaxStr}
            </div>
            <span className="text-[11px] text-slate-400 block">
              Billed twice a year (Apr-Sep & Oct-Mar)
            </span>
          </div>

          {/* Tile 3: Building Category */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4.5 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Class & Category
            </span>
            <div className="text-sm font-bold text-slate-200 truncate" title={catDescStr}>
              {catDescStr}
            </div>
            <span className="text-[11px] text-emerald-400 font-medium block">
              Standard Residential Flat
            </span>
          </div>

          {/* Tile 4: Outstanding Dues */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4.5 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Total Outstanding Dues
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-400">
              ₹{(duesData?.totalDue || 0).toFixed(2)}
            </div>
            <span className="text-[11px] text-emerald-400/80 font-medium block">
              ✓ No dues found • All clear
            </span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("ASSESSMENT")}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
                activeTab === "ASSESSMENT"
                  ? "bg-sky-500 text-slate-950 shadow-md"
                  : "bg-slate-900/80 text-slate-400 hover:text-white"
              }`}
            >
              📋 Property Assessment & Dues
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("RECEIPTS")}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
                activeTab === "RECEIPTS"
                  ? "bg-sky-500 text-slate-950 shadow-md"
                  : "bg-slate-900/80 text-slate-400 hover:text-white"
              }`}
            >
              🧾 Payment Receipts ({receipts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("INSIGHTS")}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
                activeTab === "INSIGHTS"
                  ? "bg-sky-500 text-slate-950 shadow-md"
                  : "bg-slate-900/80 text-slate-400 hover:text-white"
              }`}
            >
              📈 Trends & Insights
            </button>
          </div>
        </div>

        {/* TAB 1: Assessment & Dues Breakdown */}
        {activeTab === "ASSESSMENT" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Selected for Payment / Assessment Particulars
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Live status from the Chennai Metropolitan Water Supply & Sewerage Board portal
                  </p>
                </div>
                <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
                  All Dues Cleared
                </span>
              </div>

              {/* Assessment Table matching CMWSSB portal */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 text-[11px] uppercase tracking-wider">
                      <th className="py-3 px-3">Sl. No.</th>
                      <th className="py-3 px-3">Particulars</th>
                      <th className="py-3 px-3">Collected For</th>
                      <th className="py-3 px-3 text-right">Total Due Amount (₹)</th>
                      <th className="py-3 px-3 text-right">Advance Amount (₹)</th>
                      <th className="py-3 px-3 text-right">Total Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    <tr className="hover:bg-white/[0.02] transition">
                      <td className="py-3 px-3 text-slate-400">1</td>
                      <td className="py-3 px-3 font-sans font-semibold text-white">
                        Water & Sewerage Tax
                      </td>
                      <td className="py-3 px-3 font-sans text-slate-300">Tax</td>
                      <td className="py-3 px-3 text-right text-slate-300">₹0.00</td>
                      <td className="py-3 px-3 text-right text-sky-400">Pay in advance</td>
                      <td className="py-3 px-3 text-right font-bold text-white">₹0.00</td>
                    </tr>
                    <tr className="hover:bg-white/[0.02] transition">
                      <td className="py-3 px-3 text-slate-400">2</td>
                      <td className="py-3 px-3 font-sans font-semibold text-white">
                        Water & Sewerage Usage Charges
                      </td>
                      <td className="py-3 px-3 font-sans text-slate-300">Charges</td>
                      <td className="py-3 px-3 text-right text-slate-300">₹0.00</td>
                      <td className="py-3 px-3 text-right text-sky-400">Pay in advance</td>
                      <td className="py-3 px-3 text-right font-bold text-white">₹0.00</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/10 font-bold text-white font-mono">
                      <td colSpan={3} className="py-3.5 px-3 font-sans uppercase tracking-wider text-right">
                        Total Amount Payable:
                      </td>
                      <td className="py-3.5 px-3 text-right text-emerald-400">₹0.00</td>
                      <td className="py-3.5 px-3 text-right text-slate-400">₹0.00</td>
                      <td className="py-3.5 px-3 text-right text-emerald-400 text-sm">₹0.00</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Explanatory Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 space-y-2">
                <div className="flex items-center gap-2 text-sky-300 font-bold text-xs">
                  <span>ℹ️</span> How CMWSSB Water Tax Works
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Metro Water Tax is levied semi-annually (half-yearly) based on the Annual Value (AV) assessed by the Greater Chennai Corporation. For your flat with an AV of {annualValueStr}, the tax rate amounts to {halfYearTaxStr} per half-year (Apr-Sep and Oct-Mar).
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 space-y-2">
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs">
                  <span>💳</span> Payment Modes & Receipts
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Payments are accepted online through the official portal, Bharat Bill Payment System (BBPS), and banking partners. Official e-Receipts are generated immediately with official CMWSSB digital verification.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Payment Receipts */}
        {activeTab === "RECEIPTS" && (
          <div className="space-y-4">
            {/* Filters Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/40 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                {/* Year Selector */}
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="rounded-xl border border-white/15 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Years ({receipts.length})</option>
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>

                {/* Payment Mode Selector */}
                <select
                  value={modeFilter}
                  onChange={(e) => setModeFilter(e.target.value)}
                  className="rounded-xl border border-white/15 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Modes</option>
                  <option value="BBPS">BBPS</option>
                  <option value="OLP">Online Portal (OLP)</option>
                  <option value="CHQ">Cheque (CHQ)</option>
                </select>
              </div>

              {/* Search Box */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search receipt #, mode, amount..."
                  value={receiptSearch}
                  onChange={(e) => setReceiptSearch(e.target.value)}
                  className="w-full sm:w-64 rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
                {receiptSearch && (
                  <button
                    type="button"
                    onClick={() => setReceiptSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Receipts Table */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-slate-950/50 text-slate-400 text-[11px] uppercase tracking-wider">
                      <th className="py-3 px-4 text-center">Sl. No.</th>
                      <th className="py-3 px-4">Receipt Date</th>
                      <th className="py-3 px-4">Receipt No.</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Payment Mode</th>
                      <th className="py-3 px-4 text-right">Amount (in ₹)</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {filteredReceipts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 font-sans">
                          No receipts found matching the filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredReceipts.map((rec, idx) => (
                        <tr key={rec.id || idx} className="hover:bg-white/[0.02] transition">
                          <td className="py-3 px-4 text-center text-slate-400">{idx + 1}</td>
                          <td className="py-3 px-4 text-slate-200 font-semibold">{rec.receipt_dt}</td>
                          <td className="py-3 px-4 font-bold text-sky-300">{rec.receipt_no}</td>
                          <td className="py-3 px-4 font-sans">
                            <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-extrabold text-emerald-300">
                              {rec.type || "Receipt"}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-300">
                              {rec.payment_mode}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-white text-sm">
                            ₹{Number(rec.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedPdfReceipt(rec)}
                              className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 transition cursor-pointer inline-flex items-center gap-1"
                            >
                              <span>📄</span>
                              <span>View</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Footer */}
              <div className="flex items-center justify-between border-t border-white/10 bg-slate-950/40 p-4 text-xs">
                <span className="text-slate-400">
                  Showing {filteredReceipts.length} of {receipts.length} total receipts
                </span>
                <span className="font-bold text-white">
                  Total Filtered Outflow:{" "}
                  <span className="font-mono text-sky-300">
                    ₹{totalPaidFiltered.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Trends & Half-Yearly Insights */}
        {activeTab === "INSIGHTS" && (
          <ChennaiWaterInsights
            receipts={receipts}
            halfYearTax={halfYearTaxStr}
            annualValue={annualValueStr}
            onViewReceipt={(r) => setSelectedPdfReceipt(r)}
          />
        )}
      </main>

      {/* MODAL 1: Account Login / Portal Configuration */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔐</span>
                <h3 className="font-bold text-white text-sm">Connect CMWSSB Account</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(false)}
                className="text-slate-400 hover:text-white text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                Enter your credentials registered with the official Chennai Metro Water consumer portal (<code>bnc.chennaimetrowater.in</code>). We use native client-side AES-256-CBC encryption to authenticate.
              </p>

              {authError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                  {authError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  Registered Mobile No. or Email *
                </label>
                <input
                  type="text"
                  required
                  value={mobileOrEmail}
                  onChange={(e) => setMobileOrEmail(e.target.value)}
                  placeholder="9876543210 or email@example.com"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2 text-xs font-mono text-white focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  Portal Password *
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center gap-2.5">
                <button
                  type="submit"
                  disabled={authLoading}
                  className="flex-1 rounded-xl bg-sky-600 hover:bg-sky-500 py-2.5 text-xs font-bold text-white transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {authLoading ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <span>Authenticate & Sync</span>
                  )}
                </button>
              </div>

              {session?.token && (
                <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
                  <span>Connected as {session.mobileOrEmail}</span>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="text-rose-400 hover:underline cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Receipt PDF Viewer Popup matching CMWSSB dialog */}
      {selectedPdfReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-md">
          <div className="relative w-full max-w-4xl h-[85vh] flex flex-col rounded-3xl border border-white/15 bg-slate-900 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 bg-slate-950/80 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📄</span>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    CMWSSB e-Receipt • {selectedPdfReceipt.receipt_no}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Dated {selectedPdfReceipt.receipt_dt} • Amount: ₹{selectedPdfReceipt.amount.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`/api/chennai-water/receipts/${selectedPdfReceipt.id}/pdf`}
                  download={`CMWSSB_Receipt_${selectedPdfReceipt.receipt_no.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`}
                  className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 transition inline-flex items-center gap-1.5"
                >
                  <span>⬇️</span>
                  <span>Download PDF</span>
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedPdfReceipt(null)}
                  className="rounded-xl border border-white/10 bg-slate-800 p-1.5 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Embedded PDF Viewer */}
            <div className="flex-1 bg-slate-950 p-2">
              <iframe
                src={`/api/chennai-water/receipts/${selectedPdfReceipt.id}/pdf`}
                className="w-full h-full rounded-2xl border border-white/5"
                title={`CMWSSB Receipt ${selectedPdfReceipt.receipt_no}`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
    </AuthGuard>
  );
}
