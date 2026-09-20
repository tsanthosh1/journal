"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authFetch";
import { LifeEvent, BodyWeightAttributes } from "@/lib/timeline/types";
import { calculateBmi } from "@/lib/fitness/bmi";
import {
  X,
  Scale,
  Calendar,
  Clock,
  Save,
  Loader2,
  Plus,
  Minus,
  Sparkles,
  Info,
} from "lucide-react";

interface WeightEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  existingEvent?: LifeEvent | null;
  heightCm?: number | null;
  lastWeightKg?: number | null;
}

export function WeightEntryModal({
  isOpen,
  onClose,
  onSaved,
  existingEvent,
  heightCm,
  lastWeightKg,
}: WeightEntryModalProps) {
  const { user } = useAuth();

  const now = new Date();
  const defaultDate = now.toISOString().split("T")[0];
  const defaultTime = now.toTimeString().slice(0, 5);

  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(defaultTime);
  const [weightKg, setWeightKg] = useState<number>(() => lastWeightKg || 70.0);
  const [weightInput, setWeightInput] = useState<string>(() => (lastWeightKg || 70.0).toString());
  const [bodyFatPercentage, setBodyFatPercentage] = useState<string>("");
  const [waistCm, setWaistCm] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingEvent) {
      const attrs = existingEvent.attributes as BodyWeightAttributes;
      setDate(existingEvent.date);
      setStartTime(existingEvent.startTime || defaultTime);
      const w = attrs?.weightKg || 70;
      setWeightKg(w);
      setWeightInput(w.toString());
      setBodyFatPercentage(attrs?.bodyFatPercentage ? attrs.bodyFatPercentage.toString() : "");
      setWaistCm(attrs?.waistCm ? attrs.waistCm.toString() : "");
      setNotes(attrs?.notes || existingEvent.description || "");
    } else {
      const initialW = lastWeightKg || 70.0;
      setDate(now.toISOString().split("T")[0]);
      setStartTime(now.toTimeString().slice(0, 5));
      setWeightKg(initialW);
      setWeightInput(initialW.toString());
      setBodyFatPercentage("");
      setWaistCm("");
      setNotes("");
    }
  }, [existingEvent, isOpen, lastWeightKg]);

  if (!isOpen) return null;

  const handleWeightChange = (newVal: number) => {
    const clamped = Math.max(20, Math.min(350, Math.round(newVal * 10) / 10));
    setWeightKg(clamped);
    setWeightInput(clamped.toString());
  };

  const handleInputChange = (raw: string) => {
    setWeightInput(raw);
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed > 0) {
      setWeightKg(Math.round(parsed * 10) / 10);
    }
  };

  // Live BMI Preview
  const liveBmi = heightCm && weightKg > 0 ? calculateBmi(weightKg, heightCm) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      const parsedWeight = parseFloat(weightInput);
      if (isNaN(parsedWeight) || parsedWeight <= 0) {
        throw new Error("Please enter a valid weight in kg");
      }

      const payload = {
        id: existingEvent?.id,
        weightKg: parsedWeight,
        date,
        startTime,
        bodyFatPercentage: bodyFatPercentage ? parseFloat(bodyFatPercentage) : undefined,
        waistCm: waistCm ? parseFloat(waistCm) : undefined,
        notes: notes.trim(),
      };

      const url = "/api/fitness/weight";
      const method = existingEvent ? "PUT" : "POST";

      const res = await authFetch(user, url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to log weight");
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to record weight entry");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-5 sm:p-6 shadow-2xl space-y-5 text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {existingEvent ? "Edit Weight Entry" : "Log Weight"}
              </h3>
              <p className="text-xs text-slate-400">Track your daily body weight & metrics</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Main Weight Input & Steppers */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-white/10 text-center space-y-3">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Body Weight (kg)
            </label>

            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => handleWeightChange(weightKg - 0.5)}
                className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-bold transition border border-white/10 cursor-pointer"
                title="Decrease 0.5 kg"
              >
                -0.5
              </button>

              <button
                type="button"
                onClick={() => handleWeightChange(weightKg - 0.1)}
                className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-bold transition border border-white/10 cursor-pointer"
                title="Decrease 0.1 kg"
              >
                -0.1
              </button>

              <div className="relative inline-flex items-center justify-center">
                <input
                  type="number"
                  step="0.1"
                  min="20"
                  max="350"
                  required
                  value={weightInput}
                  onChange={(e) => handleInputChange(e.target.value)}
                  className="w-28 text-center text-3xl sm:text-4xl font-black text-white font-mono bg-transparent border-b-2 border-cyan-500 focus:outline-none focus:border-cyan-400"
                />
                <span className="text-sm font-bold text-slate-400 ml-1">kg</span>
              </div>

              <button
                type="button"
                onClick={() => handleWeightChange(weightKg + 0.1)}
                className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-bold transition border border-white/10 cursor-pointer"
                title="Increase 0.1 kg"
              >
                +0.1
              </button>

              <button
                type="button"
                onClick={() => handleWeightChange(weightKg + 0.5)}
                className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-bold transition border border-white/10 cursor-pointer"
                title="Increase 0.5 kg"
              >
                +0.5
              </button>
            </div>

            {/* Live BMI Indicator */}
            {liveBmi && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs">
                <span className="text-slate-400">BMI:</span>
                <span className="font-mono font-bold text-white">{liveBmi.bmi}</span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    liveBmi.category === "Normal"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : liveBmi.category === "Overweight"
                      ? "bg-amber-500/20 text-amber-300"
                      : liveBmi.category === "Obese"
                      ? "bg-rose-500/20 text-rose-300"
                      : "bg-sky-500/20 text-sky-300"
                  }`}
                >
                  {liveBmi.category}
                </span>
              </div>
            )}
          </div>

          {/* Date & Time Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Date</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-semibold text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Time</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-semibold text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Optional Body Fat & Waist */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Body Fat % (Optional)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="3"
                  max="60"
                  value={bodyFatPercentage}
                  onChange={(e) => setBodyFatPercentage(e.target.value)}
                  placeholder="e.g. 18.5"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-bold text-white font-mono focus:border-cyan-500 focus:outline-none"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-400">%</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Waist (cm, Optional)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="40"
                  max="200"
                  value={waistCm}
                  onChange={(e) => setWaistCm(e.target.value)}
                  placeholder="e.g. 82"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-bold text-white font-mono focus:border-cyan-500 focus:outline-none"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-400">cm</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Notes (Optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Morning weighing after fasting, felt light"
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-5 py-2.5 text-xs transition cursor-pointer shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{existingEvent ? "Update Weight" : "Save Weight"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
