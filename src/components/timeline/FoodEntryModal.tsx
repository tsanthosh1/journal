"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  FoodPrimaryAnchor,
  FoodOccasion,
  FoodOccasionType,
  LifeEvent,
  MasterFoodItem,
} from "@/lib/timeline/types";
import { authFetch } from "@/lib/authFetch";
import { useAuth } from "@/context/AuthContext";
import {
  X,
  Sparkles,
  Utensils,
  Sun,
  Moon,
  Clock,
  Flame,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  Tag,
  Wand2,
} from "lucide-react";

interface FoodEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  date: string; // "YYYY-MM-DD"
  defaultAnchor?: FoodPrimaryAnchor;
  defaultTime?: string; // "HH:MM"
  existingEvent?: LifeEvent | null;
}

const OCCASIONS_BY_ANCHOR: Record<
  FoodPrimaryAnchor,
  { occasion: FoodOccasion; type: FoodOccasionType }[]
> = {
  Breakfast: [
    { occasion: "Breakfast", type: "Main Meal" },
    { occasion: "Pre-Breakfast Snack", type: "Snack" },
    { occasion: "Post-Breakfast Snack", type: "Snack" },
  ],
  Lunch: [
    { occasion: "Lunch / Brunch", type: "Main Meal" },
    { occasion: "Pre-Lunch Snack", type: "Snack" },
    { occasion: "Post-Lunch Snack", type: "Snack" },
  ],
  Dinner: [
    { occasion: "Dinner / Supper", type: "Main Meal" },
    { occasion: "Pre-Dinner Snack", type: "Snack" },
    { occasion: "Late-Night Snack", type: "Snack" },
  ],
};

