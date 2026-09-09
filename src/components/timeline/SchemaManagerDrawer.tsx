"use client";

import React, { useState, useEffect } from "react";
import { ActivityJsonSchema, ACTIVITY_META_MAP } from "@/lib/timeline/types";

interface SchemaManagerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSchemaUpdated: () => void;
}

export function SchemaManagerDrawer({ isOpen, onClose, onSchemaUpdated }: SchemaManagerDrawerProps) {
  const [schemas, setSchemas] = useState<Record<string, ActivityJsonSchema>>({});
  const [selectedType, setSelectedType] = useState<string>("FITNESS");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showJsonView, setShowJsonView] = useState(false);

  // New field form state
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<"string" | "number" | "boolean" | "list" | "unit_number">("string");
  const [newUnit, setNewUnit] = useState("");

  const fetchSchemas = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/timeline/schemas");
      const data = await res.json();
      if (data.schemas) {
        setSchemas(data.schemas);
        if (!selectedType && Object.keys(data.schemas).length > 0) {
          setSelectedType(Object.keys(data.schemas)[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load schemas:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSchemas();
    }
  }, [isOpen]);

  const activeSchema = schemas[selectedType];
  const meta = ACTIVITY_META_MAP[selectedType] || ACTIVITY_META_MAP.GENERAL;

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/timeline/schemas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityType: selectedType,
          newFields: [
            {
              fieldKey: newKey.trim(),
              label: newLabel.trim() || newKey.trim(),
              type: newType,
              unit: newUnit.trim() || undefined,
            },
          ],
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to add field");
      }

      setNewKey("");
      setNewLabel("");
      setNewUnit("");
      await fetchSchemas();
      onSchemaUpdated();
    } catch (err: any) {
      alert(err.message || "Failed to add field");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl h-full flex flex-col bg-slate-900 border-l border-white/10 shadow-2xl overflow-hidden">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 font-bold text-sm">
              🧬
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Ever-Evolving Activity Schemas
              </h2>
              <p className="text-xs text-slate-400">
                JSON Schemas for AI grounding and data integrity
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Activity Category Selector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto px-6 py-3 border-b border-white/5 bg-slate-950/20 scrollbar-none">
          {Object.keys(schemas).map((type) => {
            const m = ACTIVITY_META_MAP[type] || ACTIVITY_META_MAP.GENERAL;
            const active = selectedType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer shrink-0 ${
                  active
                    ? "bg-purple-500 text-white shadow-md shadow-purple-500/20"
                    : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span>{m.icon}</span>
                <span>{m.name}</span>
              </button>
            );
          })}
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeSchema ? (
            <>
              {/* Schema Status Header */}
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{meta.icon}</span>
                    <h3 className="text-base font-bold text-white">{activeSchema.title}</h3>
                    <span className="rounded-full border border-purple-500/40 bg-purple-500/15 px-2 py-0.5 text-[10px] font-mono font-bold text-purple-300">
                      v{activeSchema.version}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{activeSchema.description}</p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowJsonView(!showJsonView)}
                  className="rounded-xl border border-white/10 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition cursor-pointer"
                >
                  {showJsonView ? "View Fields" : "Inspect JSON"}
                </button>
              </div>

              {/* JSON Schema View Mode */}
              {showJsonView ? (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Raw JSON Schema (Grounding Specification)
                  </label>
                  <pre className="rounded-2xl border border-white/10 bg-slate-950 p-4 text-xs font-mono text-cyan-300 overflow-x-auto max-h-96 leading-relaxed">
                    {JSON.stringify(activeSchema.jsonSchema, null, 2)}
                  </pre>
                </div>
              ) : (
                /* Fields List Mode */
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      Active Attributes ({activeSchema.fields.length})
                    </label>
                    <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-slate-950/60 overflow-hidden">
                      {activeSchema.fields.map((field) => (
                        <div
                          key={field.key}
                          className="flex items-center justify-between p-3.5 hover:bg-white/5 transition"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white">{field.label}</span>
                              <code className="text-[11px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-1.5 py-0.2 rounded">
                                {field.key}
                              </code>
                            </div>
                            {field.description && (
                              <p className="text-[11px] text-slate-400">{field.description}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {field.unit && (
                              <span className="rounded-full bg-slate-800 border border-white/10 px-2 py-0.5 text-[10px] font-mono text-slate-300">
                                Unit: {field.unit}
                              </span>
                            )}
                            <span className="rounded-full bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[10px] font-mono font-medium text-purple-300">
                              {field.type}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add New Attribute Form */}
                  <form
                    onSubmit={handleAddField}
                    className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 space-y-3"
                  >
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>➕</span>
                      <span>Manually Add New Attribute to Schema</span>
                    </h4>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Field Key</label>
                        <input
                          type="text"
                          required
                          value={newKey}
                          onChange={(e) => setNewKey(e.target.value)}
                          placeholder="e.g., bloodPressure"
                          className="w-full mt-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Label</label>
                        <input
                          type="text"
                          value={newLabel}
                          onChange={(e) => setNewLabel(e.target.value)}
                          placeholder="e.g., Blood Pressure"
                          className="w-full mt-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Data Type</label>
                        <select
                          value={newType}
                          onChange={(e) => setNewType(e.target.value as any)}
                          className="w-full mt-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                        >
                          <option value="string">String (Text)</option>
                          <option value="number">Number</option>
                          <option value="unit_number">Number with Unit</option>
                          <option value="list">List (Array of strings)</option>
                          <option value="boolean">Boolean (Yes/No)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Unit (Optional)</label>
                        <input
                          type="text"
                          value={newUnit}
                          onChange={(e) => setNewUnit(e.target.value)}
                          placeholder="e.g., bpm, kcal, km"
                          className="w-full mt-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSaving || !newKey.trim()}
                      className="w-full rounded-xl bg-purple-500 py-2 text-xs font-bold text-white shadow-md shadow-purple-500/20 hover:bg-purple-400 transition disabled:opacity-50 cursor-pointer"
                    >
                      {isSaving ? "Adding..." : "Save Field & Bump Version"}
                    </button>
                  </form>

                  {/* Schema Evolution Changelog */}
                  {activeSchema.changelog && activeSchema.changelog.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                        Schema Evolution Changelog
                      </label>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 space-y-2">
                        {activeSchema.changelog.map((entry, idx) => (
                          <div key={idx} className="flex items-start justify-between text-[11px] gap-2">
                            <div>
                              <span className="font-mono font-bold text-purple-300 mr-2">
                                v{entry.version}
                              </span>
                              <span className="text-white font-semibold">{entry.fieldKey}</span>
                              <span className="text-slate-400 ml-1">({entry.fieldType})</span>
                              {entry.reason && (
                                <p className="text-[10px] text-slate-500">{entry.reason}</p>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono shrink-0">
                              {entry.timestamp.split("T")[0]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-slate-400 py-10">Loading schema details...</div>
          )}
        </div>
      </div>
    </div>
  );
}
