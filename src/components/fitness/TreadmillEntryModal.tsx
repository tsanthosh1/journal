"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authFetch";
import { LifeEvent, TreadmillAttributes } from "@/lib/timeline/types";
import {
  X,
  Flame,
  Activity,
  Gauge,
  Mountain,
  Clock,
  Calendar,
  Save,
  Loader2,
  Check,
  Plus,
  Minus,
} from "lucide-react";

interface TreadmillEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  existingSession?: LifeEvent | null;
  defaultDate?: string;
}

const WORKOUT_MODES = [
  { id: "Brisk Walk", label: "Brisk Walk", emoji: "🚶" },
  { id: "Incline Walk", label: "Incline Walk", emoji: "⛰️" },
  { id: "Jog", label: "Jog", emoji: "🏃" },
  { id: "Endurance Run", label: "Endurance Run", emoji: "⚡" },
  { id: "HIIT Intervals", label: "HIIT Intervals", emoji: "🔥" },
  { id: "Warmup / Cooldown", label: "Warmup", emoji: "🧘" },
];

export function TreadmillEntryModal({
  isOpen,
  onClose,
  onSaved,
  existingSession,
  defaultDate,
}: TreadmillEntryModalProps) {
  const { user } = useAuth();
  const [date, setDate] = useState(() => defaultDate || new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState(() =>
    new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
  const [workoutMode, setWorkoutMode] = useState<string>("Brisk Walk");
  const [distanceKm, setDistanceKm] = useState<number>(3.0);
  const [durationMins, setDurationMins] = useState<number>(25);
  const [speedKph, setSpeedKph] = useState<number>(7.2);
  const [inclinePercentage, setInclinePercentage] = useState<number>(1.0);
  const [caloriesBurned, setCaloriesBurned] = useState<number>(195);
  const [avgHeartRate, setAvgHeartRate] = useState<number | "">("");
  const [notes, setNotes] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When existingSession is passed for editing, load its values
  useEffect(() => {
    if (existingSession && isOpen) {
      setDate(existingSession.date || new Date().toISOString().split("T")[0]);
      setStartTime(existingSession.startTime || "07:30");
      const attrs = existingSession.attributes as TreadmillAttributes;
      setWorkoutMode(attrs?.workoutMode || "Jog");
      setDistanceKm(attrs?.distanceKm || 3.0);
      setDurationMins(attrs?.durationMins || 25);
      setSpeedKph(attrs?.speedKph || 7.2);
      setInclinePercentage(attrs?.inclinePercentage || 0);
      setCaloriesBurned(attrs?.caloriesBurned || 195);
      setAvgHeartRate(attrs?.avgHeartRate || "");
      setNotes(attrs?.notes || existingSession.description || "");
    } else if (isOpen) {
      setDate(defaultDate || new Date().toISOString().split("T")[0]);
      setStartTime(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      setError(null);
    }
  }, [existingSession, defaultDate, isOpen]);

  // Recalculate speed, pace, and calories dynamically as distance or duration changes
  const updateMetrics = (newDist: number, newDur: number) => {
    if (newDist > 0 && newDur > 0) {
      const calculatedSpeed = Number(((newDist / newDur) * 60).toFixed(1));
      setSpeedKph(calculatedSpeed);
      setCaloriesBurned(Math.round(newDist * 65));
    }
  };

  const handleDistanceChange = (val: number) => {
    const clamped = Math.max(0.1, Number(val.toFixed(2)));
    setDistanceKm(clamped);
    updateMetrics(clamped, durationMins);
  };

  const handleDurationChange = (val: number) => {
    const clamped = Math.max(0.1, Number(val.toFixed(1)));
    setDurationMins(clamped);
    updateMetrics(distanceKm, clamped);
  };

  const handleSpeedChange = (val: number) => {
    const clamped = Math.max(0.5, Number(val.toFixed(1)));
    setSpeedKph(clamped);
    if (durationMins > 0) {
      const newDist = Number(((clamped * durationMins) / 60).toFixed(2));
      setDistanceKm(newDist);
      setCaloriesBurned(Math.round(newDist * 65));
    }
  };

  // Pace display calculation
  const paceMinutes = distanceKm > 0 && durationMins > 0 ? durationMins / distanceKm : 0;
  const paceMins = Math.floor(paceMinutes);
  const paceSecs = Math.round((paceMinutes - paceMins) * 60);
  const formattedPace = distanceKm > 0 ? `${paceMins}:${String(paceSecs).padStart(2, "0")}` : "--:--";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const payload = {
        id: existingSession?.id,
        date,
        startTime,
        workoutMode,
        distanceKm,
        durationMins,
        speedKph,
        inclinePercentage,
        paceMinPerKm: formattedPace,
        caloriesBurned,
        avgHeartRate: avgHeartRate ? Number(avgHeartRate) : undefined,
        notes,
        userId: user?.email || user?.uid,
      };

      const url = "/api/fitness/treadmill";
      const method = existingSession ? "PUT" : "POST";

      const res = await authFetch(user, url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save treadmill workout");
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save workout");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-3xl border border-white/15 bg-slate-900/95 p-5 sm:p-6 shadow-2xl text-slate-100 flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {existingSession ? "Edit Treadmill Workout" : "Log Treadmill Workout"}
              </h2>
              <p className="text-xs text-slate-400">
                Easy-to-enter treadmill metrics with automatic speed, pace, & calorie calculations.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Workout Mode
            </label>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {WORKOUT_MODES.map((mode) => {
                const isSelected = workoutMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setWorkoutMode(mode.id)}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      isSelected
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm"
                        : "bg-slate-950/60 text-slate-400 border-white/5 hover:text-white hover:border-white/15"
                    }`}
                  >
                    <span className="text-sm">{mode.emoji}</span>
                    <span className="text-[10px] mt-0.5 text-center truncate w-full">{mode.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 mb-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                <span>Date</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 text-xs text-white focus:border-emerald-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 mb-1">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Start Time</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 text-xs text-white focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Key Metrics: Distance & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Distance Stepper */}
            <div className="p-3 rounded-2xl border border-white/10 bg-slate-950/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Distance</span>
                <span className="text-xs font-bold text-emerald-400 font-mono">{distanceKm} km</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDistanceChange(distanceKm - 0.5)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  value={distanceKm}
                  onChange={(e) => handleDistanceChange(parseFloat(e.target.value) || 0)}
                  className="flex-1 text-center font-bold text-sm bg-slate-900 border border-white/10 rounded-xl py-1.5 text-white focus:border-emerald-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleDistanceChange(distanceKm + 0.5)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Quick Distance Chips */}
              <div className="flex items-center justify-between gap-1 pt-1">
                {[1.5, 2.0, 3.0, 5.0, 10.0].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDistanceChange(d)}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  >
                    {d}k
                  </button>
                ))}
              </div>
            </div>

            {/* Duration Stepper */}
            <div className="p-3 rounded-2xl border border-white/10 bg-slate-950/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Duration</span>
                <span className="text-xs font-bold text-emerald-400 font-mono">{durationMins} mins</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDurationChange(durationMins - 5)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  value={durationMins}
                  onChange={(e) => handleDurationChange(parseFloat(e.target.value) || 0)}
                  className="flex-1 text-center font-bold text-sm bg-slate-900 border border-white/10 rounded-xl py-1.5 text-white focus:border-emerald-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleDurationChange(durationMins + 5)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Quick Duration Chips */}
              <div className="flex items-center justify-between gap-1 pt-1">
                {[15, 20, 30, 45, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleDurationChange(m)}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Secondary Metrics: Speed, Incline, Pace HUD */}
          <div className="grid grid-cols-3 gap-2.5 p-3 rounded-2xl border border-white/10 bg-slate-950/70">
            {/* Speed */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Gauge className="w-3 h-3 text-amber-400" />
                <span>Speed</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="any"
                  min="0.5"
                  value={speedKph}
                  onChange={(e) => handleSpeedChange(parseFloat(e.target.value) || 0)}
                  className="w-full font-bold text-xs bg-slate-900 border border-white/10 rounded-lg p-1.5 text-white focus:border-amber-400 focus:outline-none text-center"
                />
                <span className="text-[10px] text-slate-500 font-mono">km/h</span>
              </div>
            </div>

            {/* Incline */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Mountain className="w-3 h-3 text-cyan-400" />
                <span>Incline</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="any"
                  min="0"
                  max="15"
                  value={inclinePercentage}
                  onChange={(e) => setInclinePercentage(parseFloat(e.target.value) || 0)}
                  className="w-full font-bold text-xs bg-slate-900 border border-white/10 rounded-lg p-1.5 text-white focus:border-cyan-400 focus:outline-none text-center"
                />
                <span className="text-[10px] text-slate-500 font-mono">%</span>
              </div>
            </div>

            {/* Live Pace */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Flame className="w-3 h-3 text-rose-400" />
                <span>Pace / Cal</span>
              </label>
              <div className="flex flex-col justify-center">
                <span className="text-xs font-mono font-bold text-amber-300">{formattedPace} /km</span>
                <span className="text-[10px] font-mono text-slate-400">{caloriesBurned} kcal</span>
              </div>
            </div>
          </div>

          {/* Heart Rate & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Avg Heart Rate (bpm)
              </label>
              <input
                type="number"
                min="50"
                max="220"
                placeholder="e.g. 145"
                value={avgHeartRate}
                onChange={(e) => setAvgHeartRate(e.target.value ? parseInt(e.target.value, 10) : "")}
                className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 text-xs text-white focus:border-emerald-400 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Workout Notes
              </label>
              <input
                type="text"
                placeholder="e.g. Felt light, steady breath, finished with 1 min sprint"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 text-xs text-white focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSaving || distanceKm <= 0 || durationMins <= 0}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40 cursor-pointer shadow-md shadow-emerald-500/20"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{existingSession ? "Update Workout" : "Save Workout"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