export function FoodEntryModal({
  isOpen,
  onClose,
  onSaved,
  date,
  defaultAnchor = "Breakfast",
  defaultTime,
  existingEvent,
}: FoodEntryModalProps) {
  const { user, userId } = useAuth();

  // Form Field States
  const [title, setTitle] = useState("");
  const [primaryAnchor, setPrimaryAnchor] = useState<FoodPrimaryAnchor>(defaultAnchor);
  const [occasion, setOccasion] = useState<FoodOccasion>("Breakfast");
  const [startTime, setStartTime] = useState("");
  const [foodItems, setFoodItems] = useState<string[]>([]);
  const [newItemInput, setNewItemInput] = useState("");
  const [caloriesEst, setCaloriesEst] = useState<string>("");
  const [dietaryNotes, setDietaryNotes] = useState("");

  // AI Prompt Assistant State (under the form)
  const [aiPrompt, setAiPrompt] = useState("");
  const [isApplyingAi, setIsApplyingAi] = useState(false);
  const [aiAppliedMsg, setAiAppliedMsg] = useState<string | null>(null);

  // Form Save / Delete State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Master Food Items Library
  const [masterItems, setMasterItems] = useState<MasterFoodItem[]>([]);

  // Fetch Master Food Items
  useEffect(() => {
    if (!isOpen) return;

    async function loadMasterItems() {
      try {
        const qUserId = user?.email || user?.uid || userId || "";
        const res = await authFetch(user, `/api/timeline/food/master-items?userId=${encodeURIComponent(qUserId)}`);
        if (res.ok) {
          const data = await res.json();
          setMasterItems(data.items || []);
        }
      } catch (err) {
        console.warn("Could not load master food items:", err);
      }
    }

    loadMasterItems();
  }, [isOpen, user, userId]);

  // Initialize fields on open or existingEvent change
  useEffect(() => {
    if (!isOpen) return;

    if (existingEvent) {
      setTitle(existingEvent.title || "");
      const anchor = (existingEvent.attributes?.primaryAnchor as FoodPrimaryAnchor) || defaultAnchor;
      setPrimaryAnchor(anchor);
      setOccasion(
        (existingEvent.attributes?.occasion as FoodOccasion) ||
          (anchor === "Lunch" ? "Lunch / Brunch" : anchor === "Dinner" ? "Dinner / Supper" : "Breakfast")
      );
      setStartTime(existingEvent.startTime || "");
      setFoodItems(Array.isArray(existingEvent.attributes?.foodItems) ? existingEvent.attributes.foodItems : []);
      setCaloriesEst(existingEvent.attributes?.caloriesEst ? String(existingEvent.attributes.caloriesEst) : "");
      setDietaryNotes(existingEvent.attributes?.dietaryNotes || existingEvent.description || "");
    } else {
      const initialAnchor = defaultAnchor || "Breakfast";
      setPrimaryAnchor(initialAnchor);
      const defaultOcc = OCCASIONS_BY_ANCHOR[initialAnchor][0].occasion;
      setOccasion(defaultOcc);
      setTitle(`${initialAnchor} Meal`);
      setStartTime(defaultTime || "");
      setFoodItems([]);
      setCaloriesEst("");
      setDietaryNotes("");
    }
    setAiPrompt("");
    setAiAppliedMsg(null);
    setFeedbackMsg(null);
  }, [isOpen, existingEvent, defaultAnchor, defaultTime]);

  // When primaryAnchor changes, ensure occasion matches allowed occasions for that anchor
  const handleAnchorChange = (newAnchor: FoodPrimaryAnchor) => {
    setPrimaryAnchor(newAnchor);
    const allowed = OCCASIONS_BY_ANCHOR[newAnchor];
    const isCurrentAllowed = allowed.some((o) => o.occasion === occasion);
    if (!isCurrentAllowed) {
      setOccasion(allowed[0].occasion);
    }
    if (!existingEvent) {
      setTitle(`${newAnchor} Meal`);
    }
  };

  // Autocomplete filtering from Master Food Items
  const filteredMasterSuggestions = useMemo(() => {
    const search = newItemInput.trim().toLowerCase();
    return masterItems
      .filter((m) => {
        if (foodItems.includes(m.name)) return false;
        if (!search) return true;
        return m.name.toLowerCase().includes(search);
      })
      .slice(0, 8);
  }, [masterItems, newItemInput, foodItems]);

  const handleAddFoodItem = (itemName: string) => {
    const trimmed = itemName.trim();
    if (!trimmed || foodItems.includes(trimmed)) return;

    setFoodItems([...foodItems, trimmed]);
    setNewItemInput("");

    // Auto-fill default calories from master if calories field is empty
    const matchedMaster = masterItems.find((m) => m.name.toLowerCase() === trimmed.toLowerCase());
    if (matchedMaster?.defaultCalories && !caloriesEst) {
      setCaloriesEst(String(matchedMaster.defaultCalories));
    }
  };

  const handleRemoveFoodItem = (itemToRemove: string) => {
    setFoodItems(foodItems.filter((i) => i !== itemToRemove));
  };

  // APPLY AI CHANGES LIVE TO FORM (without saving to database yet)
  const handleApplyAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    setIsApplyingAi(true);
    setAiAppliedMsg(null);

    try {
      const qUserId = user?.email || user?.uid || userId || "";
      const currentFieldsPayload = {
        title,
        primaryAnchor,
        occasion,
        startTime,
        foodItems,
        caloriesEst: caloriesEst ? parseFloat(caloriesEst) : null,
        dietaryNotes,
      };

      const res = await authFetch(user, "/api/timeline/food/cell-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          primaryAnchor,
          prompt: aiPrompt.trim(),
          existingEventId: existingEvent?.id,
          currentFields: currentFieldsPayload,
          dryRun: true, // Tells API to return updated fields without committing to DB!
          userId: qUserId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to apply AI changes");
      }

      const data = await res.json();
      const updated = data.updatedFields;

      if (updated) {
        if (updated.title) setTitle(updated.title);
        if (updated.primaryAnchor) {
          setPrimaryAnchor(updated.primaryAnchor);
        }
        if (updated.occasion) {
          setOccasion(updated.occasion);
        }
        if (updated.startTime !== undefined) {
          setStartTime(updated.startTime || "");
        }
        if (Array.isArray(updated.foodItems)) {
          setFoodItems(updated.foodItems);
        }
        if (updated.caloriesEst !== undefined && updated.caloriesEst !== null) {
          setCaloriesEst(String(updated.caloriesEst));
        }
        if (updated.dietaryNotes !== undefined) {
          setDietaryNotes(updated.dietaryNotes || "");
        }

        setAiAppliedMsg(data.changeSummary || "Changes applied to form! Review above and click Save Entry.");
        setAiPrompt("");
      }
    } catch (err: any) {
      alert(err.message || "Failed to process AI changes");
    } finally {
      setIsApplyingAi(false);
    }
  };

  // SUBMIT FORM TO DATABASE
  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedbackMsg(null);

    try {
      const qUserId = user?.email || user?.uid || userId || "";
      const currentOccasionSpec = OCCASIONS_BY_ANCHOR[primaryAnchor].find((o) => o.occasion === occasion);
      const occasionType: FoodOccasionType = currentOccasionSpec ? currentOccasionSpec.type : "Main Meal";

      const attributes = {
        primaryAnchor,
        occasionType,
        occasion,
        mealType: occasionType === "Snack" ? "Snack" : primaryAnchor,
        foodItems,
        caloriesEst: caloriesEst ? parseFloat(caloriesEst) : null,
        dietaryNotes: dietaryNotes.trim() || null,
      };

      if (existingEvent?.id) {
        const res = await authFetch(user, `/api/timeline/events/${existingEvent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim() || `${primaryAnchor} Meal`,
            description: dietaryNotes.trim() || title.trim(),
            startTime: startTime || null,
            attributes,
          }),
        });

        if (!res.ok) throw new Error("Failed to update meal event");
      } else {
        const res = await authFetch(user, "/api/timeline/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: qUserId,
            date,
            title: title.trim() || `${primaryAnchor} Meal`,
            description: dietaryNotes.trim() || title.trim(),
            activityType: "FOOD",
            startTime: startTime || null,
            tags: ["food", primaryAnchor.toLowerCase(), occasionType.toLowerCase()],
            attributes,
          }),
        });

        if (!res.ok) throw new Error("Failed to create meal event");
      }

      // Sync food items to master food items library in background
      if (foodItems.length > 0) {
        for (const item of foodItems) {
          try {
            await authFetch(user, "/api/timeline/food/master-items", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: item,
                defaultAnchor: primaryAnchor,
                defaultOccasion: occasion,
                defaultCalories: caloriesEst ? parseFloat(caloriesEst) : undefined,
                userId: qUserId,
              }),
            });
          } catch {}
        }
      }

      setFeedbackMsg({ type: "success", text: "Saved successfully!" });
      setTimeout(() => {
        onSaved();
        onClose();
      }, 400);
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: err.message || "Failed to save meal" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete
  const handleDelete = async () => {
    if (!existingEvent?.id) return;
    if (!confirm(`Delete "${existingEvent.title}"?`)) return;

    setIsSubmitting(true);
    try {
      const res = await authFetch(user, `/api/timeline/events/${existingEvent.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete event");
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message || "Failed to delete meal");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/15 bg-slate-900 p-5 sm:p-7 shadow-2xl space-y-5 text-slate-100">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
                <Utensils className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
                {existingEvent ? "Edit Food Entry" : "Log New Meal"}
              </span>
            </div>
            <div className="text-xs text-slate-400">
              Target: <span className="font-semibold text-slate-200">{date}</span> •{" "}
              <span className="font-semibold text-slate-200">{primaryAnchor} Anchor</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || isApplyingAi}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Save Feedback message banner */}
        {feedbackMsg && (
          <div
            className={`flex items-center gap-2 rounded-xl p-3 text-xs ${
              feedbackMsg.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border border-rose-500/30 text-rose-300"
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* DIRECT FORM (Always Visible) */}
        <form id="food-entry-form" onSubmit={handleSaveEntry} className="space-y-4">
          {/* Meal Title */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Meal / Entry Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Masala Dosa & Sambar, Protein Shake"
              required
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none transition"
            />
          </div>

          {/* Primary Anchor Segmented Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Primary Anchor</label>
            <div className="grid grid-cols-3 gap-2">
              {(["Breakfast", "Lunch", "Dinner"] as FoodPrimaryAnchor[]).map((anchor) => {
                const Icon = anchor === "Breakfast" ? Sun : anchor === "Lunch" ? Utensils : Moon;
                const isSelected = primaryAnchor === anchor;
                return (
                  <button
                    key={anchor}
                    type="button"
                    onClick={() => handleAnchorChange(anchor)}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                      isSelected
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md shadow-amber-500/10"
                        : "bg-slate-950/60 text-slate-400 border-white/10 hover:text-white"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{anchor}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Occasion Dropdown & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Specific Occasion</label>
              <select
                value={occasion}
                onChange={(e) => setOccasion(e.target.value as FoodOccasion)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-amber-400 focus:outline-none transition cursor-pointer"
              >
                {OCCASIONS_BY_ANCHOR[primaryAnchor].map((o) => (
                  <option key={o.occasion} value={o.occasion} className="bg-slate-900 text-white">
                    {o.occasion} ({o.type})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Meal Time (Optional)</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-amber-400 focus:outline-none [color-scheme:dark] transition cursor-pointer"
              />
            </div>
          </div>

          {/* Food Items Consumed (Tag Chip List & Master Autocomplete) */}
          <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/70 p-3.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-amber-400" />
                <span>Food Items Consumed</span>
              </label>
              <span className="text-[10px] text-slate-400">
                {foodItems.length} item{foodItems.length === 1 ? "" : "s"}
              </span>
            </div>

            {/* Chips List */}
            <div className="flex flex-wrap gap-1.5 min-h-[30px] items-center">
              {foodItems.length === 0 ? (
                <span className="text-xs text-slate-500 italic">No food items added yet.</span>
              ) : (
                foodItems.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/20 text-amber-200 border border-amber-500/40 px-2.5 py-1 text-xs font-semibold"
                  >
                    <span>{item}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFoodItem(item)}
                      className="text-amber-400 hover:text-white transition cursor-pointer"
                      title="Remove item"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Add Input */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={newItemInput}
                onChange={(e) => setNewItemInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddFoodItem(newItemInput);
                  }
                }}
                placeholder="Type an item or select from master list..."
                className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none transition"
              />
              <button
                type="button"
                onClick={() => handleAddFoodItem(newItemInput)}
                disabled={!newItemInput.trim()}
                className="rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-3 py-1.5 text-xs font-bold transition disabled:opacity-40 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Master Food Items Autocomplete Suggestions */}
            {filteredMasterSuggestions.length > 0 && (
              <div className="pt-2 border-t border-white/5 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  From Master Library:
                </div>
                <div className="flex flex-wrap gap-1">
                  {filteredMasterSuggestions.map((m) => (
                    <button
                      key={m.id || m.name}
                      type="button"
                      onClick={() => handleAddFoodItem(m.name)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/90 px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:text-white hover:border-amber-400/50 hover:bg-amber-500/10 transition cursor-pointer"
                    >
                      <Plus className="w-2.5 h-2.5 text-amber-400" />
                      <span>{m.name}</span>
                      {m.frequencyCount > 1 && (
                        <span className="text-[9px] text-slate-500">×{m.frequencyCount}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Estimated Calories & Dietary Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>Estimated Calories (kcal)</span>
              </label>
              <input
                type="number"
                value={caloriesEst}
                onChange={(e) => setCaloriesEst(e.target.value)}
                placeholder="e.g. 650"
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Dietary Notes / Context</label>
              <textarea
                value={dietaryNotes}
                onChange={(e) => setDietaryNotes(e.target.value)}
                placeholder="e.g. Contains seafood, high in protein"
                rows={2}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none resize-none transition"
              />
            </div>
          </div>
        </form>

        {/* AI PROMPT SECTION (UNDER THE FORM) */}
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-slate-950/80 to-slate-950 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                AI Prompt Assistant
              </span>
            </div>
            <span className="text-[10px] text-slate-400">Updates form fields live</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleApplyAi(e);
                }
              }}
              placeholder="e.g. 'Add a cup of filter coffee', 'Change to 2 rotis with dal', 'Recalculate calories'"
              disabled={isApplyingAi}
              className="flex-1 rounded-xl border border-white/15 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none transition"
            />
            <button
              type="button"
              onClick={handleApplyAi}
              disabled={isApplyingAi || !aiPrompt.trim()}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-amber-500/20 transition disabled:opacity-40 cursor-pointer shrink-0 active:scale-95"
            >
              {isApplyingAi ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Applying...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Apply AI Changes</span>
                </>
              )}
            </button>
          </div>

          {/* Live AI Applied Success Badge */}
          {aiAppliedMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 p-2.5 text-xs text-emerald-300 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{aiAppliedMsg}</span>
            </div>
          )}
        </div>

        {/* MODAL FOOTER ACTION BUTTONS */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          {existingEvent?.id ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSubmitting || isApplyingAi}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting || isApplyingAi}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="food-entry-form"
              disabled={isSubmitting || isApplyingAi || !title.trim()}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-5 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:scale-[1.02] active:scale-95 transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Entry</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
