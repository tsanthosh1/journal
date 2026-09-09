"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { LifeEvent, TimelineDaySummary, ACTIVITY_META_MAP } from "@/lib/timeline/types";
import { TimelineEventCard } from "@/components/timeline/TimelineEventCard";
import { VoiceRecorderModal } from "@/components/timeline/VoiceRecorderModal";
import { EventEditModal } from "@/components/timeline/EventEditModal";
import { SchemaManagerDrawer } from "@/components/timeline/SchemaManagerDrawer";
import { AiConfigModal } from "@/components/timeline/AiConfigModal";

export default function TimelinePage() {
  // Current selected date (YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [summary, setSummary] = useState<TimelineDaySummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals & Drawers
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<LifeEvent | null>(null);
  const [isSchemaDrawerOpen, setIsSchemaDrawerOpen] = useState(false);
  const [isAiConfigOpen, setIsAiConfigOpen] = useState(false);

  const fetchDayEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/timeline/events?date=${selectedDate}`);
      if (!res.ok) {
        throw new Error(`Failed to load timeline for ${selectedDate}`);
      }
      const data = await res.json();
      setEvents(data.events || []);
      setSummary(data.summary || null);
    } catch (err: any) {
      setError(err.message || "Failed to load events");
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchDayEvents();
  }, [fetchDayEvents]);

  // Date Navigation Helpers
  const handleShiftDate = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(current.toISOString().split("T")[0]);
  };

  const handleSetToday = () => {
    setSelectedDate(new Date().toISOString().split("T")[0]);
  };

  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (selectedCategory !== "ALL" && ev.activityType !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = ev.title.toLowerCase().includes(q);
        const matchDesc = (ev.description || "").toLowerCase().includes(q);
        const matchTags = (ev.tags || []).some((t) => t.toLowerCase().includes(q));
        const matchAttrs = Object.values(ev.attributes || {}).some((v) =>
          String(v).toLowerCase().includes(q)
        );
        if (!matchTitle && !matchDesc && !matchTags && !matchAttrs) return false;
      }
      return true;
    });
  }, [events, selectedCategory, searchQuery]);

  // Formatted date string (e.g., "Wednesday, 9 September 2026")
  const formattedDateTitle = useMemo(() => {
    try {
      const parts = selectedDate.split("-");
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch (e) {
      return selectedDate;
    }
  }, [selectedDate]);

  const handleEditEvent = (event: LifeEvent) => {
    setEditingEvent(event);
    setIsEditModalOpen(true);
  };

  const handleCreateManualEvent = () => {
    setEditingEvent(null);
    setIsEditModalOpen(true);
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      const res = await fetch(`/api/timeline/events/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete event");
      await fetchDayEvents();
    } catch (err: any) {
      alert(err.message || "Could not delete event");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <FinanceTopBar title="Life Events Diary" />

      <main className="mx-auto flex-1 w-full max-w-5xl px-4 py-6 sm:px-8 space-y-6">
        {/* Top Control & Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-cyan-950/30 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            {/* Title & Date Navigation */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300 font-bold text-sm">
                  📖
                </span>
                <span className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">
                  AI Life Events Diary
                </span>
                {isToday && (
                  <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                    TODAY
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {formattedDateTitle}
              </h1>

              {/* Date Navigation Strip */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={() => handleShiftDate(-1)}
                  className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer"
                  title="Previous Day"
                >
                  ◀ Yesterday
                </button>

                {!isToday && (
                  <button
                    type="button"
                    onClick={handleSetToday}
                    className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition cursor-pointer"
                  >
                    Today
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleShiftDate(1)}
                  className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer"
                  title="Next Day"
                >
                  Tomorrow ▶
                </button>

                <div className="relative">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    aria-label="Pick timeline date"
                    className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300 focus:border-cyan-500 focus:outline-none cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Quick Action Buttons: Mic Hero & Extra Tools */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              {/* Primary Mic Button */}
              <button
                type="button"
                onClick={() => setIsVoiceModalOpen(true)}
                className="group relative flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 px-6 py-3.5 text-sm font-extrabold text-slate-950 shadow-xl shadow-cyan-500/25 transition-all duration-300 hover:scale-[1.02] hover:shadow-cyan-500/40 active:scale-95 cursor-pointer"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950/20 text-base">
                  🎙️
                </span>
                <span>Speak & Log Day</span>
              </button>

              {/* Extra Tools */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreateManualEvent}
                  className="flex-1 sm:flex-initial rounded-xl border border-white/10 bg-slate-800/80 px-3.5 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer"
                  title="Manually create event"
                >
                  ➕ Add
                </button>

                <button
                  type="button"
                  onClick={() => setIsSchemaDrawerOpen(true)}
                  className="flex-1 sm:flex-initial rounded-xl border border-purple-500/30 bg-purple-500/10 px-3.5 py-2.5 text-xs font-semibold text-purple-300 hover:bg-purple-500/20 transition cursor-pointer"
                  title="View evolving JSON schemas"
                >
                  🧬 Schemas
                </button>

                <button
                  type="button"
                  onClick={() => setIsAiConfigOpen(true)}
                  className="rounded-xl border border-white/10 bg-slate-800/80 p-2.5 text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer"
                  title="AI Configuration (OpenRouter)"
                >
                  ⚙️
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Day Summary Metrics Bar */}
        {summary && summary.totalEvents > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-3.5 shadow-sm backdrop-blur-md">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Total Events
              </div>
              <div className="mt-1 text-2xl font-black text-white font-mono">
                {summary.totalEvents}
              </div>
              <div className="text-[11px] text-slate-500">logged for this day</div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-3.5 shadow-sm backdrop-blur-md">
              <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                Active Time
              </div>
              <div className="mt-1 text-2xl font-black text-cyan-300 font-mono">
                {summary.totalDurationMinutes > 0
                  ? `${Math.floor(summary.totalDurationMinutes / 60)}h ${summary.totalDurationMinutes % 60}m`
                  : "Varied"}
              </div>
              <div className="text-[11px] text-slate-500">tracked duration</div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-3.5 shadow-sm backdrop-blur-md">
              <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                Categories
              </div>
              <div className="mt-1 text-2xl font-black text-purple-300 font-mono">
                {Object.keys(summary.activityCounts).length}
              </div>
              <div className="text-[11px] text-slate-500">activity domains</div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-3.5 shadow-sm backdrop-blur-md">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Moods Detected
              </div>
              <div className="mt-1 text-sm font-bold text-emerald-300 truncate pt-1">
                {summary.moodsDetected.length > 0 ? summary.moodsDetected.join(", ") : "Balanced"}
              </div>
              <div className="text-[11px] text-slate-500">sentiment tone</div>
            </div>
          </div>
        )}

        {/* Filter Chips & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-white/5 bg-slate-900/60 p-3 backdrop-blur-md">
          {/* Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
            <button
              type="button"
              onClick={() => setSelectedCategory("ALL")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 ${
                selectedCategory === "ALL"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              All ({events.length})
            </button>

            {Object.entries(ACTIVITY_META_MAP).map(([type, meta]) => {
              const count = events.filter((e) => e.activityType === type).length;
              if (count === 0 && selectedCategory !== type) return null;
              const active = selectedCategory === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedCategory(type)}
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 ${
                    active
                      ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                      : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span>{meta.icon}</span>
                  <span>{meta.name.split(" ")[0]}</span>
                  {count > 0 && <span className="opacity-70 font-mono">({count})</span>}
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, attributes, tags..."
              className="w-full sm:w-60 rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Vertical Timeline Section */}
        <div className="pt-2">
          {isLoading ? (
            <div className="py-16 text-center space-y-2">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              <p className="text-xs text-slate-400">Loading daily timeline...</p>
            </div>
          ) : filteredEvents.length > 0 ? (
            <div className="relative pt-2 pl-3 sm:pl-4">
              {filteredEvents.map((event) => (
                <TimelineEventCard
                  key={event.id}
                  event={event}
                  onEdit={handleEditEvent}
                  onDelete={handleDeleteEvent}
                />
              ))}
            </div>
          ) : (
            /* Empty State */
            <div className="rounded-3xl border border-dashed border-white/10 bg-slate-900/30 p-8 sm:p-12 text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 text-3xl">
                🎙️
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  No events recorded for this date
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Hit the microphone and speak your day naturally. Our AI will automatically break down
                  your speech into structured events with custom attributes.
                </p>
              </div>

              {/* Sample Prompt Pill */}
              <div className="max-w-md mx-auto rounded-2xl bg-slate-950/60 border border-white/5 p-3 text-left">
                <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                  Example Speech:
                </p>
                <p className="text-xs text-slate-300 italic mt-0.5">
                  "Today at 7:30am ran 5km in 28 mins, felt great. Then had oatmeal with chia seeds for
                  breakfast. At 11am had a sprint review meeting with Alex..."
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsVoiceModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-md shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition active:scale-95 cursor-pointer"
              >
                <span>🎙️</span>
                <span>Open Voice Recorder</span>
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Voice Recorder & AI Decomposer Modal */}
      <VoiceRecorderModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        targetDate={selectedDate}
        onEventsSaved={fetchDayEvents}
        onOpenAiSettings={() => {
          setIsVoiceModalOpen(false);
          setIsAiConfigOpen(true);
        }}
      />

      {/* Event Edit / Manual Create Modal */}
      <EventEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        eventToEdit={editingEvent}
        defaultDate={selectedDate}
        onSaved={fetchDayEvents}
      />

      {/* Schema Manager Drawer */}
      <SchemaManagerDrawer
        isOpen={isSchemaDrawerOpen}
        onClose={() => setIsSchemaDrawerOpen(false)}
        onSchemaUpdated={fetchDayEvents}
      />

      {/* AI Configuration Modal */}
      <AiConfigModal
        isOpen={isAiConfigOpen}
        onClose={() => setIsAiConfigOpen(false)}
        onConfigSaved={() => {
          alert("OpenRouter configuration saved!");
        }}
      />
    </div>
  );
}
