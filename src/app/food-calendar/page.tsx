"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import { LifeEvent, FoodPrimaryAnchor } from "@/lib/timeline/types";
import { authFetch } from "@/lib/authFetch";
import {
  Utensils,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Flame,
  Clock,
  Trash2,
  Edit2,
  Calendar,
  LayoutList,
  Coffee,
  Sun,
  Moon,
  Loader2,
  X,
  CheckCircle2,
} from "lucide-react";

const PRIMARY_ANCHORS: {
  anchor: FoodPrimaryAnchor;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  badgeBg: string;
  badgeBorder: string;
}[] = [
  {
    anchor: "Breakfast",
    title: "Breakfast Anchor",
    subtitle: "Breakfast & Morning Snacks",
    icon: Sun,
    color: "text-amber-400",
    badgeBg: "bg-amber-500/10",
    badgeBorder: "border-amber-500/30",
  },
  {
    anchor: "Lunch",
    title: "Lunch Anchor",
    subtitle: "Lunch / Brunch & Afternoon Snacks",
    icon: Utensils,
    color: "text-emerald-400",
    badgeBg: "bg-emerald-500/10",
    badgeBorder: "border-emerald-500/30",
  },
  {
    anchor: "Dinner",
    title: "Dinner Anchor",
    subtitle: "Dinner / Supper & Evening / Late Snacks",
    icon: Moon,
    color: "text-indigo-400",
    badgeBg: "bg-indigo-500/10",
    badgeBorder: "border-indigo-500/30",
  },
];

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // Monday is 1st day of week in ISO
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function FoodCalendarPage() {
  const { user, userId, isSignedIn } = useAuth();

  // Current week start (Monday)
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getStartOfWeek(new Date()));
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cell Action Modal state
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [actionTargetDate, setActionTargetDate] = useState<string>("");
  const [actionTargetAnchor, setActionTargetAnchor] = useState<FoodPrimaryAnchor>("Breakfast");
  const [actionExistingEvent, setActionExistingEvent] = useState<LifeEvent | null>(null);
  const [actionPrompt, setActionPrompt] = useState("");
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Generate 7 days of the active week
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      const iso = formatDateIso(d);
      const isToday = iso === formatDateIso(new Date());
      const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
      const dayNum = d.getDate();
      const monthShort = d.toLocaleDateString("en-US", { month: "short" });
      return { date: d, iso, isToday, dayName, dayNum, monthShort };
    });
  }, [currentWeekStart]);

  const startDateIso = weekDays[0].iso;
  const endDateIso = weekDays[6].iso;

  const fetchWeekEvents = useCallback(async () => {
    if (!isSignedIn) {
      setEvents([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const qUserId = user?.email || user?.uid || userId || "";
      const res = await authFetch(
        user,
        `/api/timeline/events?startDate=${startDateIso}&endDate=${endDateIso}&userId=${encodeURIComponent(qUserId)}`
      );
      if (!res.ok) {
        throw new Error("Failed to load food events for this week");
      }
      const data = await res.json();
      const foodEvents = (data.events || []).filter(
        (ev: LifeEvent) => ev.activityType === "FOOD"
      );
      setEvents(foodEvents);
    } catch (err: any) {
      setError(err.message || "Failed to load events");
    } finally {
      setIsLoading(false);
    }
  }, [startDateIso, endDateIso, isSignedIn, user, userId]);

  useEffect(() => {
    fetchWeekEvents();
  }, [fetchWeekEvents]);

  // Navigate Weeks
  const handleShiftWeek = (weeks: number) => {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() + weeks * 7);
    setCurrentWeekStart(next);
  };

  const handleResetToCurrentWeek = () => {
    setCurrentWeekStart(getStartOfWeek(new Date()));
  };

  const isCurrentWeek = useMemo(() => {
    return formatDateIso(currentWeekStart) === formatDateIso(getStartOfWeek(new Date()));
  }, [currentWeekStart]);

  // Group events by Date and Primary Anchor
  const foodEventsMatrix = useMemo(() => {
    const map: Record<string, Record<FoodPrimaryAnchor, LifeEvent[]>> = {};

    for (const d of weekDays) {
      map[d.iso] = {
        Breakfast: [],
        Lunch: [],
        Dinner: [],
      };
    }

    for (const ev of events) {
      if (!map[ev.date]) continue;

      let anchor: FoodPrimaryAnchor = "Breakfast";
      const rawAnchor = ev.attributes?.primaryAnchor;
      const rawMealType = (ev.attributes?.mealType || ev.title || "").toLowerCase();
      const rawOccasion = (ev.attributes?.occasion || "").toLowerCase();

      if (rawAnchor === "Breakfast" || rawAnchor === "Lunch" || rawAnchor === "Dinner") {
        anchor = rawAnchor;
      } else if (rawMealType.includes("lunch") || rawOccasion.includes("lunch") || rawOccasion.includes("brunch")) {
        anchor = "Lunch";
      } else if (rawMealType.includes("dinner") || rawMealType.includes("supper") || rawOccasion.includes("dinner") || rawOccasion.includes("supper") || rawOccasion.includes("late-night")) {
        anchor = "Dinner";
      } else if (ev.startTime) {
        const h = parseInt(ev.startTime.split(":")[0], 10);
        if (h >= 11 && h < 16) anchor = "Lunch";
        else if (h >= 16) anchor = "Dinner";
        else anchor = "Breakfast";
      }

      map[ev.date][anchor].push(ev);
    }

    return map;
  }, [weekDays, events]);

  // Open prompt modal for adding or editing
  const handleOpenCellAction = (
    dateIso: string,
    anchor: FoodPrimaryAnchor,
    existingEvent?: LifeEvent
  ) => {
    setActionTargetDate(dateIso);
    setActionTargetAnchor(anchor);
    setActionExistingEvent(existingEvent || null);
    setActionPrompt("");
    setActionSuccessMsg(null);
    setIsActionModalOpen(true);
  };

  // Submit AI Cell Action
  const handleSubmitCellAction = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!actionPrompt.trim()) return;

    setIsSubmittingAction(true);
    setActionSuccessMsg(null);

    try {
      const qUserId = user?.email || user?.uid || userId || "";
      const res = await authFetch(user, "/api/timeline/food/cell-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: actionTargetDate,
          primaryAnchor: actionTargetAnchor,
          prompt: actionPrompt.trim(),
          existingEventId: actionExistingEvent?.id,
          userId: qUserId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to process meal action");
      }

      const data = await res.json();
      setActionSuccessMsg(data.changeSummary || "Updated successfully!");
      await fetchWeekEvents();

      // Close modal smoothly after brief feedback
      setTimeout(() => {
        setIsActionModalOpen(false);
        setActionSuccessMsg(null);
        setActionPrompt("");
      }, 700);
    } catch (err: any) {
      alert(err.message || "Failed to complete action");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Quick prompt presets
  const promptPresets = actionExistingEvent
    ? [
        "Delete this meal entry",
        "Replace with protein shake & banana",
        "Also had a cup of black coffee",
        "Ate outside at a restaurant",
      ]
    : [
        "2 Dosas with coconut chutney and sambar",
        "Bowl of oats with milk, blueberries and almonds",
        "Grilled chicken salad with olive oil",
        "Rice, dal, stir-fried vegetables and curd",
        "Filter coffee with 2 biscuits",
      ];

  return (
    <AuthGuard
      title="Weekly Food Calendar"
      description="View and log your meals and snacks in a weekly calendar view structured around your daily meal anchors."
      icon="utensils"
      badge="Private & Encrypted"
    >
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <FinanceTopBar title="Food Calendar" />

        <main className="mx-auto flex-1 w-full max-w-7xl px-3 sm:px-6 py-6 pb-28 sm:pb-12 space-y-6">
          {/* Top Control & Navigation */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-amber-950/20 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
            <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              {/* Header Title & Tab Switcher */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 font-bold text-sm">
                    <Utensils className="w-4 h-4 text-amber-300" />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-[0.25em] text-amber-400">
                    Nutrition & Meals
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    Food Calendar
                  </h1>

                  {/* Switcher Tabs */}
                  <div className="inline-flex rounded-xl bg-slate-900/90 p-1 border border-white/10 text-xs font-semibold">
                    <Link
                      href="/timeline"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition"
                    >
                      <LayoutList className="w-3.5 h-3.5" />
                      <span>Daily Timeline</span>
                    </Link>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Food Calendar</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-400">
                  Weekly overview structured by daily meal anchors (Breakfast, Lunch, Dinner & Snacks).
                  Click any cell to create, update, or remove entries with AI.
                </p>
              </div>

              {/* Week Switcher */}
              <div className="flex flex-col items-start sm:items-end gap-1.5">
                <div className="inline-flex items-center rounded-2xl border border-white/10 bg-slate-950/70 p-1 shadow-sm backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={() => handleShiftWeek(-1)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition active:scale-95 cursor-pointer"
                    title="Previous Week"
                    aria-label="Previous Week"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="px-3 text-xs font-semibold text-slate-200">
                    {weekDays[0].monthShort} {weekDays[0].dayNum} – {weekDays[6].monthShort} {weekDays[6].dayNum}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleShiftWeek(1)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition active:scale-95 cursor-pointer"
                    title="Next Week"
                    aria-label="Next Week"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleResetToCurrentWeek}
                  disabled={isCurrentWeek}
                  className={`text-[11px] transition cursor-pointer flex items-center gap-1 ${
                    isCurrentWeek
                      ? "text-slate-500 cursor-default"
                      : "text-amber-400 hover:text-amber-300 hover:underline font-medium"
                  }`}
                >
                  <span>This Week</span>
                  {isCurrentWeek && <span className="text-[10px] text-slate-600">• current</span>}
                </button>
              </div>
            </div>
          </div>

          {/* Weekly Calendar Grid */}
          <div className="rounded-3xl border border-white/10 bg-slate-900/60 shadow-2xl backdrop-blur-md overflow-hidden">
            {/* Day Header Row */}
            <div className="grid grid-cols-7 border-b border-white/10 bg-slate-950/80">
              {weekDays.map((day) => (
                <div
                  key={day.iso}
                  className={`p-3 text-center border-r last:border-r-0 border-white/5 transition ${
                    day.isToday ? "bg-amber-500/10" : ""
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {day.dayName}
                  </div>
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    <span
                      className={`text-base sm:text-lg font-black ${
                        day.isToday
                          ? "text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/40"
                          : "text-white"
                      }`}
                    >
                      {day.dayNum}
                    </span>
                    <span className="text-[10px] text-slate-500">{day.monthShort}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Anchor Rows (Breakfast, Lunch, Dinner) */}
            <div className="divide-y divide-white/10">
              {PRIMARY_ANCHORS.map((anchorSpec) => {
                const IconComponent = anchorSpec.icon;

                return (
                  <div key={anchorSpec.anchor} className="flex flex-col">
                    {/* Anchor Row Banner */}
                    <div className="px-4 py-2.5 bg-slate-950/60 border-b border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <IconComponent className={`w-4 h-4 ${anchorSpec.color}`} />
                        <span className="text-xs font-bold text-white tracking-wide">
                          {anchorSpec.title}
                        </span>
                        <span className="text-[10px] text-slate-400 hidden sm:inline">
                          — {anchorSpec.subtitle}
                        </span>
                      </div>
                    </div>

                    {/* 7 Columns for this Anchor */}
                    <div className="grid grid-cols-7 divide-x divide-white/5 min-h-[140px]">
                      {weekDays.map((day) => {
                        const cellEvents = foodEventsMatrix[day.iso]?.[anchorSpec.anchor] || [];

                        return (
                          <div
                            key={day.iso + anchorSpec.anchor}
                            className={`p-2 flex flex-col justify-between group/cell hover:bg-white/[0.02] transition relative ${
                              day.isToday ? "bg-amber-500/[0.02]" : ""
                            }`}
                          >
                            {/* Cell Content: Event Cards */}
                            <div className="space-y-2 flex-1">
                              {cellEvents.map((ev) => {
                                const isSnack = ev.attributes?.occasionType === "Snack";
                                const foodItems = ev.attributes?.foodItems as string[] | undefined;
                                const calories = ev.attributes?.caloriesEst;

                                return (
                                  <div
                                    key={ev.id}
                                    onClick={() => handleOpenCellAction(day.iso, anchorSpec.anchor, ev)}
                                    className={`group/card relative rounded-xl border p-2.5 transition-all duration-200 cursor-pointer hover:scale-[1.02] hover:shadow-lg ${
                                      isSnack
                                        ? "bg-slate-950/70 border-white/10 hover:border-amber-500/40"
                                        : `${anchorSpec.badgeBg} ${anchorSpec.badgeBorder} hover:border-amber-400/60`
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-1">
                                      <span
                                        className={`text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-md ${
                                          isSnack
                                            ? "bg-slate-800 text-slate-300 border border-white/5"
                                            : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                        }`}
                                      >
                                        {ev.attributes?.occasion || (isSnack ? "Snack" : "Meal")}
                                      </span>

                                      {ev.startTime && (
                                        <span className="flex items-center gap-0.5 text-[9px] text-slate-400 font-mono">
                                          <Clock className="w-2.5 h-2.5" />
                                          {ev.startTime}
                                        </span>
                                      )}
                                    </div>

                                    {/* Food Title */}
                                    <div className="text-xs font-bold text-white mt-1.5 line-clamp-2 leading-tight">
                                      {ev.title}
                                    </div>

                                    {/* Food Items Pill List */}
                                    {foodItems && foodItems.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {foodItems.slice(0, 3).map((item, idx) => (
                                          <span
                                            key={idx}
                                            className="text-[9px] font-medium bg-black/40 text-slate-300 px-1.5 py-0.5 rounded border border-white/5 truncate max-w-[90px]"
                                          >
                                            {item}
                                          </span>
                                        ))}
                                        {foodItems.length > 3 && (
                                          <span className="text-[9px] text-slate-500">
                                            +{foodItems.length - 3}
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {/* Calories badge */}
                                    {calories && (
                                      <div className="flex items-center gap-1 mt-1.5 text-[10px] font-medium text-amber-400">
                                        <Flame className="w-3 h-3" />
                                        <span>{calories} kcal</span>
                                      </div>
                                    )}

                                    {/* Hover Edit Icon */}
                                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover/card:opacity-100 transition-opacity bg-slate-900/90 rounded-md p-1 text-slate-300 hover:text-white">
                                      <Edit2 className="w-2.5 h-2.5" />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Add Meal / Snack Cell Action Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenCellAction(day.iso, anchorSpec.anchor)}
                              className="mt-2 w-full py-1.5 px-2 rounded-lg border border-dashed border-white/10 text-slate-400 hover:text-white hover:border-amber-400/40 hover:bg-amber-500/10 transition-all flex items-center justify-center gap-1 text-[10px] font-semibold cursor-pointer opacity-60 group-hover/cell:opacity-100"
                              title={`Log ${anchorSpec.anchor} entry`}
                            >
                              <Plus className="w-3 h-3" />
                              <span className="hidden sm:inline">Add</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        {/* Interactive AI Cell Action Modal */}
        {isActionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-lg rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl space-y-4">
              {/* Modal Header */}
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
                      <Sparkles className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
                      AI Food Assistant
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    {actionExistingEvent ? "Update or Delete Meal" : `Log ${actionTargetAnchor}`}
                  </h3>
                  <div className="text-xs text-slate-400">
                    Target: <span className="font-semibold text-slate-200">{actionTargetDate}</span> •{" "}
                    <span className="font-semibold text-slate-200">{actionTargetAnchor} Anchor</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsActionModalOpen(false)}
                  disabled={isSubmittingAction}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Existing event snippet if modifying */}
              {actionExistingEvent && (
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Current Entry:
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {actionExistingEvent.title}
                  </div>
                  {actionExistingEvent.description && (
                    <div className="text-xs text-slate-400 line-clamp-2">
                      {actionExistingEvent.description}
                    </div>
                  )}
                </div>
              )}

              {/* Form Input */}
              <form onSubmit={handleSubmitCellAction} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="ai-food-prompt" className="text-xs font-semibold text-slate-300">
                    {actionExistingEvent
                      ? "Tell AI what to update or type 'delete' to remove:"
                      : "What did you eat or drink?"}
                  </label>
                  <div className="relative">
                    <input
                      id="ai-food-prompt"
                      type="text"
                      value={actionPrompt}
                      onChange={(e) => setActionPrompt(e.target.value)}
                      placeholder={
                        actionExistingEvent
                          ? "e.g., 'Change to oatmeal with walnuts' or 'delete this'"
                          : "e.g., 2 dosas with sambar and filter coffee"
                      }
                      autoFocus
                      disabled={isSubmittingAction}
                      className="w-full rounded-2xl border border-white/15 bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Quick Suggestions:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {promptPresets.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActionPrompt(preset)}
                        disabled={isSubmittingAction}
                        className="text-xs font-medium rounded-xl border border-white/10 bg-slate-950/60 px-2.5 py-1 text-slate-300 hover:text-white hover:border-amber-500/40 hover:bg-amber-500/10 transition active:scale-95 text-left"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Success Feedback */}
                {actionSuccessMsg && (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-xs text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{actionSuccessMsg}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsActionModalOpen(false)}
                    disabled={isSubmittingAction}
                    className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmittingAction || !actionPrompt.trim()}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:scale-[1.02] active:scale-95 transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingAction ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing with AI...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Submit</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
