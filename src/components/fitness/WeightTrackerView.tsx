"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authFetch";
import { LifeEvent, BodyWeightAttributes, FitnessProfile } from "@/lib/timeline/types";
import { HeightProfileModal } from "./HeightProfileModal";
import { WeightEntryModal } from "./WeightEntryModal";
import {
  Scale,
  Ruler,
  Target,
  TrendingDown,
  TrendingUp,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  Clock,
  Sparkles,
  Info,
  CheckCircle2,
  AlertCircle,
  Activity,
  ArrowRight,
} from "lucide-react";

interface WeightSummary {
  currentWeightKg: number | null;
  startWeightKg: number | null;
  targetWeightKg: number | null;
  netChangeKg: number;
  minWeightKg: number;
  maxWeightKg: number;
  heightCm: number | null;
  heightUnit: "cm" | "ft";
  bmi: number | null;
  bmiCategory: "Underweight" | "Normal" | "Overweight" | "Obese" | null;
  lastWeighedDate: string | null;
  totalLogs: number;
}

export function WeightTrackerView() {
  const { user, userId, isSignedIn } = useAuth();
  const qUserId = user?.email || user?.uid || userId || "";

  const [logs, setLogs] = useState<LifeEvent[]>([]);
  const [summary, setSummary] = useState<WeightSummary>({
    currentWeightKg: null,
    startWeightKg: null,
    targetWeightKg: null,
    netChangeKg: 0,
    minWeightKg: 0,
    maxWeightKg: 0,
    heightCm: null,
    heightUnit: "cm",
    bmi: null,
    bmiCategory: null,
    lastWeighedDate: null,
    totalLogs: 0,
  });
  const [profile, setProfile] = useState<FitnessProfile | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isHeightModalOpen, setIsHeightModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<LifeEvent | null>(null);

  const fetchWeightData = useCallback(async () => {
    if (!isSignedIn) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await authFetch(user, `/api/fitness/weight?userId=${encodeURIComponent(qUserId)}`);
      if (!res.ok) throw new Error("Failed to load weight records");

      const data = await res.json();
      setLogs(data.logs || []);
      if (data.summary) {
        setSummary(data.summary);
      }
      if (data.profile) {
        setProfile(data.profile);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load weight tracking data");
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, user, qUserId]);

  useEffect(() => {
    fetchWeightData();
  }, [fetchWeightData]);

  const handleDeleteLog = async (id: string) => {
    if (!confirm("Are you sure you want to delete this weight log?")) return;
    try {
      const res = await authFetch(user, `/api/fitness/weight?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete log");

      setStatusMessage("Weight log deleted");
      await fetchWeightData();
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      alert(err.message || "Failed to delete");
    }
  };

  // Helper for height display in ft/in
  const formatHeight = (cm: number | null) => {
    if (!cm) return "--";
    const totalInches = cm / 2.54;
    const ft = Math.floor(totalInches / 12);
    const inc = Math.round(totalInches % 12);
    return `${cm} cm (${ft}'${inc}")`;
  };

  // Healthy weight range calculation: BMI 18.5 to 24.9
  const healthyWeightRange = summary.heightCm
    ? {
        min: Math.round(18.5 * Math.pow(summary.heightCm / 100, 2) * 10) / 10,
        max: Math.round(24.9 * Math.pow(summary.heightCm / 100, 2) * 10) / 10,
      }
    : null;

  // Target progress calculation
  const targetDelta =
    summary.currentWeightKg && summary.targetWeightKg
      ? Math.round((summary.currentWeightKg - summary.targetWeightKg) * 10) / 10
      : null;

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Feedback Banners */}
      {statusMessage && (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-300">
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

      {/* Biometrics Hero Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Height & Ideal Range Card */}
        <div className="p-4 rounded-3xl border border-white/10 bg-slate-900/80 shadow-lg flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Ruler className="w-4 h-4 text-emerald-400" />
              <span>Height</span>
            </span>
            <button
              type="button"
              onClick={() => setIsHeightModalOpen(true)}
              className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 hover:underline transition cursor-pointer"
            >
              {summary.heightCm ? "Edit Height" : "+ Set Height"}
            </button>
          </div>

          <div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono">
              {summary.heightCm ? `${summary.heightCm}` : "--"}
              {summary.heightCm && <span className="text-xs text-slate-400 ml-1">cm</span>}
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              {summary.heightCm ? formatHeight(summary.heightCm) : "Set height to compute BMI"}
            </p>
          </div>

          <div className="pt-2 border-t border-white/5 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Healthy range:</span>
            <span className="font-mono font-bold text-slate-200">
              {healthyWeightRange
                ? `${healthyWeightRange.min} - ${healthyWeightRange.max} kg`
                : "--"}
            </span>
          </div>
        </div>

        {/* Current Weight Card */}
        <div className="p-4 rounded-3xl border border-white/10 bg-slate-900/80 shadow-lg flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-cyan-400" />
              <span>Current Weight</span>
            </span>
            {summary.lastWeighedDate && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 font-mono">
                {summary.lastWeighedDate}
              </span>
            )}
          </div>

          <div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono">
              {summary.currentWeightKg !== null ? summary.currentWeightKg : "--"}
              {summary.currentWeightKg !== null && <span className="text-xs text-slate-400 ml-1">kg</span>}
            </div>

            {summary.startWeightKg !== null && summary.currentWeightKg !== null && (
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                <span>Start: {summary.startWeightKg} kg</span>
                <span className="text-slate-600">·</span>
                <span
                  className={`font-mono font-bold ${
                    summary.netChangeKg < 0
                      ? "text-emerald-400"
                      : summary.netChangeKg > 0
                      ? "text-amber-400"
                      : "text-slate-300"
                  }`}
                >
                  {summary.netChangeKg > 0 ? `+${summary.netChangeKg}` : summary.netChangeKg} kg
                </span>
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-white/5 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Total logs:</span>
            <span className="font-mono font-bold text-slate-200">{summary.totalLogs} recorded</span>
          </div>
        </div>

        {/* BMI Card */}
        <div className="p-4 rounded-3xl border border-white/10 bg-slate-900/80 shadow-lg flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-indigo-400" />
              <span>BMI Score</span>
            </span>
            {summary.bmiCategory && (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  summary.bmiCategory === "Normal"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : summary.bmiCategory === "Overweight"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : summary.bmiCategory === "Obese"
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                }`}
              >
                {summary.bmiCategory}
              </span>
            )}
          </div>

          <div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono">
              {summary.bmi !== null ? summary.bmi : "--"}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {summary.heightCm
                ? "Optimal BMI is 18.5 – 24.9"
                : "Set height to see your BMI category"}
            </p>
          </div>

          {/* Mini BMI Spectrum Bar */}
          <div className="pt-2 border-t border-white/5 space-y-1">
            <div className="h-1.5 w-full rounded-full bg-slate-950 flex overflow-hidden">
              <div className="w-1/4 bg-sky-400/80" title="Underweight (< 18.5)" />
              <div className="w-1/4 bg-emerald-500/90" title="Normal (18.5 - 24.9)" />
              <div className="w-1/4 bg-amber-500/90" title="Overweight (25 - 29.9)" />
              <div className="w-1/4 bg-rose-500/90" title="Obese (>= 30)" />
            </div>
            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
              <span>&lt;18.5</span>
              <span>24.9</span>
              <span>29.9</span>
              <span>30+</span>
            </div>
          </div>
        </div>

        {/* Target Weight Goal Card */}
        <div className="p-4 rounded-3xl border border-white/10 bg-slate-900/80 shadow-lg flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Target className="w-4 h-4 text-amber-400" />
              <span>Target Goal</span>
            </span>
            <button
              type="button"
              onClick={() => setIsHeightModalOpen(true)}
              className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 hover:underline transition cursor-pointer"
            >
              {summary.targetWeightKg ? "Edit Target" : "+ Set Target"}
            </button>
          </div>

          <div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono">
              {summary.targetWeightKg !== null ? summary.targetWeightKg : "--"}
              {summary.targetWeightKg !== null && <span className="text-xs text-slate-400 ml-1">kg</span>}
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              {targetDelta !== null ? (
                targetDelta === 0 ? (
                  <span className="text-emerald-400 font-bold">🎯 Goal Reached!</span>
                ) : targetDelta > 0 ? (
                  <span>{targetDelta} kg to lose</span>
                ) : (
                  <span>{Math.abs(targetDelta)} kg to gain</span>
                )
              ) : (
                "Set a target weight to track progress"
              )}
            </p>
          </div>

          <div className="pt-2 border-t border-white/5 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Progress:</span>
            <span className="font-mono font-bold text-slate-200">
              {summary.minWeightKg && summary.maxWeightKg
                ? `Range ${summary.minWeightKg} - ${summary.maxWeightKg} kg`
                : "--"}
            </span>
          </div>
        </div>
      </div>

      {/* Action Bar: + Log Weight & Voice AI */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>Weight History & Logs</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-mono">
              {logs.length}
            </span>
          </h3>
          <p className="text-xs text-slate-400">Track and monitor weigh-in consistency</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEditingLog(null);
              setIsWeightModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 transition cursor-pointer shadow-md shadow-cyan-500/20 active:scale-95"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            <span>Log Weight</span>
          </button>
        </div>
      </div>

      {/* Weight History Feed */}
      {logs.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto border border-cyan-500/20">
            <Scale className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-slate-200">No weight entries logged yet</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Click <strong>Log Weight</strong> to record your current weight and keep track of your body metrics over time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {logs.map((log: any) => {
            const attrs = log.attributes as BodyWeightAttributes;
            const delta = log.deltaFromPrevious;
            return (
              <div
                key={log.id}
                className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-md hover:border-white/20 transition space-y-3"
              >
                {/* Top Row: Date, Time & Actions */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">{log.date}</span>
                    {log.startTime && (
                      <span className="text-[11px] text-slate-400 font-mono">
                        at {log.startTime}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLog(log);
                        setIsWeightModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      title="Edit Entry"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteLog(log.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/10 transition cursor-pointer"
                      title="Delete Entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Main Metric Row: Big Weight + Delta */}
                <div className="flex items-baseline justify-between p-3 rounded-xl bg-slate-950/60 border border-white/5">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Weight</span>
                    <p className="text-2xl font-black text-white font-mono">
                      {attrs?.weightKg}{" "}
                      <span className="text-xs font-normal text-slate-400">kg</span>
                    </p>
                  </div>

                  {delta !== null && delta !== undefined && (
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Change</span>
                      <p
                        className={`text-sm font-black font-mono flex items-center justify-end gap-0.5 ${
                          delta < 0
                            ? "text-emerald-400"
                            : delta > 0
                            ? "text-amber-400"
                            : "text-slate-400"
                        }`}
                      >
                        {delta < 0 ? (
                          <TrendingDown className="w-3.5 h-3.5" />
                        ) : delta > 0 ? (
                          <TrendingUp className="w-3.5 h-3.5" />
                        ) : null}
                        <span>
                          {delta > 0 ? `+${delta}` : delta} kg
                        </span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Bottom Row: BMI, Body Fat, Waist & Notes */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pt-1 border-t border-white/5">
                  <div className="flex flex-wrap items-center gap-2">
                    {attrs?.bmiAtTime && (
                      <span className="text-[11px] font-mono text-indigo-300">
                        BMI {attrs.bmiAtTime}
                      </span>
                    )}

                    {attrs?.bodyFatPercentage && (
                      <span className="text-[11px] font-mono text-cyan-300">
                        {attrs.bodyFatPercentage}% fat
                      </span>
                    )}

                    {attrs?.waistCm && (
                      <span className="text-[11px] font-mono text-slate-300">
                        {attrs.waistCm} cm waist
                      </span>
                    )}
                  </div>

                  {log.description && (
                    <span className="text-[11px] text-slate-400 italic truncate max-w-[180px]">
                      {log.description}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <HeightProfileModal
        isOpen={isHeightModalOpen}
        onClose={() => setIsHeightModalOpen(false)}
        onSaved={fetchWeightData}
        initialProfile={profile}
      />

      <WeightEntryModal
        isOpen={isWeightModalOpen}
        onClose={() => {
          setIsWeightModalOpen(false);
          setEditingLog(null);
        }}
        onSaved={fetchWeightData}
        existingEvent={editingLog}
        heightCm={summary.heightCm}
        lastWeightKg={summary.currentWeightKg}
      />
    </div>
  );
}
