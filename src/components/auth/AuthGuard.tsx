"use client";

import React from "react";
import { useAuth } from "@/context/AuthContext";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { Shield, Lock } from "lucide-react";
import { DynamicIcon } from "@/components/ui/DynamicIcon";

interface AuthGuardProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  icon?: string | React.ReactNode;
  badge?: string;
}

export function AuthGuard({
  children,
  title,
  description = "This section contains sensitive personal and financial records. Sign in with your authorized Google account to view and manage it.",
  icon = "lock",
  badge = "Private & Protected",
}: AuthGuardProps) {
  const { isSignedIn, isLoading, signInWithGoogle } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <FinanceTopBar title={title} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center animate-pulse">
            <Shield className="w-6 h-6 text-cyan-400" />
          </div>
          <div className="h-3.5 w-48 rounded-full bg-white/10 animate-pulse" />
          <p className="text-xs text-slate-500 font-medium">Verifying security credentials...</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <FinanceTopBar title={title} />
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="max-w-md w-full rounded-3xl border border-white/15 bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 p-6 sm:p-8 text-center shadow-2xl backdrop-blur-xl space-y-6">
            <div className="h-16 w-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center shadow-inner">
              {typeof icon === "string" ? (
                <DynamicIcon icon={icon} className="w-8 h-8 text-rose-400" />
              ) : (
                icon || <Lock className="w-8 h-8 text-rose-400" />
              )}
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 px-3 py-0.5 text-[11px] font-bold text-rose-300">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                {badge}
              </span>
              <h2 className="text-xl font-black text-white tracking-tight mt-3">
                {title}
              </h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                {description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              className="w-full min-h-[46px] rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold text-sm shadow-xl hover:from-cyan-400 hover:to-blue-500 transition cursor-pointer flex items-center justify-center gap-2 active:scale-95"
            >
              <Lock className="w-4 h-4 text-slate-950" />
              <span>Sign in with Google</span>
            </button>
            <p className="text-[11px] text-slate-500">
              Only authenticated users can view, query, or modify these records.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
