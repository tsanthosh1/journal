"use client";

import React, { useState, useMemo } from "react";
import { LifeEvent, TreadmillAttributes } from "@/lib/timeline/types";
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  Activity,
  Target,
  Trophy,
  Zap,
  Plus,
  Edit2,
  TrendingUp,
} from "lucide-react";

interface TreadmillCalendarProps {
  sessions: LifeEvent[];
  currentMonth: Date;
  onMonthChange: (newMonth: Date) => void;
  onSelectDate: (dateStr: string, existingSession?: LifeEvent) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function TreadmillCalendar({
  sessions,
  currentMonth,
  onMonthChange,
  onSelectDate,
}: TreadmillCalendarProps) {
  // Configurable monthly goal in km (saved to localStorage)
  const [monthlyGoalKm, setMonthlyGoalKm] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("treadmill_monthly_goal_km");
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }
    return 50; // default 50 km monthly target
  });

  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(monthlyGoalKm.toString());

  const handleSaveGoal = () => {
    const val = parseFloat(goalInput);
    if (!isNaN(val) && val > 0) {
      setMonthlyGoalKm(val);
      try {
        localStorage.setItem("treadmill_monthly_goal_km", val.toString());
      } catch {}
    }
    setIsEditingGoal(false);
  };

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth(); // 0-indexed

  const monthName = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return now.getFullYear() === year && now.getMonth() === month;
  }, [year, month]);

  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // Map sessions by date (YYYY-MM-DD)
  const sessionsByDate = useMemo(() => {
    const map: Record<string, LifeEvent[]> = {};
    for (const ev of sessions) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [sessions]);

  // Compute month progress metrics
  const monthMetrics = useMemo(() => {
    let totalDist = 0;
    let totalDuration = 0;
    let totalCalories = 0;
    const activeDates = new Set<string>();

    for (const ev of sessions) {
      const [yStr, mStr] = ev.date.split("-");
      if (parseInt(yStr, 10) === year && parseInt(mStr, 10) === month + 1) {
        const attrs = ev.attributes as TreadmillAttributes;
        totalDist += Number(attrs?.distanceKm) || 0;
        totalDuration += Number(attrs?.durationMins) || 0;
        totalCalories += Number(attrs?.caloriesBurned) || 0;
        activeDates.add(ev.date);
      }
    }

    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const progressPercent = Math.min(100, Math.round((totalDist / monthlyGoalKm) * 100));

    // Calculate streak in current month
    const sortedDates = Array.from(activeDates).sort();
    let currentStreak = 0;
    let maxStreak = 0;
    let streakCount = 0;
    let prevDate: Date | null = null;

    for (const dStr of sortedDates) {
      const curr = new Date(dStr);
      if (prevDate) {
        const diffDays = Math.round((curr.getTime() - prevDate.getTime()) / (1000 * 3600 * 24));
        if (diffDays === 1) {
          streakCount++;
        } else {
          streakCount = 1;
        }
      } else {
        streakCount = 1;
      }
      if (streakCount > maxStreak) maxStreak = streakCount;
      prevDate = curr;
    }

    // Check if active today or yesterday for current streak
    if (activeDates.has(todayIso)) {
      currentStreak = streakCount;
    }

    return {
      totalDistanceKm: Number(totalDist.toFixed(1)),
      totalDurationMins: totalDuration,
      totalCalories,
      activeDaysCount: activeDates.size,
      totalDaysInMonth,
      progressPercent,
      maxStreak,
      currentStreak,
    };
  }, [sessions, year, month, monthlyGoalKm, todayIso]);

  // Generate calendar days with leading/trailing padding
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    // Monday as 1st column: Mon=0, Tue=1, ..., Sun=6
    const leadDays = (firstDayIndex + 6) % 7;
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: Array<{
      dateIso: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      sessions: LifeEvent[];
      totalKm: number;
      totalDuration: number;
    }> = [];

    // Previous month filler days
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    for (let i = leadDays - 1; i >= 0; i--) {
      const dNum = prevMonthTotalDays - i;
      const prevM = month === 0 ? 12 : month;
      const prevY = month === 0 ? year - 1 : year;
      const iso = `${prevY}-${String(prevM).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`;
      days.push({
        dateIso: iso,
        dayNum: dNum,
        isCurrentMonth: false,
        isToday: iso === todayIso,
        sessions: sessionsByDate[iso] || [],
        totalKm: 0,
        totalDuration: 0,
      });
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const daySessions = sessionsByDate[iso] || [];
      const totalKm = daySessions.reduce((acc, s) => acc + (Number(s.attributes?.distanceKm) || 0), 0);
      const totalDuration = daySessions.reduce((acc, s) => acc + (Number(s.attributes?.durationMins) || 0), 0);

      days.push({
        dateIso: iso,
        dayNum: d,
        isCurrentMonth: true,
        isToday: iso === todayIso,
        sessions: daySessions,
        totalKm: Number(totalKm.toFixed(1)),
        totalDuration,
      });
    }

    // Trailing days to fill out 35 or 42 grid slots
    const totalSlots = days.length <= 35 ? 35 : 42;
    const trailDays = totalSlots - days.length;
    for (let t = 1; t <= trailDays; t++) {
      const nextM = month === 11 ? 1 : month + 2;
      const nextY = month === 11 ? year + 1 : year;
      const iso = `${nextY}-${String(nextM).padStart(2, "0")}-${String(t).padStart(2, "0")}`;
      days.push({
        dateIso: iso,
        dayNum: t,
        isCurrentMonth: false,
        isToday: iso === todayIso,
        sessions: sessionsByDate[iso] || [],
        totalKm: 0,
        totalDuration: 0,
      });
    }

    return days;
  }, [year, month, todayIso, sessionsByDate]);

  const handlePrevMonth = () => {
    onMonthChange(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    onMonthChange(new Date(year, month + 1, 1));
  };

  const handleCurrentMonth = () => {
    onMonthChange(new Date());
  };

  return (
    <div className="space-y-4">
      {/* Monthly Progress Goal Card */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-emerald-950/20 p-4 sm:p-5 shadow-xl backdrop-blur-md space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  {monthName} Treadmill Progress
                </h3>
                {isEditingGoal ? (
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      value={goalInput}
                      onChange={(e) => setGoalInput(e.target.value)}
                      className="w-16 px-1.5 py-0.5 rounded bg-slate-950 border border-emerald-500/50 text-xs font-mono text-white text-center focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSaveGoal}
                      className="text-[11px] px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setGoalInput(monthlyGoalKm.toString());
                      setIsEditingGoal(true);
                    }}
                    className="text-[10px] text-slate-400 hover:text-emerald-300 font-medium underline cursor-pointer"
                  >
                    Goal: {monthlyGoalKm} km
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {monthMetrics.activeDaysCount} of {monthMetrics.totalDaysInMonth} active days • {monthMetrics.totalCalories} kcal burned
              </p>
            </div>
          </div>

          {/* Quick Badges: Streak & Consistency */}
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-950/70 border border-white/10 text-xs">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-semibold text-slate-200">
                {monthMetrics.maxStreak > 1 ? `${monthMetrics.maxStreak}-day streak` : "Consistency"}
              </span>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-950/70 border border-white/10 text-xs font-mono">
              <span className="text-slate-400">Target:</span>
              <span className="font-bold text-emerald-400">
                {monthMetrics.totalDistanceKm} / {monthlyGoalKm} km
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="h-3 w-full rounded-full bg-slate-950/80 border border-white/5 overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 transition-all duration-500 shadow-sm shadow-emerald-500/30"
              style={{ width: `${monthMetrics.progressPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>{monthMetrics.progressPercent}% Goal Completed</span>
            <span>
              {monthlyGoalKm - monthMetrics.totalDistanceKm > 0
                ? `${(monthlyGoalKm - monthMetrics.totalDistanceKm).toFixed(1)} km remaining`
                : "🎉 Goal Achieved!"}
            </span>
          </div>
        </div>
      </div>

      {/* Calendar Card */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-3 sm:p-5 shadow-xl backdrop-blur-md space-y-3">
        {/* Calendar Header: Month Navigator */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-xl border border-white/10 bg-slate-950/70 p-1 shadow-sm">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition active:scale-95 cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 text-xs font-bold text-slate-200 whitespace-nowrap">
                {monthName}
              </span>

              <button
                type="button"
                onClick={handleNextMonth}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition active:scale-95 cursor-pointer"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleCurrentMonth}
              disabled={isCurrentMonth}
              className={`text-xs px-2.5 py-1.5 rounded-xl border transition cursor-pointer ${
                isCurrentMonth
                  ? "text-slate-600 border-transparent cursor-default"
                  : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 font-medium"
              }`}
            >
              This Month
            </button>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px]">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span>Completed Workout</span>
            </span>
          </div>
        </div>

        {/* 7-Day Grid Headers */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-white/5 pb-2">
          {WEEKDAYS.map((wd) => (
            <div key={wd}>{wd}</div>
          ))}
        </div>

        {/* Calendar Days Grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {calendarDays.map((day, idx) => {
            const hasWorkouts = day.sessions.length > 0;
            return (
              <div
                key={idx}
                onClick={() => {
                  if (hasWorkouts) {
                    onSelectDate(day.dateIso, day.sessions[0]);
                  } else {
                    onSelectDate(day.dateIso);
                  }
                }}
                className={`relative min-h-[72px] sm:min-h-[88px] rounded-2xl p-1.5 sm:p-2 border transition flex flex-col justify-between group cursor-pointer ${
                  day.isCurrentMonth
                    ? hasWorkouts
                      ? "bg-emerald-950/30 border-emerald-500/40 hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-500/10"
                      : "bg-slate-950/40 border-white/5 hover:border-white/20 hover:bg-white/5"
                    : "bg-slate-950/10 border-transparent opacity-30 hover:opacity-70"
                } ${day.isToday ? "ring-2 ring-emerald-400/80 shadow-md" : ""}`}
              >
                {/* Day Header Row */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-mono font-bold leading-none ${
                      day.isToday
                        ? "text-emerald-300 font-black"
                        : day.isCurrentMonth
                        ? "text-slate-300"
                        : "text-slate-600"
                    }`}
                  >
                    {day.dayNum}
                  </span>

                  {/* Visual workout count indicator */}
                  {hasWorkouts && (
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                    </span>
                  )}
                </div>

                {/* Day Content: Workout Stats or Quick + icon */}
                {hasWorkouts ? (
                  <div className="space-y-0.5 mt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-black font-mono text-white leading-tight">
                        {day.totalKm} <span className="text-[10px] font-normal text-slate-400">km</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/20 px-1 py-0.2 rounded font-bold">
                        {day.totalDuration}m
                      </span>
                      {day.sessions[0]?.attributes?.inclinePercentage > 0 && (
                        <span className="text-[9px] font-mono text-cyan-300 hidden sm:inline">
                          {day.sessions[0].attributes.inclinePercentage}%
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center py-1 text-slate-500 hover:text-white">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
