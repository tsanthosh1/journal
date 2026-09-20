"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authFetch";
import { LifeEvent } from "@/lib/timeline/types";
import {
  Mic,
  Square,
  Sparkles,
  Loader2,
  X,
  AlertCircle,
  Activity,
} from "lucide-react";

interface FitnessVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  todayDate: string;
  existingEvents: LifeEvent[];
  onSuccess: (summary: string) => void;
}

export function FitnessVoiceModal({
  isOpen,
  onClose,
  todayDate,
  existingEvents,
  onSuccess,
}: FitnessVoiceModalProps) {
  const { user } = useAuth();
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioBase64Ref = useRef<string | null>(null);
  const audioMimeTypeRef = useRef<string>("audio/webm");
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      setInputText("");
      setError(null);
      setIsRecording(false);
      setRecordingSeconds(0);
      audioChunksRef.current = [];
      audioBase64Ref.current = null;
    } else {
      stopRecording();
    }
  }, [isOpen]);

  // Handle recording timer
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isRecording]);

  // Setup Web Speech API for live transcription preview
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let full = "";
        for (let i = 0; i < event.results.length; ++i) {
          full += event.results[i][0].transcript + " ";
        }
        if (full.trim()) {
          setInputText(full.trim());
        }
      };

      recognition.onerror = (e: any) => {
        console.warn("[FitnessVoiceModal] Speech recognition warning:", e.error);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  const startRecording = async () => {
    setError(null);
    audioChunksRef.current = [];
    audioBase64Ref.current = null;

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Microphone is not supported in this browser.");
        return;
      }

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
              audioBase64Ref.current = base64data.split(",")[1];
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

      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {}
      }

      setIsRecording(true);
    } catch (err: any) {
      console.error("[FitnessVoiceModal] Mic error:", err);
      setError(
        err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
          ? "Microphone access blocked. Please allow microphone permissions in browser."
          : `Microphone error: ${err.message || "Could not record"}`
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsRecording(false);
  };

  const handleToggleRecord = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (isRecording) {
      stopRecording();
      await new Promise((r) => setTimeout(r, 250));
    }

    const textToSubmit = inputText.trim();
    if (!textToSubmit && !audioBase64Ref.current) {
      setError("Please speak or type your treadmill workout details.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const res = await authFetch(user, "/api/fitness/voice-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: audioBase64Ref.current || undefined,
          audioMimeType: audioMimeTypeRef.current,
          speechText: textToSubmit,
          todayDate,
          userId: user?.email || user?.uid || "",
          existingEvents: existingEvents.map((ev) => ({
            id: ev.id,
            date: ev.date,
            startTime: ev.startTime,
            title: ev.title,
            attributes: ev.attributes,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to process workout action");
      }

      const data = await res.json();
      onSuccess(data.summary || "Treadmill workout saved successfully!");
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to log workout with AI");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const quickPrompts = [
    "Ran 4.2 km on treadmill in 30 minutes at speed 8.5 with 1 percent incline",
    "Did a 25 min incline walk yesterday at 6pm, 2.5 km at 4 percent incline",
    "Treadmill warmup 15 minutes 1.2 km at speed 5",
    "5k run in 28 minutes, burned 320 calories",
    "Delete today's treadmill workout",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl rounded-3xl border border-white/15 bg-slate-900/95 p-5 sm:p-6 shadow-2xl text-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                AI Treadmill Voice Tracker
              </h2>
              <p className="text-xs text-slate-400">
                Speak naturally or type your treadmill distance, time, speed, and incline.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-2 rounded-2xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Voice Recording Control */}
        <div className="flex flex-col items-center justify-center p-4 rounded-2xl border border-white/10 bg-slate-950/60 gap-3 text-center">
          <button
            type="button"
            onClick={handleToggleRecord}
            className={`relative flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 cursor-pointer shadow-lg active:scale-95 ${
              isRecording
                ? "bg-rose-600 text-white ring-4 ring-rose-500/40 animate-pulse"
                : "bg-emerald-500 text-slate-950 hover:bg-emerald-400 hover:scale-105"
            }`}
          >
            {isRecording ? <Square className="w-6 h-6 fill-current" /> : <Mic className="w-7 h-7" />}
          </button>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              {isRecording ? (
                <>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                  <span className="text-xs font-bold text-rose-400 tracking-wider">
                    RECORDING {formatTimer(recordingSeconds)}
                  </span>
                </>
              ) : (
                <span className="text-xs font-semibold text-slate-300">
                  Click microphone to speak
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {isRecording
                ? "Listening... Click stop when done."
                : "Multimodal Gemini automatically extracts distance, time, speed, & calories."}
            </p>
          </div>
        </div>

        {/* Text Input Area */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Voice Transcript or Typed Notes</span>
            {inputText && (
              <button
                type="button"
                onClick={() => setInputText("")}
                className="text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                Clear
              </button>
            )}
          </label>
          <textarea
            rows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="e.g. 'Ran 4.2 km on treadmill in 30 minutes at speed 8.5 with 1 percent incline, burned 290 calories'..."
            disabled={isProcessing}
            className="w-full rounded-2xl border border-white/15 bg-slate-950/80 p-3 text-xs text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none resize-none leading-relaxed"
          />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
            Quick Examples
          </span>
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((prompt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setInputText(prompt)}
                className="rounded-xl border border-white/10 bg-slate-950/60 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-200 transition cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isProcessing || (!inputText.trim() && !isRecording && !audioBase64Ref.current)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition disabled:opacity-40 cursor-pointer shadow-md shadow-emerald-500/20"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing AI...</span>
              </>
            ) : (
              <>
                <Activity className="w-4 h-4" />
                <span>Apply to Fitness Log</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
