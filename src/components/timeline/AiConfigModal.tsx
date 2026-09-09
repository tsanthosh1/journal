"use client";

import React, { useState, useEffect } from "react";

interface AiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: () => void;
}

export function AiConfigModal({ isOpen, onClose, onConfigSaved }: AiConfigModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("google/gemini-2.5-flash");
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetch("/api/timeline/ai-config")
        .then((res) => res.json())
        .then((data) => {
          if (data.config) {
            setIsConfigured(data.config.isConfigured);
            setMaskedKey(data.config.maskedKey || null);
            if (data.config.model) setModel(data.config.model);
          }
        })
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/timeline/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          model,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save AI configuration");
      }

      onConfigSaved();
      onClose();
    } catch (err: any) {
      alert(err.message || "Failed to save AI config");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <div>
              <h2 className="text-base font-bold text-white">OpenRouter AI Configuration</h2>
              <p className="text-xs text-slate-400">Power voice log decomposition</p>
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

        {/* Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {isConfigured && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Active Key: <strong className="font-mono">{maskedKey}</strong>
              </span>
              <span className="text-[10px] uppercase font-bold text-emerald-400">Configured</span>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              OpenRouter API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isConfigured ? "Enter new key to replace existing" : "sk-or-v1-..."}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Get an API key from{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:underline"
              >
                openrouter.ai/keys
              </a>
              . Also reads <code className="text-slate-300">OPENROUTER_API_KEY</code> from .env.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">AI Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none cursor-pointer"
            >
              <optgroup label="✨ Automatic Routers (Recommended)">
                <option value="openrouter/free">✨ Auto: Best Free Model (openrouter/free - 100% Free)</option>
                <option value="openrouter/auto">🤖 Auto: Smart Task Router (openrouter/auto)</option>
              </optgroup>
              <optgroup label="Popular Free Models">
                <option value="meta-llama/llama-3.3-70b-instruct:free">Meta: Llama 3.3 70B (Free)</option>
                <option value="google/gemini-2.0-flash-exp:free">Google: Gemini 2.0 Flash (Free)</option>
                <option value="qwen/qwen-2.5-72b-instruct:free">Qwen: 2.5 72B Instruct (Free)</option>
              </optgroup>
              <optgroup label="Pinned Top Models">
                <option value="google/gemini-2.5-flash">Google: Gemini 2.5 Flash</option>
                <option value="openai/gpt-4o-mini">OpenAI: GPT-4o Mini</option>
                <option value="anthropic/claude-3.5-haiku">Anthropic: Claude 3.5 Haiku</option>
              </optgroup>
            </select>
          </div>

          {/* Footer */}
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
              disabled={isSaving}
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
