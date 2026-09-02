"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export function FinanceTopBar({ title }: { title?: string }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { userEmail, isSignedIn, isGmailSynced, isLoading, signInWithGoogle, signOut } = useAuth();

  const navLinks = [
    { href: "/subscriptions", label: "Subscriptions & Bills", badge: "Sync" },
    { href: "/tneb", label: "EB Bills", badge: "TNEB" },
    { href: "/statements", label: "Statements" },
    { href: "/parsers", label: "Parsers", badge: "Labs" },
    { href: "/import", label: "Import" },
    { href: "/categories", label: "Categories" },
  ];

  const handleSignOutClick = async () => {
    if (confirm("Sign out of Google account?")) {
      await signOut();
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90 px-4 py-2.5 text-slate-100 backdrop-blur-md sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            className="flex items-center gap-2 font-bold tracking-tight text-white hover:text-cyan-300 transition"
            href="/"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 font-extrabold text-xs">
              ⚡
            </span>
            <span className="text-sm sm:text-base font-extrabold">Finance Hub</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1 text-xs font-medium">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition ${
                    isActive
                      ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/30"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span>{link.label}</span>
                  {link.badge && (
                    <span className="rounded-full bg-cyan-500/20 px-1.5 py-0.2 text-[9px] font-bold text-cyan-300">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side: Global Google Login status & Mobile Menu toggle */}
        <div className="flex items-center gap-2.5">
          {/* Global Google Login Widget */}
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
                      className="rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 px-1.5 py-0.5 text-[10px] text-indigo-300 font-medium transition cursor-pointer"
                      title="Click to re-authorize / refresh offline Google/Gmail token"
                    >
                      Gmail Sync ⚡
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void signInWithGoogle()}
                      className="rounded-md bg-amber-500/20 hover:bg-amber-500/30 px-1.5 py-0.5 text-[10px] text-amber-300 font-medium transition cursor-pointer"
                      title="Click to connect Gmail Sync"
                    >
                      Link Gmail ⚠️
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
                  Sign in with Google
                </button>
              )}
            </div>
          )}

          {title && (
            <div className="hidden lg:block text-xs text-slate-400 border-l border-white/10 pl-3">
              <span className="font-semibold text-slate-200">{title}</span>
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
        <div className="md:hidden mt-3 pt-3 border-t border-white/10 space-y-2">
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

          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span>{link.label}</span>
                {link.badge && (
                  <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
