"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ExtractedEventCandidate,
  AiExtractionResult,
  ACTIVITY_META_MAP,
} from "@/lib/timeline/types";

interface VoiceRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetDate: string;
  onEventsSaved: () => void;
  onOpenAiSettings?: () => void;
}

export function VoiceRecorderModal({
  isOpen,
  onClose,
  targetDate,
  onEventsSaved,
  onOpenAiSettings,
}: VoiceRecorderModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speechLang, setSpeechLang] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("journal_timeline_speech_lang");
      if (saved) return saved;
      const nav = (navigator.language || "").toLowerCase();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (nav.includes("in") || tz.includes("Calcutta") || tz.includes("Kolkata") || tz.includes("Asia")) {
        return "en-IN";
      }
      return navigator.language || "en-IN";
    }
    return "en-IN";
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extractionResult, setExtractionResult] = useState<AiExtractionResult | null>(null);
  const [candidateEvents, setCandidateEvents] = useState<ExtractedEventCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<"gemini" | "openrouter">("gemini");
  const [hasAiKey, setHasAiKey] = useState(false);

  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  isRecordingRef.current = isRecording;

  // Audio recording refs for direct multimodal Gemini ingestion
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioBase64Ref = useRef<string | null>(null);
  const audioMimeTypeRef = useRef<string>("audio/webm");
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Load AI configuration status
  useEffect(() => {
    if (isOpen) {
      fetch("/api/timeline/ai-config")
        .then((res) => res.json())
        .then((data) => {
          if (data?.config) {
            if (data.config.provider) setActiveProvider(data.config.provider);
            setHasAiKey(Boolean(data.config.isConfigured));
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Start raw microphone audio capture
  const startAudioCapture = async () => {
    try {
      audioChunksRef.current = [];
      audioBase64Ref.current = null;
      if (typeof window !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

        audioMimeTypeRef.current = mimeType || "audio/webm";
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          if (audioChunksRef.current.length > 0) {
            const blob = new Blob(audioChunksRef.current, { type: audioMimeTypeRef.current });
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result as string;
              if (base64data) {
                const base64 = base64data.split(",")[1];
                audioBase64Ref.current = base64;
              }
            };
            reader.readAsDataURL(blob);
          }
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
          }
        };

        recorder.start(250);
        mediaRecorderRef.current = recorder;
      }
    } catch (err) {
      console.warn("[VoiceRecorder] MediaRecorder capture error:", err);
    }
  };

  const stopAudioCapture = () => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    } catch (e) {}
  };

  // Initialize Web Speech API with selected accent
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setSpeechSupported(false);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = speechLang;

      recognition.onresult = (event: any) => {
        let currentInterim = "";
        let finalChunk = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalChunk += event.results[i][0].transcript + " ";
          } else {
            currentInterim += event.results[i][0].transcript;
          }
        }

        if (finalChunk) {
          setTranscript((prev) => (prev ? `${prev.trim()} ${finalChunk}` : finalChunk));
        }
        setInterimText(currentInterim);
      };

      recognition.onerror = (event: any) => {
        console.warn("[VoiceRecorder] Speech error:", event.error);
        if (event.error === "not-allowed") {
          setError("Microphone permission denied. Please allow microphone access in your browser settings.");
          setIsRecording(false);
        }
      };

      recognition.onend = () => {
        // If recording state is still active, restart (handles silence timeout)
        if (isRecordingRef.current) {
          try {
            recognition.start();
          } catch (e) {
            // Already started
          }
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, [speechLang]);

  const handleLanguageChange = (newLang: string) => {
    setSpeechLang(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("journal_timeline_speech_lang", newLang);
    }
    if (recognitionRef.current) {
      recognitionRef.current.lang = newLang;
      // If currently recording, restart with new language
      if (isRecording) {
        try {
          recognitionRef.current.stop();
          setTimeout(() => {
            if (isRecordingRef.current) {
              recognitionRef.current.start();
            }
          }, 150);
        } catch (e) {}
      }
    }
  };

  const toggleRecording = () => {
    if (!speechSupported) {
      alert("Web Speech API is not supported in this browser. You can type your notes directly!");
      return;
    }

    setError(null);
    if (isRecording) {
      setIsRecording(false);
      stopAudioCapture();
      try {
        recognitionRef.current?.stop();
      } catch (e) {}
    } else {
      startAudioCapture();
      try {
        recognitionRef.current?.start();
        setIsRecording(true);
      } catch (e) {
        console.error("Failed to start speech recognition:", e);
        setIsRecording(false);
      }
    }
  };

  const handleProcessWithAi = async () => {
    const fullText = (transcript + " " + interimText).trim();
    if (!fullText && !audioBase64Ref.current) {
      setError("Please speak or type something before processing.");
      return;
    }

    // Stop recording if active
    if (isRecording) {
      setIsRecording(false);
      stopAudioCapture();
      try {
        recognitionRef.current?.stop();
      } catch (e) {}
    }

    // Brief delay to allow MediaRecorder onstop to finalize base64 blob conversion
    await new Promise((r) => setTimeout(r, 200));

    setIsProcessing(true);
    setError(null);

    try {
      const res = await fetch("/api/timeline/process-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spokenText: fullText,
          audioBase64: audioBase64Ref.current || undefined,
          audioMimeType: audioMimeTypeRef.current,
          targetDate,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          autoEvolveSchema: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Processing failed (${res.status})`);
      }

      const data = await res.json();
      setExtractionResult(data.result);
      setCandidateEvents(data.result.events || []);

      // If Gemini returned a verbatim transcript, update local state
      if (data.result?.rawTranscript) {
        setTranscript(data.result.rawTranscript);
        setInterimText("");
      }
    } catch (err: any) {
      setError(err.message || "Failed to process speech");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveCandidate = (index: number) => {
    setCandidateEvents((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveAllEvents = async () => {
    if (candidateEvents.length === 0) return;

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/timeline/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: candidateEvents.map((ev) => ({
            ...ev,
            date: ev.date || targetDate,
            rawSpokenText: transcript,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save events");
      }

      onEventsSaved();
      handleReset();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save events");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (isRecording) {
      try {
        recognitionRef.current?.stop();
      } catch (e) {}
    }
    setIsRecording(false);
    setTranscript("");
    setInterimText("");
    setExtractionResult(null);
    setCandidateEvents([]);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 font-bold text-sm">
              🎙️
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Voice Life Log & AI Decomposer
              </h2>
              <p className="text-xs text-slate-400">
                Log date: <strong className="text-cyan-300">{targetDate}</strong>
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-center justify-between">
              <span>⚠️ {error}</span>
              {onOpenAiSettings && (
                <button
                  type="button"
                  onClick={onOpenAiSettings}
                  className="underline font-bold text-cyan-300 hover:text-white cursor-pointer ml-2 shrink-0"
                >
                  Configure AI Key
                </button>
              )}
            </div>
          )}

          {/* Stage 1: Recording & Speech Area */}
          {!extractionResult && (
            <div className="space-y-4">
              {/* Pulsing Mic Hero */}
              <div className="flex flex-col items-center justify-center py-4 space-y-3">
                {/* Language / Accent Selector */}
                <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-950/80 border border-white/10 shadow-inner flex-wrap justify-center">
                  {[
                    { id: "ta-IN", label: "🇮🇳 தமிழ் (Tamil)" },
                    { id: "en-IN", label: "🇮🇳 Indian English" },
                    { id: "en-US", label: "🇺🇸 US English" },
                    { id: "en-GB", label: "🇬🇧 UK English" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleLanguageChange(opt.id)}
                      className={`rounded-xl px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                        speechLang === opt.id
                          ? "bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20"
                          : "text-slate-400 hover:text-white"
                      }`}
                      title={`Select ${opt.label} for speech recognition`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="relative flex items-center justify-center pt-2">
                  {isRecording && (
                    <>
                      <div className="absolute h-24 w-24 rounded-full bg-rose-500/20 animate-ping" />
                      <div className="absolute h-20 w-20 rounded-full bg-rose-500/30 animate-pulse" />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={toggleRecording}
                    className={`relative z-10 flex h-16 w-16 items-center justify-center rounded-full text-2xl shadow-xl transition-all duration-300 active:scale-95 cursor-pointer ${
                      isRecording
                        ? "bg-rose-500 text-white shadow-rose-500/40 ring-4 ring-rose-500/30"
                        : "bg-gradient-to-tr from-cyan-500 to-blue-600 text-slate-950 shadow-cyan-500/30 hover:scale-105"
                    }`}
                    title={isRecording ? "Click to stop recording" : "Click to speak"}
                  >
                    {isRecording ? "⏹️" : "🎙️"}
                  </button>
                </div>

                <div className="text-center">
                  <p className="text-sm font-bold text-white">
                    {isRecording ? "Listening in " + (speechLang === "ta-IN" ? "தமிழ் (Tamil)" : speechLang === "en-IN" ? "Indian English" : speechLang === "en-US" ? "US English" : "UK English") + "..." : "Tap microphone to speak"}
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                      <span>✨</span>
                      <span>{activeProvider === "gemini" ? "Gemini 2.0 Flash (Direct Audio Multimodal)" : "OpenRouter AI Engine"}</span>
                    </span>
                    {onOpenAiSettings && (
                      <button
                        type="button"
                        onClick={onOpenAiSettings}
                        className="text-[10px] text-slate-400 hover:text-cyan-300 underline cursor-pointer"
                      >
                        Change AI Provider
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Editable Transcript Area */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 flex items-center justify-between">
                  <span>Transcript / Raw Notes</span>
                  {transcript && (
                    <button
                      type="button"
                      onClick={() => {
                        setTranscript("");
                        setInterimText("");
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </label>
                <div className="relative rounded-2xl border border-white/10 bg-slate-950/60 p-3 focus-within:border-cyan-500/50">
                  <textarea
                    rows={4}
                    value={transcript + (interimText ? (transcript ? " " : "") + interimText : "")}
                    onChange={(e) => {
                      setTranscript(e.target.value);
                      setInterimText("");
                    }}
                    placeholder="E.g., Today at 8am ran 5km in 28 mins. Then had oatmeal for breakfast. At 11am had a sprint review with Sarah..."
                    className="w-full bg-transparent text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none resize-none leading-relaxed"
                  />
                  {isRecording && (
                    <div className="flex items-center gap-1 text-[11px] text-rose-400 font-mono mt-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                      Live recording active...
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={toggleRecording}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
                    isRecording
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                      : "border-white/10 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  <span>{isRecording ? "Pause" : "Resume Voice"}</span>
                </button>

                <button
                  type="button"
                  disabled={isProcessing || (!transcript.trim() && !interimText.trim())}
                  onClick={handleProcessWithAi}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition disabled:opacity-50 active:scale-95 cursor-pointer"
                >
                  <span>{isProcessing ? "⏳" : "⚡"}</span>
                  <span>{isProcessing ? "Decomposing with AI..." : "Extract Events with AI"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Stage 2: Extracted Event Cards Review */}
          {extractionResult && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between rounded-2xl border border-cyan-500/20 bg-cyan-950/30 p-3 text-xs text-cyan-200">
                <div className="space-y-0.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>✨ AI Extracted {candidateEvents.length} Life Event(s)</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {extractionResult.summaryOfNarration}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-slate-400 hover:text-white underline text-[11px] cursor-pointer ml-3 shrink-0"
                >
                  Record Again
                </button>
              </div>

              {/* Event Cards List */}
              <div className="space-y-3">
                {candidateEvents.map((ev, idx) => {
                  const meta = ACTIVITY_META_MAP[ev.activityType] || ACTIVITY_META_MAP.GENERAL;
                  return (
                    <div
                      key={idx}
                      className="group relative rounded-2xl border border-white/10 bg-slate-950/60 p-4 transition hover:border-white/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-lg">
                            {meta.icon}
                          </span>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-white">{ev.title}</span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.badgeColor}`}
                              >
                                {meta.name}
                              </span>
                              {ev.startTime && (
                                <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] font-mono text-slate-300">
                                  🕒 {ev.startTime}
                                  {ev.endTime ? ` - ${ev.endTime}` : ""}
                                </span>
                              )}
                              {ev.durationMinutes && (
                                <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] font-mono text-slate-400">
                                  ⏱️ {ev.durationMinutes}m
                                </span>
                              )}
                              {ev.mood && (
                                <span className="rounded-full bg-teal-500/10 border border-teal-500/30 px-2 py-0.5 text-[10px] font-medium text-teal-300">
                                  {ev.mood}
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-slate-300 leading-relaxed">
                              {ev.description}
                            </p>

                            {/* Dynamic Attributes Pills */}
                            {ev.attributes && Object.keys(ev.attributes).length > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                {Object.entries(ev.attributes).map(([k, v]) => {
                                  if (v === undefined || v === null || v === "") return null;
                                  const displayVal = Array.isArray(v) ? v.join(", ") : String(v);
                                  return (
                                    <span
                                      key={k}
                                      className="rounded-lg bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 text-[11px] text-slate-300"
                                    >
                                      <span className="text-slate-400 mr-1">{k}:</span>
                                      <strong className="text-white">{displayVal}</strong>
                                    </span>
                                  );
                                })}
                              </div>
                            )}

                            {/* New Attribute Badge if Evolved */}
                            {ev.newAttributesDiscovered && ev.newAttributesDiscovered.length > 0 && (
                              <div className="text-[10px] text-emerald-400 font-semibold pt-1 flex items-center gap-1">
                                <span>🧬 Evolved schema with:</span>
                                {ev.newAttributesDiscovered.map((na) => na.label).join(", ")}
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveCandidate(idx)}
                          className="text-slate-500 hover:text-rose-400 p-1 text-xs cursor-pointer transition"
                          title="Remove this event"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-xl border border-white/10 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition cursor-pointer"
                >
                  Discard & Start Over
                </button>

                <button
                  type="button"
                  disabled={isSaving || candidateEvents.length === 0}
                  onClick={handleSaveAllEvents}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:from-emerald-300 hover:to-teal-400 transition disabled:opacity-50 active:scale-95 cursor-pointer"
                >
                  <span>{isSaving ? "⏳" : "✓"}</span>
                  <span>{isSaving ? "Saving to Timeline..." : `Save All ${candidateEvents.length} Event(s)`}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
