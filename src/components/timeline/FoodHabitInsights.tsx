"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authFetch";
import {
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Home,
  Bike,
  Utensils,
  Lightbulb,
  Heart,
  TrendingUp,
  Flame,
  ShieldCheck,
} from "lucide-react";

export interface FoodHabitSuggestion {
  title: string;
  description: string;
  category: "Timing" | "Nutrition" | "Snacking" | "Dining Source";
  impact: "High" | "Medium" | "Low";
}

export interface FoodHabitMetrics {
  totalEvents: number;
  mainMealsCount: number;
  snacksCount: number;
  anchorsCount: {
    breakfast: number;
    lunch: number;
    dinner: number;
    snacks: number;
  };
  sourcesCount: {
    homeCooked: number;
    onlineDelivery: number;
    hotelRestaurant: number;
    takeaway: number;
    other: number;
  };
  sourcesPercentage: {
    homeCooked: number;
    onlineDelivery: number;
    diningOut: number;
  };
  averageTimes: {
    breakfast: string | null;
    lunch: string | null;
    dinner: string | null;
  };
  lateDinnersCount: number;
  lateNightSnacksCount: number;
  topFoodItems: Array<{ name: string; count: number }>;
  uniqueDaysLogged: number;
  averageMealsPerDay: number;
}

export interface FoodHabitInsightsResponse {
  timeframe: {
    startDate: string;
    endDate: string;
    daysCount: number;
  };
  metrics: FoodHabitMetrics;
  insights: {
    habitScore: number;
    habitRating: "Excellent" | "Good" | "Fair" | "Needs Attention";
    summary: string;
    feedbackNarrative: string;
    strengths: string[];
    areasOfConcern: string[];
    suggestions: FoodHabitSuggestion[];
  };
  generatedAt: string;
}

interface FoodHabitInsightsProps {
  lookbackDays?: number;
  isOpen?: boolean;
  onToggleOpen?: () => void;
}

