"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authFetch";
import { FitnessProfile } from "@/lib/timeline/types";
import {
  X,
  Ruler,
  Target,
  Scale,
  Save,
  Loader2,
  Check,
  ChevronRight,
  Info,
} from "lucide-react";

interface HeightProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (profile: FitnessProfile) => void;
  initialProfile?: FitnessProfile | null;
}

export function HeightProfileModal({
  isOpen,
  onClose,
  onSaved,
  initialProfile,
}: HeightProfileModalProps) {
  const { user } = useAuth();

  const [unitMode, setUnitMode] = useState<"cm" | "ft">("cm");
  const [heightCm, setHeightCm] = useState<string>("");
  const [feet, setFeet] = useState<string>("5");
  const [inches, setInches] = useState<string>("9");
  const [targetWeightKg, setTargetWeightKg] = useState<string>("");
  const [startingWeightKg, setStartingWeightKg] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProfile) {
      if (initialProfile.heightCm) {
        setHeightCm(initialProfile.heightCm.toString());
        // Calculate feet/inches
        const totalInches = initialProfile.heightCm / 2.54;
        const ft = Math.floor(totalInches / 12);
        const inc = Math.round(totalInches % 12);
        setFeet(ft.toString());
        setInches(inc.toString());
      }
      if (initialProfile.heightUnit) {
        setUnitMode(initialProfile.heightUnit);
      }
      if (initialProfile.targetWeightKg) {
        setTargetWeightKg(initialProfile.targetWeightKg.toString());
      }
      if (initialProfile.startingWeightKg) {
        setStartingWeightKg(initialProfile.startingWeightKg.toString());
      }
    }
  }, [initialProfile, isOpen]);

  if (!isOpen) return null;

  const handleFeetInchesChange = (newFeet: string, newInches: string) => {
    setFeet(newFeet);
    setInches(newInches);
    const f = parseFloat(newFeet) || 0;
    const i = parseFloat(newInches) || 0;
    const totalCm = Math.round((f * 12 + i) * 2.54 * 10) / 10;
    setHeightCm(totalCm.toString());
  };

  const handleCmChange = (val: string) => {
    setHeightCm(val);
    const cm = parseFloat(val);
    if (!isNaN(cm) && cm > 0) {
      const totalInches = cm / 2.54;
      const ft = Math.floor(totalInches / 12);
      const inc = Math.round(totalInches % 12);
      setFeet(ft.toString());
      setInches(inc.toString());
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      const parsedCm = parseFloat(heightCm);
      if (isNaN(parsedCm) || parsedCm < 50 || parsedCm > 280) {
        throw new Error("Please enter a valid height between 50 and 280 cm (approx 2 - 9 ft)");
      }

      const payload = {
        heightCm: parsedCm,
        heightUnit: unitMode,
        targetWeightKg: targetWeightKg ? parseFloat(targetWeightKg) : undefined,
        startingWeightKg: startingWeightKg ? parseFloat(startingWeightKg) : undefined,
      };

      const res = await authFetch(user, "/api/fitness/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to save profile");
      }

      const data = await res.json();
      onSaved(data.profile);
      onClose();
    } catch (err: any) {
      setError(err.message || "Something went wrong saving height profile");
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
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Ruler className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Body Profile & Height</h3>
              <p className="text-xs text-slate-400">Used to calculate BMI and healthy targets</p>
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

        <form onSubmit={handleSave} className="space-y-4">
          {/* Unit Mode Selector */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300">Height Unit</label>
            <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setUnitMode("cm")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  unitMode === "cm"
                    ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Centimeters (cm)
              </button>
              <button
                type="button"
                onClick={() => setUnitMode("ft")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  unitMode === "ft"
                    ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Feet & Inches (ft/in)
              </button>
            </div>
          </div>

          {/* Height Input */}
          {unitMode === "cm" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Height (cm)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="50"
                  max="280"
                  required
                  value={heightCm}
                  onChange={(e) => handleCmChange(e.target.value)}
                  placeholder="e.g. 175"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-lg font-bold text-white font-mono focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <span className="absolute right-4 top-3.5 text-xs text-slate-400 font-semibold">
                  cm
                </span>
              </div>
              {/* Quick Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {[160, 165, 170, 175, 180, 185].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleCmChange(preset.toString())}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition border border-white/5 cursor-pointer"
                  >
                    {preset} cm
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Height (Feet & Inches)</label>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <input
                    type="number"
                    min="2"
                    max="8"
                    required
                    value={feet}
                    onChange={(e) => handleFeetInchesChange(e.target.value, inches)}
                    placeholder="Feet"
                    className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-lg font-bold text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="absolute right-3 top-3.5 text-xs text-slate-400 font-semibold">
                    ft
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="11"
                    required
                    value={inches}
                    onChange={(e) => handleFeetInchesChange(feet, e.target.value)}
                    placeholder="Inches"
                    className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-lg font-bold text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="absolute right-3 top-3.5 text-xs text-slate-400 font-semibold">
                    in
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Equivalent to ≈ <span className="text-emerald-300 font-bold">{heightCm || "--"} cm</span>
              </p>
            </div>
          )}

          {/* Optional Weight Targets */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-emerald-400" />
                <span>Target Weight</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="30"
                  max="300"
                  value={targetWeightKg}
                  onChange={(e) => setTargetWeightKg(e.target.value)}
                  placeholder="e.g. 70"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-bold text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
                <span className="absolute right-3 top-2.5 text-[11px] text-slate-400 font-semibold">
                  kg
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <Scale className="w-3.5 h-3.5 text-cyan-400" />
                <span>Starting Weight</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="30"
                  max="300"
                  value={startingWeightKg}
                  onChange={(e) => setStartingWeightKg(e.target.value)}
                  placeholder="e.g. 78"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-bold text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
                <span className="absolute right-3 top-2.5 text-[11px] text-slate-400 font-semibold">
                  kg
                </span>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="pt-3 flex items-center justify-end gap-2">
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
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 text-xs transition cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Profile</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
