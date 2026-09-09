"use client";

import React, { useState } from "react";
import { LifeEvent, ACTIVITY_META_MAP } from "@/lib/timeline/types";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import { ChevronUp, ChevronDown, Pencil, Trash2, Timer, Clock, Smile } from "lucide-react";

interface TimelineEventCardProps {
  event: LifeEvent;
  onEdit: (event: LifeEvent) => void;
  onDelete: (id: string) => void;
  density?: "comfortable" | "compact";
}

export function TimelineEventCard({
  event,
  onEdit,
  onDelete,
  density = "comfortable",
}: TimelineEventCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const meta = ACTIVITY_META_MAP[event.activityType] || ACTIVITY_META_MAP.GENERAL;

  const handleDelete = async () => {
    if (!confirm(`Delete "${event.title}" from your timeline?`)) return;
    setIsDeleting(true);
    try {
      await onDelete(event.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const hasAttributes = event.attributes && Object.keys(event.attributes).length > 0;
  const isCompact = density === "compact";

  // ─────────────────────────────────────────────────────────────
  // COMPACT VIEW: Two-Line Structured Layout (Linear / Reminders)
  // ─────────────────────────────────────────────────────────────
  if (isCompact) {
    return (
      <div className="relative pl-6 sm:pl-8 pb-3 last:pb-1 group">
        {/* Compact Spine Connector */}
        <div className="absolute left-0 top-2 bottom-0 w-px bg-slate-800 group-last:bg-transparent" />
        <div
          className="absolute -left-2 sm:-left-2.5 top-2.5 flex h-4.5 w-4.5 sm:h-5 sm:w-5 items-center justify-center rounded-full border border-slate-950 shadow-sm text-[9px] sm:text-[10px] transition-transform group-hover:scale-110 shrink-0"
          style={{ backgroundColor: meta.color }}
          title={meta.name}
        >
          <DynamicIcon icon={meta.icon} className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
        </div>

        {/* Compact Card Container */}
        <div
          className={`rounded-xl border ${meta.borderColor} bg-slate-900/85 hover:bg-slate-900 px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-sm backdrop-blur-md transition-all duration-150 hover:border-white/20`}
        >
          <div className="flex flex-col gap-1.5">
            {/* LINE 1: Event Title (Perfect horizontal alignment across all rows) + Actions */}
            <div className="flex items-center justify-between gap-3">
              <span
                onClick={() => onEdit(event)}
                className="font-bold text-white text-sm sm:text-base hover:text-cyan-300 cursor-pointer transition leading-snug flex-1 break-words"
                title={event.title}
              >
                {event.title}
              </span>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 shrink-0">
                {(event.description || hasAttributes || event.rawSpokenText) && (
                  <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-white/5 transition cursor-pointer"
                    title={expanded ? "Collapse details" : "Expand details"}
                  >
                    {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onEdit(event)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  title="Edit event"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDelete}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-50"
                  title="Delete event"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* LINE 2: Time Badge + Duration + Hashtags */}
            <div className="flex items-center gap-2 flex-wrap text-xs pt-0.5">
              {/* Time Badge */}
              <span className="shrink-0 font-mono text-[11px] font-bold text-slate-300 bg-slate-950/80 px-2 py-0.5 rounded-md border border-white/5">
                {event.startTime ? (
                  <>
                    <span>{event.startTime}</span>
                    {event.endTime && (
                      <span className="text-slate-500 font-normal"> - {event.endTime}</span>
                    )}
                  </>
                ) : (
                  <span className="text-slate-500">All day</span>
                )}
              </span>

              {/* Duration Pill */}
              {event.durationMinutes && (
                <span className="shrink-0 font-mono text-[10px] text-slate-400 bg-white/5 border border-white/5 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                  <Timer className="w-3 h-3 text-slate-400" />
                  <span>{event.durationMinutes}m</span>
                </span>
              )}

              {/* Hashtags */}
              {event.tags && event.tags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {event.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-slate-950/70 border border-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400 font-mono"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Compact Inline Expansion (reveals full description, full attributes, raw speech) */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-white/10 space-y-2.5 text-xs">
              {event.description && (
                <p className="text-slate-300 leading-relaxed text-xs sm:text-sm">
                  {event.description}
                </p>
              )}

              {/* Full Attributes Grid */}
              {hasAttributes && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {Object.entries(event.attributes).map(([key, value]) => {
                    if (value === undefined || value === null || value === "") return null;
                    const displayVal = Array.isArray(value) ? value.join(", ") : String(value);
                    return (
                      <div
                        key={key}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-950/80 border border-white/10 px-2.5 py-1 text-[11px] text-slate-300"
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {key.replace(/([A-Z])/g, " $1")}:
                        </span>
                        <span className="font-semibold text-white font-mono">{displayVal}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {event.rawSpokenText && (
                <div className="rounded-lg bg-slate-950/80 border border-white/5 p-2 text-[11px] text-slate-400 italic">
                  "{event.rawSpokenText}"
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // COMFORTABLE (DETAILED) VIEW RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="relative pl-8 sm:pl-10 pb-8 last:pb-2 group">
      {/* Timeline Node & Vertical Connector Line */}
      <div className="absolute left-0 top-1.5 bottom-0 w-px bg-slate-800 group-last:bg-transparent" />
      <div
        className="absolute -left-3 top-1 flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full border-2 border-slate-950 shadow-md text-xs transition-transform group-hover:scale-110"
        style={{ backgroundColor: meta.color }}
        title={meta.name}
      >
        <DynamicIcon icon={meta.icon} className="w-3.5 h-3.5 text-white" />
      </div>

      {/* Main Card */}
      <div
        className={`rounded-2xl border ${meta.borderColor} bg-gradient-to-br ${meta.bgColor} p-4 sm:p-5 shadow-sm backdrop-blur-md transition-all duration-200 hover:border-white/20 hover:shadow-lg`}
      >
        {/* Card Header: Times & Category */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {event.startTime ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/90 border border-white/10 px-2.5 py-0.5 text-xs font-mono font-bold text-white shadow-inner">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{event.startTime}</span>
                  {event.endTime && <span className="text-slate-400">- {event.endTime}</span>}
                </span>
              ) : (
                <span className="rounded-full bg-slate-900/60 border border-white/5 px-2 py-0.5 text-[11px] text-slate-400 font-mono">
                  All day
                </span>
              )}

              {event.durationMinutes && (
                <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[11px] font-mono text-slate-300 inline-flex items-center gap-1">
                  <Timer className="w-3 h-3 text-slate-300" />
                  <span>{event.durationMinutes}m</span>
                </span>
              )}

              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${meta.badgeColor}`}>
                {meta.name}
              </span>

              {event.mood && (
                <span className="rounded-full bg-teal-500/15 border border-teal-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-teal-300 inline-flex items-center gap-1">
                  <Smile className="w-3 h-3 text-teal-300" />
                  <span>{event.mood}</span>
                </span>
              )}
            </div>

            <h3 className="text-base sm:text-lg font-extrabold text-white tracking-tight pt-1">
              {event.title}
            </h3>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onEdit(event)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Edit event"
            >
              <Pencil className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDelete}
              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-50"
              title="Delete event"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Narrative Description */}
        {event.description && (
          <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
            {event.description}
          </p>
        )}

        {/* Dynamic Attributes Grid */}
        {hasAttributes && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {Object.entries(event.attributes).map(([key, value]) => {
              if (value === undefined || value === null || value === "") return null;
              const displayVal = Array.isArray(value) ? value.join(", ") : String(value);

              return (
                <div
                  key={key}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950/60 border border-white/10 px-2.5 py-1 text-xs text-slate-200"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {key.replace(/([A-Z])/g, " $1")}:
                  </span>
                  <span className="font-semibold text-white font-mono">{displayVal}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Tags & Metadata */}
        <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-white/5 pt-2.5 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5 flex-wrap">
            {event.tags &&
              event.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300"
                >
                  #{tag}
                </span>
              ))}
          </div>

          {event.rawSpokenText && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
            >
              {expanded ? "Hide raw speech" : "Show raw speech"}
            </button>
          )}
        </div>

        {/* Collapsible raw speech text */}
        {expanded && event.rawSpokenText && (
          <div className="mt-2 rounded-xl bg-slate-950/80 border border-white/5 p-2.5 text-[11px] text-slate-400 italic">
            "{event.rawSpokenText}"
          </div>
        )}
      </div>
    </div>
  );
}
