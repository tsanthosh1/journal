"use client";

import React, { useState, useEffect } from "react";
import { LifeEvent, ACTIVITY_META_MAP, ActivityJsonSchema } from "@/lib/timeline/types";

interface EventEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventToEdit?: LifeEvent | null;
  defaultDate: string;
  onSaved: () => void;
}

export function EventEditModal({
  isOpen,
  onClose,
  eventToEdit,
  defaultDate,
  onSaved,
}: EventEditModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [activityType, setActivityType] = useState("WORK");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [mood, setMood] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [attributes, setAttributes] = useState<Record<string, any>>({});
  const [newAttrKey, setNewAttrKey] = useState("");
  const [newAttrVal, setNewAttrVal] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [activeSchema, setActiveSchema] = useState<ActivityJsonSchema | null>(null);

  useEffect(() => {
    if (eventToEdit) {
      setTitle(eventToEdit.title || "");
      setDescription(eventToEdit.description || "");
      setActivityType(eventToEdit.activityType || "WORK");
      setDate(eventToEdit.date || defaultDate);
      setStartTime(eventToEdit.startTime || "");
      setEndTime(eventToEdit.endTime || "");
      setMood(eventToEdit.mood || "");
      setTagsInput((eventToEdit.tags || []).join(", "));
      setAttributes(eventToEdit.attributes || {});
    } else {
      setTitle("");
      setDescription("");
      setActivityType("WORK");
      setDate(defaultDate);
      setStartTime("");
      setEndTime("");
      setMood("");
      setTagsInput("");
      setAttributes({});
    }
  }, [eventToEdit, defaultDate, isOpen]);

  // Fetch schema for active activity type to show suggested fields
  useEffect(() => {
    if (isOpen && activityType) {
      fetch(`/api/timeline/schemas?activityType=${activityType}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.schema) setActiveSchema(data.schema);
        })
        .catch(() => {});
    }
  }, [isOpen, activityType]);

  const handleAttributeChange = (key: string, value: any) => {
    setAttributes((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddCustomAttribute = () => {
    if (!newAttrKey.trim()) return;
    setAttributes((prev) => ({ ...prev, [newAttrKey.trim()]: newAttrVal.trim() }));
    setNewAttrKey("");
    setNewAttrVal("");
  };

  const handleRemoveAttribute = (key: string) => {
    setAttributes((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const payload = {
        title: title.trim(),
        description: description.trim(),
        activityType,
        date,
        startTime: startTime.trim() || undefined,
        endTime: endTime.trim() || undefined,
        mood: mood.trim() || undefined,
        tags,
        attributes,
      };

      const url = eventToEdit ? `/api/timeline/events/${eventToEdit.id}` : "/api/timeline/events";
      const method = eventToEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to save event");
      }

      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message || "Error saving event");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <span className="text-xl">✏️</span>
            <h2 className="text-base sm:text-lg font-bold text-white">
              {eventToEdit ? "Edit Life Event" : "Create New Life Event"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Event Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., 5km Morning Jog, Sprint Review, Dinner at Bistro"
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Activity Category</label>
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none cursor-pointer"
              >
                {Object.entries(ACTIVITY_META_MAP).map(([type, meta]) => (
                  <option key={type} value={type}>
                    {meta.icon} {meta.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none cursor-pointer"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none cursor-pointer"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Mood / Sentiment</label>
              <select
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none cursor-pointer"
              >
                <option value="">None / Neutral</option>
                <option value="Energized">⚡ Energized</option>
                <option value="Focused">🎯 Focused</option>
                <option value="Happy">😊 Happy</option>
                <option value="Calm">🧘 Calm</option>
                <option value="Tired">😴 Tired</option>
                <option value="Stressed">😰 Stressed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Description / Notes</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add additional context, reflections, or outcomes..."
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none resize-none leading-relaxed"
            />
          </div>

          {/* Dynamic Schema Attributes Section */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider block">
              {activityType} Attributes
            </label>

            {/* Standard Schema Suggested Fields */}
            {activeSchema && activeSchema.fields.length > 0 && (
              <div className="grid grid-cols-2 gap-2.5">
                {activeSchema.fields.map((field) => (
                  <div key={field.key}>
                    <label className="text-[11px] text-slate-400 block mb-0.5">
                      {field.label} {field.unit ? `(${field.unit})` : ""}
                    </label>
                    <input
                      type={field.type === "number" || field.type === "unit_number" ? "number" : "text"}
                      step="any"
                      value={attributes[field.key] !== undefined ? attributes[field.key] : ""}
                      onChange={(e) => handleAttributeChange(field.key, e.target.value)}
                      placeholder={field.suggestedValues ? field.suggestedValues.slice(0, 3).join(", ") : ""}
                      className="w-full rounded-xl border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Custom Key-Value Additions */}
            <div className="pt-2">
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Custom Attribute (Key & Value)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newAttrKey}
                  onChange={(e) => setNewAttrKey(e.target.value)}
                  placeholder="Key (e.g., shoeModel)"
                  className="flex-1 rounded-xl border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={newAttrVal}
                  onChange={(e) => setNewAttrVal(e.target.value)}
                  placeholder="Value"
                  className="flex-1 rounded-xl border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddCustomAttribute}
                  className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Display active custom attributes with remove button */}
            {Object.keys(attributes).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {Object.entries(attributes).map(([k, v]) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-800 border border-white/10 px-2 py-0.5 text-xs text-slate-200"
                  >
                    <span className="text-slate-400">{k}:</span>
                    <strong className="text-white">{String(v)}</strong>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttribute(k)}
                      className="text-slate-500 hover:text-rose-400 ml-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Tags (Comma-separated)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g., cardio, outdoor, team"
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !title.trim()}
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? "Saving..." : eventToEdit ? "Update Event" : "Create Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
