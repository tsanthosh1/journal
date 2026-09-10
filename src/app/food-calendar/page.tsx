"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import { LifeEvent, FoodPrimaryAnchor } from "@/lib/timeline/types";
import { authFetch } from "@/lib/authFetch";
import { FoodEntryModal } from "@/components/timeline/FoodEntryModal";
import {
  Utensils,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Clock,
  Trash2,
  Calendar,
  LayoutList,
  Sun,
  Moon,
  Loader2,
  CheckCircle2,
  Copy,
  Move,
  Send,
  AlertCircle,
  SlidersHorizontal,
} from "lucide-react";

// Google Calendar time scale hours: 6 AM to 11 PM
const START_HOUR = 6;
const END_HOUR = 23;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

function formatHourLabel(h: number): string {
  const meridiem = h >= 12 ? "PM" : "AM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${meridiem}`;
}

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

// Derive sensible hour from occasion/anchor if startTime is not explicitly specified
function getEventHour(ev: LifeEvent): number {
  if (ev.startTime) {
    const parts = ev.startTime.split(":");
    const h = parseInt(parts[0], 10);
    if (!isNaN(h) && h >= 0 && h <= 23) {
      return h;
    }
  }

  const occasion = (ev.attributes?.occasion || "").toLowerCase();
  const anchor = (ev.attributes?.primaryAnchor || "").toLowerCase();

  if (occasion.includes("pre-breakfast") || occasion.includes("early")) return 7;
  if (occasion.includes("breakfast") || anchor === "breakfast") return 8;
  if (occasion.includes("post-breakfast")) return 10;
  if (occasion.includes("pre-lunch")) return 12;
  if (occasion.includes("lunch") || occasion.includes("brunch") || anchor === "lunch") return 13;
  if (occasion.includes("post-lunch") || occasion.includes("tea")) return 16;
  if (occasion.includes("pre-dinner") || occasion.includes("evening")) return 18;
  if (occasion.includes("dinner") || occasion.includes("supper") || anchor === "dinner") return 20;
  if (occasion.includes("late-night") || occasion.includes("bedtime")) return 22;

  return 12;
}

function inferAnchorFromHour(hour: number): FoodPrimaryAnchor {
  if (hour < 11) return "Breakfast";
  if (hour < 16) return "Lunch";
  return "Dinner";
}

