"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authFetch";
import { LifeEvent, TreadmillAttributes } from "@/lib/timeline/types";
import { TreadmillEntryModal } from "@/components/fitness/TreadmillEntryModal";
import { FitnessVoiceModal } from "@/components/fitness/FitnessVoiceModal";
import { TreadmillCalendar } from "@/components/fitness/TreadmillCalendar";
import { WeightTrackerView } from "@/components/fitness/WeightTrackerView";
import {
  Activity,
  Flame,
  Gauge,
  Mountain,
  Clock,
  Plus,
  Mic,
  Calendar as CalendarIcon,
  List as ListIcon,
  Sparkles,
  TrendingUp,
  Trash2,
  Edit2,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Dumbbell,
  Bike,
  Heart,
  Zap,
  Scale,
} from "lucide-react";

type PeriodFilter = "WEEK" | "MONTH" | "ALL";
type ViewMode = "calendar" | "list";

interface TreadmillSummary {
  totalDistanceKm: number;
  totalDurationMins: number;
  totalDurationHours: number;
  totalCalories: number;
  sessionsCount: number;
  avgSpeedKph: number;
  avgPace: string;
}

export default function FitnessPage() {
  const { user, userId, isSignedIn } = useAuth();
  const qUserId = user?.email || user?.uid || userId || "";

  const [activeModule, setActiveModule] = useState<"treadmill" | "weight" | "weights" | "cycling">("treadmill");
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [period, setPeriod] = useState<PeriodFilter>("MONTH");
  const [selectedDateForModal, setSelectedDateForModal] = useState<string | undefined>(undefined);
  const [sessions, setSessions] = useState<LifeEvent[]>([]);
  const [summary, setSummary] = useState<TreadmillSummary>({
    totalDistanceKm: 0,
    totalDurationMins: 0,
    totalDurationHours: 0,
    totalCalories: 0,
    sessionsCount: 0,
    avgSpeedKph: 0,
    avgPace: "--:--",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<LifeEvent | null>(null);

  // Helper for consistent YYYY-MM-DD local strings
  const toYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // Compute date range based on viewMode and period
  const dateRange = useMemo(() => {
    if (viewMode === "calendar") {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      return {
        startDate: toYmd(start),
        endDate: toYmd(end),
      };
    }

    const now = new Date();
    if (period === "WEEK") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(now);
      start.setDate(diff);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return {
        startDate: toYmd(start),
        endDate: toYmd(end),
      };
    } else if (period === "MONTH") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        startDate: toYmd(start),
        endDate: toYmd(end),
      };
    }
    // ALL time: last 12 months
    const start = new Date(now);
    start.setFullYear(start.getFullYear() - 1);
    return {
      startDate: toYmd(start),
      endDate: toYmd(now),
    };
  }, [viewMode, currentMonth, period]);

  const fetchTreadmillSessions = useCallback(async () => {
    if (!isSignedIn) return;
    setIsLoading(true);
    setError(null);

    try {
      const url = `/api/fitness/treadmill?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&userId=${encodeURIComponent(
        qUserId
      )}`;
      const res = await authFetch(user, url);

      if (!res.ok) {
        throw new Error("Failed to load treadmill sessions");
      }

      const data = await res.json();
      setSessions(data.sessions || []);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch fitness data");
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, user, qUserId, dateRange]);

  useEffect(() => {
    fetchTreadmillSessions();
  }, [fetchTreadmillSessions]);

  const handleDeleteSession = async (id: string) => {
    if (!confirm("Are you sure you want to delete this treadmill workout?")) return;
    try {
      const res = await authFetch(user, `/api/fitness/treadmill?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete session");

      setStatusMessage("Workout deleted.");
      await fetchTreadmillSessions();
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      alert(err.message || "Failed to delete");
    }
  };

  const handleEditSession = (session: LifeEvent) => {
    setEditingSession(session);
    setSelectedDateForModal(undefined);
    setIsManualModalOpen(true);
  };

  const handleSelectCalendarDate = (dateStr: string, existingSession?: LifeEvent) => {
    if (existingSession) {
      setEditingSession(existingSession);
      setSelectedDateForModal(undefined);
    } else {
      setEditingSession(null);
      setSelectedDateForModal(dateStr);
    }
    setIsManualModalOpen(true);
  };

  return (
    <AuthGuard
      title="Fitness & Treadmill Tracker"
      description="Track treadmill running, brisk walking, distance, incline, speed, pace, and calories with AI voice logging."
      icon="activity"
      badge="Private & Encrypted"
    >
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none">
        <FinanceTopBar title="Fitness Tracker" />

        <main className="mx-auto flex-1 w-full max-w-7xl px-3 sm:px-6 py-6 pb-28 sm:pb-12 space-y-6">
          {/* Module Selector Tabs */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveModule("treadmill")}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeModule === "treadmill"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>🏃 Treadmill Tracker</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModule("weight")}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeModule === "weight"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Scale className="w-4 h-4 text-cyan-400" />
                <span>⚖️ Weight & Body</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModule("weights")}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                <Dumbbell className="w-3.5 h-3.5" />
                <span>Gym / Weights</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/5 text-slate-400">Soon</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModule("cycling")}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                <Bike className="w-3.5 h-3.5" />
                <span>Cycling</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/5 text-slate-400">Soon</span>
              </button>
            </div>

            <div className="text-xs text-slate-400 font-medium">
              Unified Fitness Engine
            </div>
          </div>

          {activeModule === "weight" ? (
            <WeightTrackerView />
          ) : (
            <>
              {/* Unified Single-Line Control Bar */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* View Switcher: Calendar vs List */}
              <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setViewMode("calendar")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    viewMode === "calendar"
                      ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <CalendarIcon className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Calendar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    viewMode === "list"
                      ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <ListIcon className="w-3.5 h-3.5 text-emerald-400" />
                  <span>List</span>
                </button>
              </div>

              {/* Period Switcher (active in List view) */}
              {viewMode === "list" && (
                <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-white/10 animate-in fade-in">
                  {(["WEEK", "MONTH", "ALL"] as PeriodFilter[]).map((p) => {
                    const isSelected = period === p;
                    const label = p === "WEEK" ? "This Week" : p === "MONTH" ? "This Month" : "All Time";
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPeriod(p)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          isSelected
                            ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions: + Log Workout & Voice AI */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingSession(null);
                  setSelectedDateForModal(undefined);
                  setIsManualModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-3.5 py-2 text-xs font-bold text-white transition border border-white/10 cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>Log Workout</span>
              </button>

              <button
                type="button"
                onClick={() => setIsVoiceModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 hover:shadow-lg hover:shadow-emerald-500/20 active:scale-95 transition cursor-pointer shadow-md"
              >
                <Sparkles className="w-3.5 h-3.5 fill-current" />
                <span>Voice AI</span>
                <span className="w-px h-3.5 bg-slate-900/30" />
                <Mic className="w-3.5 h-3.5 fill-current" />
              </button>
            </div>
          </div>

          {/* Feedback Banners */}
          {statusMessage && (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-300 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-2xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Calendar View with Progress vs List View Metrics */}
          {viewMode === "calendar" ? (
            <TreadmillCalendar
              sessions={sessions}
              currentMonth={currentMonth}
              onMonthChange={setCurrentMonth}
              onSelectDate={handleSelectCalendarDate}
            />
          ) : (
            /* Metric Summary Cards (shown in List mode) */
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {/* Total Distance */}
              <div className="p-4 rounded-3xl border border-white/10 bg-slate-900/80 shadow-lg flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Distance</span>
                </span>
                <div className="mt-2">
                  <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                    {summary.totalDistanceKm}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">km</span>
                </div>
              </div>

              {/* Total Time */}
              <div className="p-4 rounded-3xl border border-white/10 bg-slate-900/80 shadow-lg flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span>Time Spent</span>
                </span>
                <div className="mt-2">
                  <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                    {summary.totalDurationHours}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">hrs ({summary.totalDurationMins}m)</span>
                </div>
              </div>

              {/* Calories Burned */}
              <div className="p-4 rounded-3xl border border-white/10 bg-slate-900/80 shadow-lg flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-rose-400" />
                  <span>Calories</span>
                </span>
                <div className="mt-2">
                  <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                    {summary.totalCalories}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">kcal</span>
                </div>
              </div>

              {/* Avg Speed */}
              <div className="p-4 rounded-3xl border border-white/10 bg-slate-900/80 shadow-lg flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Gauge className="w-4 h-4 text-amber-400" />
                  <span>Avg Speed</span>
                </span>
                <div className="mt-2">
                  <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                    {summary.avgSpeedKph}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">km/h</span>
                </div>
              </div>

              {/* Sessions Count */}
              <div className="p-4 rounded-3xl border border-white/10 bg-slate-900/80 shadow-lg flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-indigo-400" />
                  <span>Workouts</span>
                </span>
                <div className="mt-2">
                  <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                    {summary.sessionsCount}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">sessions</span>
                </div>
              </div>
            </div>
          )}

          {/* Workout History Feed */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Recent Treadmill Sessions</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-mono">
                  {sessions.length}
                </span>
              </h3>
            </div>

            {sessions.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
                  <Activity className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-slate-200">No treadmill workouts logged yet</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Click <strong>Voice AI</strong> to speak your workout or tap <strong>+ Log Workout</strong> to record your treadmill distance and time.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sessions.map((session) => {
                  const attrs = session.attributes as TreadmillAttributes;
                  const mode = attrs?.workoutMode || "Treadmill";
                  return (
                    <div
                      key={session.id}
                      className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-md hover:border-white/20 transition space-y-3"
                    >
                      {/* Top Row: Date, Time, Mode Badge, & Actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-300">{session.date}</span>
                          {session.startTime && (
                            <span className="text-[11px] text-slate-400 font-mono">
                              at {session.startTime}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                            {mode}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditSession(session)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                            title="Edit Workout"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSession(session.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/10 transition cursor-pointer"
                            title="Delete Workout"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Middle Row: Big Metrics Display */}
                      <div className="grid grid-cols-4 gap-2 p-3 rounded-xl bg-slate-950/60 border border-white/5">
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Distance</span>
                          <p className="text-base font-black text-white font-mono">
                            {attrs?.distanceKm || 0} <span className="text-xs font-normal text-slate-400">km</span>
                          </p>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Duration</span>
                          <p className="text-base font-black text-emerald-400 font-mono">
                            {attrs?.durationMins || 0} <span className="text-xs font-normal text-slate-400">m</span>
                          </p>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Speed</span>
                          <p className="text-base font-black text-amber-300 font-mono">
                            {attrs?.speedKph || 0} <span className="text-xs font-normal text-slate-400">kph</span>
                          </p>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Calories</span>
                          <p className="text-base font-black text-rose-400 font-mono">
                            {attrs?.caloriesBurned || 0} <span className="text-xs font-normal text-slate-400">cal</span>
                          </p>
                        </div>
                      </div>

                      {/* Bottom Row: Incline, Pace, Heart Rate, and Notes */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pt-1 border-t border-white/5">
                        <div className="flex flex-wrap items-center gap-2">
                          {attrs?.inclinePercentage !== undefined && attrs.inclinePercentage > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-cyan-300 font-medium">
                              <Mountain className="w-3 h-3 text-cyan-400" />
                              <span>{attrs.inclinePercentage}% inc</span>
                            </span>
                          )}

                          {attrs?.paceMinPerKm && (
                            <span className="text-[11px] font-mono text-slate-300">
                              ⚡ {attrs.paceMinPerKm} /km
                            </span>
                          )}

                          {attrs?.avgHeartRate && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-300">
                              <Heart className="w-3 h-3 text-rose-400" />
                              <span>{attrs.avgHeartRate} bpm</span>
                            </span>
                          )}
                        </div>

                        {session.description && (
                          <span className="text-[11px] text-slate-400 italic truncate max-w-[200px]">
                            {session.description}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </>
        )}
        </main>

        {/* Modals */}
        <TreadmillEntryModal
          isOpen={isManualModalOpen}
          onClose={() => {
            setIsManualModalOpen(false);
            setEditingSession(null);
            setSelectedDateForModal(undefined);
          }}
          onSaved={fetchTreadmillSessions}
          existingSession={editingSession}
          defaultDate={selectedDateForModal}
        />

        <FitnessVoiceModal
          isOpen={isVoiceModalOpen}
          onClose={() => setIsVoiceModalOpen(false)}
          todayDate={new Date().toISOString().split("T")[0]}
          existingEvents={sessions}
          onSuccess={async (summary) => {
            setStatusMessage(summary);
            await fetchTreadmillSessions();
            setTimeout(() => setStatusMessage(null), 4000);
          }}
        />
      </div>
    </AuthGuard>
  );
}
