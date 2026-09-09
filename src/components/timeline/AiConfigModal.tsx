"use client";

import React, { useState, useEffect } from "react";

interface AiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: () => void;
}

export function AiConfigModal({ isOpen, onClose, onConfigSaved }: AiConfigModalProps) {
  const [provider, setProvider] = useState<"gemini" | "openrouter">("gemini");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-2.0-flash");
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
            if (data.config.provider) {
              setProvider(data.config.provider);
            }
            if (data.config.model) {
              setModel(data.config.model);
            }
          }
        })
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  const handleProviderChange = (newProvider: "gemini" | "openrouter") => {
    setProvider(newProvider);
    if (newProvider === "gemini") {
      setModel("gemini-2.0-flash");
    } else {
      setModel("openrouter/free");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/timeline/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
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
      <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <div>
              <h2 className="text-base font-bold text-white">AI Engine Configuration</h2>
              <p className="text-xs text-slate-400">Power voice log transcription &amp; timeline decomposition</p>
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
          {/* Provider Toggle */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">Choose AI Provider</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleProviderChange("gemini")}
                className={`flex flex-col items-start p-3 rounded-2xl border text-left transition cursor-pointer ${
                  provider === "gemini"
                    ? "border-cyan-500/50 bg-cyan-500/10 ring-2 ring-cyan-500/30"
                    : "border-white/10 bg-slate-950/60 hover:bg-slate-800/40 text-slate-400"
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-white">
                  <span>✨</span>
                  <span>Google Gemini Flash</span>
                </div>
                <span className="text-[10px] text-cyan-300 font-semibold mt-0.5">Recommended • Free Tier</span>
                <span className="text-[10px] text-slate-400 mt-1 leading-tight">
                  Direct microphone audio + zero transcription errors
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleProviderChange("openrouter")}
                className={`flex flex-col items-start p-3 rounded-2xl border text-left transition cursor-pointer ${
                  provider === "openrouter"
                    ? "border-cyan-500/50 bg-cyan-500/10 ring-2 ring-cyan-500/30"
                    : "border-white/10 bg-slate-950/60 hover:bg-slate-800/40 text-slate-400"
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-white">
                  <span>🤖</span>
                  <span>OpenRouter</span>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold mt-0.5">Multi-model router</span>
                <span className="text-[10px] text-slate-400 mt-1 leading-tight">
                  Open-weights &amp; free community models
                </span>
              </button>
            </div>
          </div>

          {isConfigured && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Active Key: <strong className="font-mono">{maskedKey}</strong>
              </span>
              <span className="text-[10px] uppercase font-bold text-emerald-400">Configured</span>
            </div>
          )}

          {/* API Key Input */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {provider === "gemini" ? "Google Gemini API Key" : "OpenRouter API Key"}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isConfigured ? "Enter new key to replace existing" : provider === "gemini" ? "AIzaSy..." : "sk-or-v1-..."}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
            />
            {provider === "gemini" ? (
              <p className="text-[11px] text-slate-400 mt-1">
                🎁 Get a <strong>100% Free</strong> key from{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 hover:underline font-semibold"
                >
                  aistudio.google.com/apikey
                </a>{" "}
                (15 requests/min completely free, no credit card required).
              </p>
            ) : (
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
                .
              </p>
            )}
          </div>

          {/* Model Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">AI Model</label>
            {provider === "gemini" ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none cursor-pointer"
              >
                <option value="gemini-2.0-flash">⚡ Gemini 2.0 Flash (Recommended - Fastest &amp; Free Direct Audio)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Highest Reasoning)</option>
              </select>
            ) : (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none cursor-pointer"
              >
                <optgroup label="✨ Free Models">
                  <option value="openrouter/free">✨ Auto: Free Conversational Router (100% Free)</option>
                  <option value="nvidia/nemotron-3-super-120b-a12b:free">Nvidia: Nemotron 3 Super 120B (Free)</option>
                  <option value="inclusionai/ling-3.0-flash-fin:free">InclusionAI: Ling 3.0 Flash (Free)</option>
                  <option value="google/gemma-4-31b-it:free">Google: Gemma 4 31B Instruct (Free)</option>
                </optgroup>
                <optgroup label="Ultra-cheap Paid Models">
                  <option value="google/gemini-2.0-flash-001">Google: Gemini 2.0 Flash ($0.10/M tokens)</option>
                  <option value="openai/gpt-4o-mini">OpenAI: GPT-4o Mini</option>
                  <option value="anthropic/claude-3.5-haiku">Anthropic: Claude 3.5 Haiku</option>
                </optgroup>
              </select>
            )}
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