export default function FoodCalendarPage() {
  const { user, userId, isSignedIn } = useAuth();

  // Current week start (Monday)
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getStartOfWeek(new Date()));
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Field Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTargetDate, setModalTargetDate] = useState<string>("");
  const [modalTargetAnchor, setModalTargetAnchor] = useState<FoodPrimaryAnchor>("Breakfast");
  const [modalTargetTime, setModalTargetTime] = useState<string>("");
  const [modalExistingEvent, setModalExistingEvent] = useState<LifeEvent | null>(null);

  // Drag-and-Drop state
  const [draggedEvent, setDraggedEvent] = useState<LifeEvent | null>(null);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [dragOverSlotKey, setDragOverSlotKey] = useState<string | null>(null);

  // Dedicated Food AI bar state
  const [quickAiText, setQuickAiText] = useState("");
  const [isSubmittingQuickAi, setIsSubmittingQuickAi] = useState(false);

  // Auto-scroll ref
  const calendarGridRef = useRef<HTMLDivElement>(null);

  // Time grid scale height (in px per hour row)
  const [scaleHeight, setScaleHeight] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("food_calendar_scale_height");
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 20 && val <= 160) return val;
      }
    }
    return 68;
  });

  useEffect(() => {
    try {
      localStorage.setItem("food_calendar_scale_height", scaleHeight.toString());
    } catch {
      // ignore
    }
  }, [scaleHeight]);

  // Track Alt/Option key on window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt" || e.altKey) {
        setIsAltPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt" || !e.altKey) {
        setIsAltPressed(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Generate 7 days of the active week (Mon - Sun)
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

  // Group events by Date and Hour for the Google Calendar timeline grid
  const eventsByDayAndHour = useMemo(() => {
    // map[date][hour] = LifeEvent[]
    const map: Record<string, Record<number, LifeEvent[]>> = {};

    for (const d of weekDays) {
      map[d.iso] = {};
      for (const h of HOURS) {
        map[d.iso][h] = [];
      }
    }

    for (const ev of events) {
      if (!map[ev.date]) continue;

      let h = getEventHour(ev);
      // Clamp to visible hours
      if (h < START_HOUR) h = START_HOUR;
      if (h > END_HOUR) h = END_HOUR;

      map[ev.date][h].push(ev);
    }

    // Sort events in each hour slot by exact startTime
    for (const d of weekDays) {
      for (const h of HOURS) {
        map[d.iso][h].sort((a, b) => {
          const tA = a.startTime || "";
          const tB = b.startTime || "";
          return tA.localeCompare(tB);
        });
      }
    }

    return map;
  }, [weekDays, events]);

  // Open modal for direct field editing or adding at a clicked hour
  const handleOpenModal = (
    dateIso: string,
    hour?: number,
    existingEvent?: LifeEvent
  ) => {
    setModalTargetDate(dateIso);
    if (existingEvent) {
      setModalExistingEvent(existingEvent);
      setModalTargetAnchor((existingEvent.attributes?.primaryAnchor as FoodPrimaryAnchor) || "Breakfast");
      setModalTargetTime(existingEvent.startTime || "");
    } else {
      const chosenHour = hour !== undefined ? hour : 8;
      const formattedTime = `${String(chosenHour).padStart(2, "0")}:00`;
      setModalExistingEvent(null);
      setModalTargetAnchor(inferAnchorFromHour(chosenHour));
      setModalTargetTime(formattedTime);
    }
    setIsModalOpen(true);
  };

  // Top AI Quick Bar Submit
  const handleQuickAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAiText.trim()) return;

    setIsSubmittingQuickAi(true);
    setStatusMessage(null);
    try {
      const todayIso = formatDateIso(new Date());
      const qUserId = user?.email || user?.uid || userId || "";
      const res = await authFetch(user, "/api/timeline/food/cell-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: todayIso,
          primaryAnchor: "Breakfast",
          prompt: quickAiText.trim(),
          userId: qUserId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to log meal with AI");
      }

      const data = await res.json();
      setQuickAiText("");
      setStatusMessage(data.changeSummary || "Meal logged with AI!");
      await fetchWeekEvents();
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      alert(err.message || "Failed to process meal log");
    } finally {
      setIsSubmittingQuickAi(false);
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, ev: LifeEvent) => {
    setDraggedEvent(ev);
    const isCopy = e.altKey || isAltPressed;
    e.dataTransfer.effectAllowed = isCopy ? "copy" : "move";
    e.dataTransfer.setData("text/plain", ev.id);
  };

  const handleDragOver = (e: React.DragEvent, slotKey: string) => {
    e.preventDefault();
    const isCopy = e.altKey || isAltPressed;
    e.dataTransfer.dropEffect = isCopy ? "copy" : "move";
    if (dragOverSlotKey !== slotKey) {
      setDragOverSlotKey(slotKey);
    }
  };

  const handleDragLeave = (e: React.DragEvent, slotKey: string) => {
    if (dragOverSlotKey === slotKey) {
      setDragOverSlotKey(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetDate: string, targetHour: number) => {
    e.preventDefault();
    setDragOverSlotKey(null);

    if (!draggedEvent) return;

    const isCopy = e.altKey || isAltPressed;
    const targetTime = `${String(targetHour).padStart(2, "0")}:00`;
    const targetAnchor = inferAnchorFromHour(targetHour);

    const sameSlot =
      draggedEvent.date === targetDate &&
      getEventHour(draggedEvent) === targetHour;

    if (sameSlot && !isCopy) {
      setDraggedEvent(null);
      return;
    }

    // Optimistic UI Update
    if (isCopy) {
      const clonedEvent: LifeEvent = {
        ...draggedEvent,
        id: "temp-" + Date.now(),
        date: targetDate,
        startTime: targetTime,
        attributes: {
          ...(draggedEvent.attributes || {}),
          primaryAnchor: targetAnchor,
        },
      };
      setEvents((prev) => [...prev, clonedEvent]);
      setStatusMessage(`Duplicating to ${targetDate} at ${formatHourLabel(targetHour)}...`);
    } else {
      setEvents((prev) =>
        prev.map((item) =>
          item.id === draggedEvent.id
            ? {
                ...item,
                date: targetDate,
                startTime: targetTime,
                attributes: {
                  ...(item.attributes || {}),
                  primaryAnchor: targetAnchor,
                },
              }
            : item
        )
      );
      setStatusMessage(`Moving to ${targetDate} at ${formatHourLabel(targetHour)}...`);
    }

    try {
      const res = await authFetch(user, "/api/timeline/food/move-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: draggedEvent.id,
          targetDate,
          targetAnchor,
          targetTime,
          isCopy,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to move/copy meal entry");
      }

      const data = await res.json();
      setStatusMessage(data.message || (isCopy ? "Meal duplicated" : "Meal moved"));
      await fetchWeekEvents();
      setTimeout(() => setStatusMessage(null), 2500);
    } catch (err: any) {
      alert(err.message || "Failed to complete drag-and-drop action");
      await fetchWeekEvents();
    } finally {
      setDraggedEvent(null);
    }
  };

  return (
    <AuthGuard
      title="Weekly Food Calendar"
      description="View and log your meals and snacks in a weekly calendar view structured on an hourly timeline scale."
      icon="utensils"
      badge="Private & Encrypted"
    >
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none">
        <FinanceTopBar title="Food Calendar" />

        <main className="mx-auto flex-1 w-full max-w-7xl px-2 sm:px-6 py-6 pb-28 sm:pb-12 space-y-6">
          {/* Top Control & Hero Banner */}
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
                    Nutrition Timeline
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
                      <span>Daily Activity</span>
                    </Link>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Food Calendar</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-400 max-w-xl">
                  Weekly food timeline using time as the scale. Drag cards to change meal time or day, or hold{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-white/10 font-mono text-[11px]">
                    Option (Alt)
                  </kbd>{" "}
                  to duplicate. Click any hour slot to log meals.
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

            {/* Dedicated Food AI Bar */}
            <div className="mt-5 pt-4 border-t border-white/10">
              <form onSubmit={handleQuickAiSubmit} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={quickAiText}
                    onChange={(e) => setQuickAiText(e.target.value)}
                    placeholder="Log meals with AI (e.g., 'Had 2 idlis, vada and filter coffee at 8:30am')..."
                    disabled={isSubmittingQuickAi}
                    className="w-full rounded-2xl border border-white/15 bg-slate-950/80 pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmittingQuickAi || !quickAiText.trim()}
                  className="flex items-center gap-1.5 rounded-2xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition disabled:opacity-40 cursor-pointer"
                >
                  {isSubmittingQuickAi ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Log Meal</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Feedback Banner */}
          {statusMessage && (
            <div className="flex items-center gap-2 rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-300 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-2xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Scale Control & Quick Hints Toolbar directly above the table */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/60 border border-white/10 text-[11px] text-slate-300">
                <Move className="w-3 h-3 text-amber-400" />
                <span>Drag to move</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/60 border border-white/10 text-[11px] text-slate-300">
                <Copy className="w-3 h-3 text-amber-400" />
                <span>Option-drag to copy</span>
              </span>
            </div>

            {/* Scale Length Slider */}
            <div className="flex items-center gap-2.5 bg-slate-900/80 border border-white/10 rounded-2xl px-3.5 py-1.5 backdrop-blur-sm shadow-sm">
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <label htmlFor="scale-slider" className="text-xs font-semibold text-slate-300 select-none">
                Scale Length:
              </label>
              <input
                id="scale-slider"
                type="range"
                min={20}
                max={140}
                step={2}
                value={scaleHeight}
                onChange={(e) => setScaleHeight(Number(e.target.value))}
                className="w-28 sm:w-40 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-none"
                title={`Scale length: ${scaleHeight}px per hour`}
              />
              <button
                type="button"
                onClick={() => setScaleHeight(68)}
                className="text-[10px] font-mono text-slate-400 hover:text-amber-300 transition px-1.5 py-0.5 rounded hover:bg-white/5 cursor-pointer"
                title="Reset scale to default (68px)"
              >
                {scaleHeight}px
              </button>
            </div>
          </div>

          {/* Google Calendar-Style Weekly Time Grid */}
          <div
            ref={calendarGridRef}
            className="rounded-3xl border border-white/10 bg-slate-900/60 shadow-2xl backdrop-blur-md overflow-hidden overflow-x-auto"
          >
            <div className="min-w-[780px]">
              {/* Day Header Row (Sticky) */}
              <div
                style={{ gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))" }}
                className="grid border-b border-white/10 bg-slate-950/90 sticky top-0 z-20 backdrop-blur-md"
              >
                {/* Top-left corner time icon */}
                <div className="p-3 border-r border-white/10 flex items-center justify-center text-slate-500 min-w-0">
                  <Clock className="w-4 h-4" />
                </div>

                {/* 7 Days of the Week */}
                {weekDays.map((day) => (
                  <div
                    key={day.iso}
                    className={`p-3 text-center border-r last:border-r-0 border-white/10 transition min-w-0 overflow-hidden ${
                      day.isToday ? "bg-amber-500/10" : ""
                    }`}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">
                      {day.dayName}
                    </div>
                    <div className="flex items-center justify-center gap-1 mt-0.5 min-w-0">
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

              {/* Time Grid: Hourly Rows */}
              <div className="divide-y divide-white/5 bg-slate-950/30">
                {HOURS.map((hour) => {
                  return (
                    <div
                      key={hour}
                      style={{
                        gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))",
                        minHeight: `${scaleHeight}px`,
                      }}
                      className="grid transition-[min-height] duration-75"
                    >
                      {/* Left Time Gutter */}
                      <div
                        className={`border-r border-white/10 text-slate-400 text-right pr-2 font-mono font-medium select-none shrink-0 flex items-center justify-end min-w-0 ${
                          scaleHeight < 36 ? "text-[9px] py-0 leading-none" : "text-[11px] py-1.5"
                        }`}
                      >
                        {formatHourLabel(hour)}
                      </div>

                      {/* 7 Day Columns for this Hour */}
                      {weekDays.map((day) => {
                        const slotKey = `${day.iso}-${hour}`;
                        const isDragOver = dragOverSlotKey === slotKey;
                        const slotEvents = eventsByDayAndHour[day.iso]?.[hour] || [];

                        return (
                          <div
                            key={slotKey}
                            onDragOver={(e) => handleDragOver(e, slotKey)}
                            onDragLeave={(e) => handleDragLeave(e, slotKey)}
                            onDrop={(e) => handleDrop(e, day.iso, hour)}
                            onClick={(e) => {
                              // If clicked empty slot area, open add modal at this hour
                              if ((e.target as HTMLElement).closest(".meal-card")) return;
                              handleOpenModal(day.iso, hour);
                            }}
                            className={`${
                              scaleHeight < 40 ? "p-0.5" : "p-1.5"
                            } border-r last:border-r-0 border-white/5 transition-all relative group/slot cursor-pointer min-w-0 overflow-hidden ${
                              day.isToday ? "bg-amber-500/[0.015]" : ""
                            } ${
                              isDragOver
                                ? "bg-amber-500/20 ring-2 ring-amber-400 ring-inset rounded-lg"
                                : "hover:bg-white/[0.03]"
                            }`}
                          >
                            {/* Drag-over indicator badge */}
                            {isDragOver && (
                              <div className="absolute inset-x-1 top-1 z-20 flex items-center justify-center gap-1 rounded-md bg-amber-500 text-slate-950 py-0.5 text-[9px] font-extrabold shadow-lg animate-pulse">
                                {isAltPressed ? (
                                  <>
                                    <Copy className="w-2.5 h-2.5" />
                                    <span>Copy at {formatHourLabel(hour)}</span>
                                  </>
                                ) : (
                                  <>
                                    <Move className="w-2.5 h-2.5" />
                                    <span>Move to {formatHourLabel(hour)}</span>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Sequential Meal Cards inside this hour slot */}
                            <div className={`${scaleHeight < 40 ? "space-y-0.5" : "space-y-1.5"} min-w-0`}>
                              {slotEvents.map((ev) => {
                                const isSnack = ev.attributes?.occasionType === "Snack";
                                const anchor = (ev.attributes?.primaryAnchor as FoodPrimaryAnchor) || inferAnchorFromHour(hour);
                                const isBeingDragged = draggedEvent?.id === ev.id;
                                const timeDisplay = ev.startTime || formatHourLabel(hour);
                                const isUltraCompact = scaleHeight < 48;

                                const anchorBorder =
                                  anchor === "Breakfast"
                                    ? "border-amber-500/40 hover:border-amber-400 bg-amber-500/10"
                                    : anchor === "Lunch"
                                    ? "border-emerald-500/40 hover:border-emerald-400 bg-emerald-500/10"
                                    : "border-indigo-500/40 hover:border-indigo-400 bg-indigo-500/10";

                                return (
                                  <div
                                    key={ev.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, ev)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenModal(day.iso, hour, ev);
                                    }}
                                    className={`meal-card group/card relative rounded-lg border shadow-sm transition-all duration-150 cursor-grab active:cursor-grabbing hover:scale-[1.01] hover:shadow-md min-w-0 max-w-full overflow-hidden ${
                                      isUltraCompact ? "px-1.5 py-0.5" : "px-2.5 py-1.5"
                                    } ${
                                      isBeingDragged ? "opacity-30 scale-95 border-dashed" : ""
                                    } ${
                                      isSnack
                                        ? "bg-slate-950/80 border-white/15 hover:border-amber-400/50"
                                        : anchorBorder
                                    }`}
                                  >
                                    {isUltraCompact ? (
                                      <div className="min-w-0 leading-tight">
                                        <span className="text-[10px] font-mono font-semibold text-slate-400 mr-1.5 inline-block shrink-0">
                                          {timeDisplay}
                                        </span>
                                        <span
                                          className="text-xs font-bold text-white break-words whitespace-normal tracking-tight"
                                          title={ev.title}
                                        >
                                          {ev.title}
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="min-w-0">
                                        <div className="text-[10px] font-mono font-semibold text-slate-400 leading-none">
                                          {timeDisplay}
                                        </div>
                                        <div
                                          className="text-sm font-bold text-white mt-1 leading-snug break-words whitespace-normal tracking-tight"
                                          title={ev.title}
                                        >
                                          {ev.title}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Subtle add button on slot hover when empty */}
                            {slotEvents.length === 0 && (
                              <div className="opacity-0 group-hover/slot:opacity-100 transition-opacity h-full flex items-center justify-center py-0.5">
                                <span className="text-[10px] text-slate-500 flex items-center gap-0.5 font-medium leading-none">
                                  <Plus className="w-2.5 h-2.5 text-slate-400" />
                                  <span>{formatHourLabel(hour)}</span>
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>

        {/* Direct Field-Level & AI Food Entry Modal */}
        <FoodEntryModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSaved={fetchWeekEvents}
          date={modalTargetDate}
          defaultAnchor={modalTargetAnchor}
          defaultTime={modalTargetTime}
          existingEvent={modalExistingEvent}
        />
      </div>
    </AuthGuard>
  );
}
