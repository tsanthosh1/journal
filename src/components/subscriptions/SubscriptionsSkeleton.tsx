"use client";

import React from "react";

export function SubscriptionsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* 1. Action Hub Header Banner Shimmer */}
      <div className="rounded-3xl border border-white/5 bg-slate-900/60 p-5 sm:p-6 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-5 w-40 rounded-lg bg-slate-800/80" />
              <div className="h-4 w-16 rounded-full bg-slate-800/60" />
            </div>
            <div className="mt-2 h-3 w-72 rounded bg-slate-800/50" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-28 rounded-2xl bg-slate-800/60" />
            <div className="h-12 w-24 rounded-2xl bg-slate-800/60" />
          </div>
        </div>

        {/* Filter Tabs Shimmer */}
        <div className="mt-5 flex items-center gap-2 border-t border-white/5 pt-4">
          <div className="h-8 w-16 rounded-xl bg-slate-800/80" />
          <div className="h-8 w-32 rounded-xl bg-slate-800/60" />
          <div className="h-8 w-24 rounded-xl bg-slate-800/50" />
        </div>
      </div>

      {/* 2. Cards Shimmer List */}
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/50 p-4 sm:p-5 shadow-lg backdrop-blur-md"
          >
            <div className="flex items-start justify-between gap-3">
              {/* Left: Avatar + Title */}
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="h-11 w-11 shrink-0 rounded-xl bg-slate-800/80" />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-36 rounded bg-slate-800/90" />
                    <div className="h-4 w-16 rounded-md bg-slate-800/50" />
                  </div>
                  <div className="h-3 w-28 rounded bg-slate-800/60" />
                </div>
              </div>

              {/* Right: Amount */}
              <div className="space-y-1.5 text-right shrink-0">
                <div className="h-5 w-24 rounded bg-slate-800/90 ml-auto" />
                <div className="h-3 w-20 rounded bg-slate-800/50 ml-auto" />
              </div>
            </div>

            {/* Bottom Footer Shimmer */}
            <div className="mt-3.5 flex items-center justify-between border-t border-white/5 pt-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-20 rounded-full bg-slate-800/60" />
                <div className="h-3 w-28 rounded bg-slate-800/40" />
              </div>

              <div className="flex items-center gap-1.5">
                <div className="h-7 w-20 rounded-xl bg-slate-800/70" />
                <div className="h-7 w-7 rounded-lg bg-slate-800/50" />
                <div className="h-7 w-7 rounded-lg bg-slate-800/50" />
              </div>
            </div>

            {/* Shimmer sweep effect */}
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-[shimmer_2s_infinite]" />
          </div>
        ))}
      </div>

      {/* 3. Summary Cards Shimmer at Bottom */}
      <div className="pt-6 border-t border-white/5 space-y-4">
        <div className="h-4 w-44 rounded bg-slate-800/60" />
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/5 bg-slate-900/60 p-4.5 sm:p-6 shadow-xl backdrop-blur-md"
            >
              <div className="flex items-center justify-between">
                <div className="h-3 w-24 rounded bg-slate-800/80" />
                <div className="h-8 w-8 rounded-xl bg-slate-800/80" />
              </div>
              <div className="mt-3 h-7 w-32 rounded-lg bg-slate-800/90" />
              <div className="mt-2.5 flex items-center gap-2">
                <div className="h-3 w-16 rounded bg-slate-800/60" />
                <div className="h-3 w-20 rounded bg-slate-800/40" />
              </div>
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.04] to-transparent animate-[shimmer_2s_infinite]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