export function FoodHabitInsights({
  lookbackDays = 14,
  isOpen: controlledIsOpen,
  onToggleOpen,
}: FoodHabitInsightsProps) {
  const { user, userId, isSignedIn } = useAuth();
  const [data, setData] = useState<FoodHabitInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpandedInternal, setIsExpandedInternal] = useState(true);
  const [activeTab, setActiveTab] = useState<"suggestions" | "feedback" | "strengths">("suggestions");

  const isExpanded = controlledIsOpen !== undefined ? controlledIsOpen : isExpandedInternal;
  const toggleExpanded = onToggleOpen || (() => setIsExpandedInternal((prev) => !prev));

  const fetchInsights = useCallback(async (isRefresh = false) => {
    if (!isSignedIn) return;
    setIsLoading(true);
    setError(null);

    try {
      const qUserId = user?.email || user?.uid || userId || "";
      const res = await authFetch(user, "/api/timeline/food/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lookbackDays,
          userId: qUserId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load habit insights");
      }

      const result = await res.json();
      setData(result);
    } catch (err: any) {
      console.error("[FoodHabitInsights] Fetch error:", err);
      setError(err.message || "Could not retrieve habit insights");
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, user, userId, lookbackDays]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  if (!isSignedIn) return null;

  const score = data?.insights.habitScore ?? 75;
  const rating = data?.insights.habitRating ?? "Good";

  const getScoreColor = (sc: number) => {
    if (sc >= 85) return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
    if (sc >= 70) return "text-amber-400 border-amber-500/40 bg-amber-500/10";
    return "text-rose-400 border-rose-500/40 bg-rose-500/10";
  };

  const getCategoryBadge = (cat: FoodHabitSuggestion["category"]) => {
    switch (cat) {
      case "Timing":
        return "bg-purple-500/20 text-purple-300 border-purple-500/30";
      case "Dining Source":
        return "bg-orange-500/20 text-orange-300 border-orange-500/30";
      case "Snacking":
        return "bg-amber-500/20 text-amber-300 border-amber-500/30";
      default:
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-amber-950/20 shadow-2xl backdrop-blur-xl transition-all duration-300">
      {/* Top Ambient Glow Accent */}
      <div className="absolute -top-16 -right-16 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 shadow-md shadow-amber-500/20">
            <Sparkles className="h-5 w-5 fill-current stroke-[1.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                AI Food Habit Suggestions & Feedback
              </h2>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                <span>Recent {data?.timeframe.daysCount || lookbackDays} Days</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 line-clamp-1">
              Personalized nutritionist critique based on your logged eating patterns, sources, and timing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {data && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-bold ${getScoreColor(score)}`}>
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Habit Score: {score}/100</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => fetchInsights(true)}
            disabled={isLoading}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-slate-950/70 text-slate-300 hover:text-white hover:bg-white/10 transition active:scale-95 cursor-pointer disabled:opacity-50"
            title="Re-analyze food habits"
            aria-label="Re-analyze food habits"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-amber-400" : ""}`} />
          </button>

          <button
            type="button"
            onClick={toggleExpanded}
            className="flex items-center gap-1 h-8 px-2.5 rounded-xl border border-white/10 bg-slate-950/70 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title={isExpanded ? "Collapse Insights" : "Expand Insights"}
          >
            <span>{isExpanded ? "Minimize" : "View"}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Collapsed Compact Preview */}
      {!isExpanded && data && (
        <div className="px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 bg-slate-950/30">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 font-medium">
              <Home className="w-3.5 h-3.5 text-emerald-400" />
              <span>{data.metrics.sourcesPercentage.homeCooked}% Home Cooked</span>
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <Bike className="w-3.5 h-3.5 text-orange-400" />
              <span>{data.metrics.sourcesPercentage.onlineDelivery}% Delivery</span>
            </span>
            {data.metrics.averageTimes.dinner && (
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span>Avg Dinner: {data.metrics.averageTimes.dinner}</span>
              </span>
            )}
          </div>
          <div className="text-slate-400 italic text-[11px] truncate max-w-md">
            &ldquo;{data.insights.summary}&rdquo;
          </div>
        </div>
      )}

      {/* Expanded Main Panel */}
      {isExpanded && (
        <div className="p-4 sm:p-6 space-y-6">
          {/* Loading State */}
          {isLoading && !data && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
              <RefreshCw className="w-7 h-7 text-amber-400 animate-spin" />
              <p className="text-xs font-medium text-slate-300">Evaluating recent meal logs and generating habit suggestions...</p>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="flex items-center gap-2 rounded-2xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {data && (
            <>
              {/* Stat Metric Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. Habit Health Score */}
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                    <span>Habit Health</span>
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl sm:text-2xl font-black text-white">{score}</span>
                    <span className="text-xs text-slate-500">/ 100</span>
                  </div>
                  <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                    {rating} Habit
                  </div>
                </div>

                {/* 2. Home Cooked Ratio */}
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                    <span>Home vs Delivery</span>
                    <Home className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl sm:text-2xl font-black text-emerald-400">
                      {data.metrics.sourcesPercentage.homeCooked}%
                    </span>
                    <span className="text-xs text-slate-400">Home</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden flex">
                    <div
                      className="bg-emerald-400 h-full rounded-full transition-all"
                      style={{ width: `${data.metrics.sourcesPercentage.homeCooked}%` }}
                      title={`Home Cooked: ${data.metrics.sourcesPercentage.homeCooked}%`}
                    />
                    <div
                      className="bg-orange-500 h-full transition-all"
                      style={{ width: `${data.metrics.sourcesPercentage.onlineDelivery}%` }}
                      title={`Online Delivery: ${data.metrics.sourcesPercentage.onlineDelivery}%`}
                    />
                  </div>
                </div>

                {/* 3. Average Meal Times */}
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                    <span>Average Dinner</span>
                    <Clock className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="text-sm sm:text-base font-bold text-white truncate">
                    {data.metrics.averageTimes.dinner || "Not set"}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {data.metrics.lateDinnersCount > 0 ? (
                      <span className="text-amber-400 font-medium">
                        {data.metrics.lateDinnersCount} late dinners (&gt;9 PM)
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-medium">Steady schedule</span>
                    )}
                  </div>
                </div>

                {/* 4. Logs & Frequency */}
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                    <span>Log Consistency</span>
                    <Utensils className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl sm:text-2xl font-black text-white">
                      {data.metrics.totalEvents}
                    </span>
                    <span className="text-xs text-slate-400">entries</span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    ~{data.metrics.averageMealsPerDay} meals logged/day
                  </div>
                </div>
              </div>

              {/* Executive Summary Card */}
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4 text-xs sm:text-sm text-slate-200 leading-relaxed flex items-start gap-3 shadow-inner">
                <Lightbulb className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-amber-300 mr-1.5">AI Summary:</span>
                  <span>{data.insights.summary}</span>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("suggestions")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    activeTab === "suggestions"
                      ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>AI Suggestions ({data.insights.suggestions.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("feedback")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    activeTab === "feedback"
                      ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Heart className="w-3.5 h-3.5" />
                  <span>Habit Feedback</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("strengths")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    activeTab === "strengths"
                      ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Strengths ({data.insights.strengths.length})</span>
                </button>
              </div>

              {/* Tab 1: AI Suggestions */}
              {activeTab === "suggestions" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data.insights.suggestions.map((sug, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 space-y-2 hover:border-amber-500/30 transition shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getCategoryBadge(
                            sug.category
                          )}`}
                        >
                          {sug.category}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            sug.impact === "High"
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {sug.impact} Impact
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white leading-snug">{sug.title}</h4>
                      <p className="text-xs text-slate-300 leading-relaxed">{sug.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 2: Detailed Feedback Narrative */}
              {activeTab === "feedback" && (
                <div className="space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed bg-slate-950/40 p-4 rounded-2xl border border-white/5">
                  <div className="whitespace-pre-line">{data.insights.feedbackNarrative}</div>

                  {data.insights.areasOfConcern.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                      <div className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Noted Watchouts</span>
                      </div>
                      <ul className="space-y-1.5">
                        {data.insights.areasOfConcern.map((area, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                            <span className="text-amber-400 mt-0.5">•</span>
                            <span>{area}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Strengths & Highlights */}
              {activeTab === "strengths" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {data.insights.strengths.map((str, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/20 text-xs text-emerald-200"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{str}</span>
                      </div>
                    ))}
                  </div>

                  {/* Frequent Logged Foods */}
                  {data.metrics.topFoodItems.length > 0 && (
                    <div className="mt-4 p-3.5 rounded-2xl bg-slate-950/50 border border-white/5 space-y-2">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Most Frequent Food Items
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {data.metrics.topFoodItems.map((item, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-[11px] bg-slate-800/80 border border-white/10 px-2.5 py-1 rounded-xl text-slate-200 font-medium"
                          >
                            <span>{item.name}</span>
                            <span className="text-amber-400 font-bold text-[10px]">({item.count})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
