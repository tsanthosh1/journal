"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  Zap,
  AlertTriangle,
  ChevronDown,
  ShoppingBag,
  Cloud,
  Building2,
  Droplets,
  FileText,
  Code2,
  Upload,
  Tags,
  Activity,
  Calendar,
  Layers,
  Wrench,
  UtensilsCrossed,
} from "lucide-react";

interface DropdownItem {
  href: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

export function FinanceTopBar({ title }: { title?: string }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<"trackers" | "tools" | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { userEmail, isSignedIn, isGmailSynced, isLoading, signInWithGoogle, signOut } = useAuth();

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  // Primary top-level navigation links
  const primaryLinks = [
    { href: "/subscriptions", label: "Subscriptions & Bills", icon: Layers },
    { href: "/food-calendar", label: "Food Calendar", icon: Calendar },
    { href: "/timeline", label: "Life Timeline", icon: Activity },
  ];

  // Specialized tracker modules
  const trackerItems: DropdownItem[] = [
    {
      href: "/swiggy",
      label: "Swiggy Food",
      description: "Restaurant meals & deliveries",
      icon: UtensilsCrossed,
    },
    {
      href: "/instamart",
      label: "Instamart",
      description: "Groceries & delivery orders",
      icon: ShoppingBag,
    },
    {
      href: "/cloud-billing",
      label: "Cloud Billing",
      description: "GCP & BigQuery billing",
      icon: Cloud,
    },
    {
      href: "/tneb",
      label: "EB Bills",
      description: "TNEB electricity charges",
      icon: Zap,
    },
    {
      href: "/apartment",
      label: "Apartment",
      description: "Maintenance dues & flat water",
      icon: Building2,
    },
    {
      href: "/chennai-water",
      label: "Metro Water",
      description: "CMWSSB water tax & supply",
      icon: Droplets,
    },
  ];

  // Data & Management Tools
  const toolItems: DropdownItem[] = [
    {
      href: "/statements",
      label: "Statements",
      description: "Bank & credit card accounts",
      icon: FileText,
    },
    {
      href: "/parsers",
      label: "Parsers",
      description: "Sandbox & email parser modules",
      icon: Code2,
    },
    {
      href: "/import",
      label: "Import",
      description: "Upload CSV & statements",
      icon: Upload,
    },
    {
      href: "/categories",
      label: "Categories",
      description: "Rules & classification engine",
      icon: Tags,
    },
    {
      href: "/sync/logs",
      label: "Sync Logs",
      description: "Background worker audit trail",
      icon: Activity,
    },
  ];

  const isTrackerActive = trackerItems.some((item) => pathname === item.href);
  const activeTracker = trackerItems.find((item) => pathname === item.href);

  const isToolActive = toolItems.some((item) => pathname === item.href);
  const activeTool = toolItems.find((item) => pathname === item.href);

  const handleSignOutClick = async () => {
    if (confirm("Sign out of Google account?")) {
      await signOut();
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90 px-4 py-2.5 text-slate-100 backdrop-blur-md sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-6" ref={dropdownRef}>
          {/* Brand Logo */}
          <Link
            className="flex items-center gap-2 font-bold tracking-tight text-white hover:text-cyan-300 transition shrink-0"
            href="/"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 font-extrabold text-xs">
              <Zap className="w-4 h-4 text-cyan-400" />
            </span>
            <span className="text-sm sm:text-base font-extrabold">Finance Hub</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 text-xs font-medium">
            {/* Primary Links */}
            {primaryLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition ${
                    isActive
                      ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-semibold"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span>{link.label}</span>
                </Link>
              );
            })}

            {/* Trackers Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveDropdown(activeDropdown === "trackers" ? null : "trackers");
                }}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition cursor-pointer ${
                  isTrackerActive
                    ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold"
                    : activeDropdown === "trackers"
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span>
                  {isTrackerActive && activeTracker ? `Trackers: ${activeTracker.label}` : "Trackers"}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    activeDropdown === "trackers" ? "rotate-180" : ""
                  }`}
                />
              </button>

              {activeDropdown === "trackers" && (
                <div className="absolute left-0 mt-2 w-72 rounded-2xl border border-white/15 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-1">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Specialized Utility Trackers
                  </div>
                  {trackerItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setActiveDropdown(null)}
                        className={`flex items-start gap-3 rounded-xl p-2.5 transition ${
                          isActive
                            ? "bg-cyan-500/15 border border-cyan-500/30 text-cyan-300"
                            : "hover:bg-white/5 text-slate-200 hover:text-white"
                        }`}
                      >
                        <div
                          className={`mt-0.5 rounded-lg p-1.5 ${
                            isActive
                              ? "bg-cyan-500/20 text-cyan-300"
                              : "bg-white/5 text-slate-400"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold leading-none">
                            {item.label}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1 leading-tight">
                            {item.description}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tools Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveDropdown(activeDropdown === "tools" ? null : "tools");
                }}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition cursor-pointer ${
                  isToolActive
                    ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold"
                    : activeDropdown === "tools"
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span>
                  {isToolActive && activeTool ? `Tools: ${activeTool.label}` : "Tools"}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    activeDropdown === "tools" ? "rotate-180" : ""
                  }`}
                />
              </button>

              {activeDropdown === "tools" && (
                <div className="absolute left-0 mt-2 w-72 rounded-2xl border border-white/15 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-1">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Data & Pipeline Tools
                  </div>
                  {toolItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setActiveDropdown(null)}
                        className={`flex items-start gap-3 rounded-xl p-2.5 transition ${
                          isActive
                            ? "bg-cyan-500/15 border border-cyan-500/30 text-cyan-300"
                            : "hover:bg-white/5 text-slate-200 hover:text-white"
                        }`}
                      >
                        <div
                          className={`mt-0.5 rounded-lg p-1.5 ${
                            isActive
                              ? "bg-cyan-500/20 text-cyan-300"
                              : "bg-white/5 text-slate-400"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold leading-none">
                            {item.label}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1 leading-tight">
                            {item.description}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Right side: Global Google Login widget & Mobile Hamburger */}
        <div className="flex items-center gap-2.5 shrink-0">
          {!isLoading && (
            <div className="hidden sm:flex items-center">
              {isSignedIn ? (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="max-w-[170px] truncate font-medium" title={userEmail || "Connected"}>
                    {userEmail || "Connected"}
                  </span>
                  {isGmailSynced ? (
                    <button
                      type="button"
                      onClick={() => void signInWithGoogle()}
                      className="inline-flex items-center gap-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 px-1.5 py-0.5 text-[10px] text-indigo-300 font-medium transition cursor-pointer"
                      title="Click to re-authorize / refresh offline Google/Gmail token"
                    >
                      <span>Gmail Sync</span>
                      <Zap className="w-2.5 h-2.5 text-indigo-300" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void signInWithGoogle()}
                      className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 px-1.5 py-0.5 text-[10px] text-amber-300 font-medium transition cursor-pointer"
                      title="Click to connect Gmail Sync"
                    >
                      <span>Link Gmail</span>
                      <AlertTriangle className="w-2.5 h-2.5 text-amber-300" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSignOutClick}
                    className="ml-1 text-[11px] text-slate-400 hover:text-rose-400 underline cursor-pointer"
                    title="Sign out of Google"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 px-3 py-1.5 text-xs font-semibold text-white border border-white/10 transition active:scale-95 cursor-pointer"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.24 10.285V13.8h6.887C18.2 16.5 15.64 18.5 12.24 18.5c-3.6 0-6.5-2.9-6.5-6.5s2.9-6.5 6.5-6.5c1.64 0 3.12.61 4.28 1.62l2.67-2.67C17.5 2.8 15.04 2 12.24 2 6.7 2 2.2 6.5 2.2 12s4.5 10 10.04 10c5.78 0 9.6-4.06 9.6-9.78 0-.66-.07-1.3-.2-1.935H12.24z" />
                  </svg>
                  <span>Sign in</span>
                </button>
              )}
            </div>
          )}

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex md:hidden items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10 hover:text-white"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-3 pt-3 border-t border-white/10 space-y-4 max-h-[80vh] overflow-y-auto pb-4">
          {/* Mobile Google Auth Bar */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 flex items-center justify-between">
            {isSignedIn ? (
              <div className="flex items-center justify-between w-full text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="font-medium text-emerald-300 truncate max-w-[180px]">
                    {userEmail || "Connected"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSignOutClick}
                  className="text-slate-400 hover:text-rose-400 underline text-[11px] cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="w-full flex items-center justify-center gap-2 py-1.5 text-xs font-semibold text-cyan-300 cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.24 10.285V13.8h6.887C18.2 16.5 15.64 18.5 12.24 18.5c-3.6 0-6.5-2.9-6.5-6.5s2.9-6.5 6.5-6.5c1.64 0 3.12.61 4.28 1.62l2.67-2.67C17.5 2.8 15.04 2 12.24 2 6.7 2 2.2 6.5 2.2 12s4.5 10 10.04 10c5.78 0 9.6-4.06 9.6-9.78 0-.66-.07-1.3-.2-1.935H12.24z" />
                </svg>
                Sign in with Google
              </button>
            )}
          </div>

          {/* Core Hub */}
          <div>
            <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Core Hubs
            </div>
            <div className="space-y-1">
              {primaryLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between rounded-xl px-3.5 py-2 text-xs font-medium transition ${
                      isActive
                        ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/30"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Trackers */}
          <div>
            <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Specialized Trackers
            </div>
            <div className="space-y-1">
              {trackerItems.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-medium transition ${
                      isActive
                        ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/30"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Tools */}
          <div>
            <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Data & Tools
            </div>
            <div className="space-y-1">
              {toolItems.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-medium transition ${
                      isActive
                        ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/30"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
