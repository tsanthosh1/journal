"use client";

import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, Settings, Trash2, X, AlertTriangle, Send } from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  provider?: string;
}

interface JournalChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate?: string;
  onOpenAiSettings?: () => void;
}

const QUICK_PROMPTS = [
  { label: "What did I do recently?", prompt: "Give me a summary of my recent activities and events across my journal." },
  { label: "Workout & Fitness Summary", prompt: "Summarize my workouts, exercises, and fitness activities recorded in my journal." },
  { label: "What have I been eating?", prompt: "What meals, food, or drinks have I logged recently?" },
  { label: "Gaming & Hobbies", prompt: "What games or leisure activities did I play and when?" },
  { label: "தமிழ்: இந்த வாரம் என்ன செய்தேன்?", prompt: "இந்த வாரம் நான் என்னென்ன காரியங்கள் செய்தேன் என்று தமிழில் சுருக்கமாக சொல்லுங்க." },
];

export function JournalChatDrawer({
  isOpen,
  onClose,
  selectedDate,
  onOpenAiSettings,
}: JournalChatDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome-msg",
      role: "assistant",
      content:
        "**Hello! I'm your Diary AI Assistant.**\n\nI have complete access to your logged life events, workouts, meals, moods, gaming, and habits. You can ask me anything about your past days, patterns, or totals in **English, Tamil (தமிழ்), or Tanglish**!",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventsCount, setEventsCount] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isOpen]);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMsgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputMessage("");
    setError(null);
    setIsLoading(true);

    try {
      // Send conversation history to backend route
      const apiMessages = newHistory
        .filter((m) => m.id !== "welcome-msg")
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const res = await fetch("/api/timeline/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to get AI response");
      }

      if (typeof data.eventsCount === "number") {
        setEventsCount(data.eventsCount);
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.reply || "I couldn't generate a response based on your journal.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        provider: data.provider,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error("Chat error:", err);
      setError(err.message || "Failed to get response");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: "welcome-msg-cleared",
        role: "assistant",
        content:
          "**Chat cleared.** Ask me anything about your recorded journal, habits, or workouts!",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setError(null);
  };

  // Helper to render basic Markdown elements cleanly (bold, lists, code, linebreaks)
  const renderFormattedContent = (content: string) => {
    const lines = content.split("\n");
    return (
      <div className="space-y-1.5 text-sm leading-relaxed">
        {lines.map((line, idx) => {
          if (!line.trim()) {
            return <div key={idx} className="h-2" />;
          }

          // List item
          if (line.startsWith("- ") || line.startsWith("* ") || /^\d+\.\s/.test(line)) {
            const cleanText = line.replace(/^[-*]\s+|\d+\.\s+/, "");
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className="text-cyan-400 mt-1 text-xs select-none">•</span>
                <span className="flex-1">{renderInlineFormatting(cleanText)}</span>
              </div>
            );
          }

          // Headers
          if (line.startsWith("### ")) {
            return (
              <h4 key={idx} className="text-sm font-bold text-cyan-300 pt-2 pb-0.5">
                {renderInlineFormatting(line.slice(4))}
              </h4>
            );
          }
          if (line.startsWith("## ")) {
            return (
              <h3 key={idx} className="text-base font-extrabold text-white pt-2.5 pb-1">
                {renderInlineFormatting(line.slice(3))}
              </h3>
            );
          }

          return <p key={idx}>{renderInlineFormatting(line)}</p>;
        })}
      </div>
    );
  };

  // Inline formatting helper for bold **text** and code `inline`
  const renderInlineFormatting = (text: string) => {
    // Split by markdown bold **
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-bold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={i}
            className="rounded bg-slate-950/70 border border-white/10 px-1.5 py-0.5 font-mono text-[11px] text-cyan-300"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      {/* Drawer Container */}
      <div className="w-full max-w-xl h-full flex flex-col bg-slate-900 border-l border-white/10 shadow-2xl overflow-hidden">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/60 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 text-cyan-400 font-bold text-lg shadow-inner">
              <MessageSquare className="w-5 h-5 text-cyan-400" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Diary AI Companion</h2>
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Context
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {eventsCount !== null ? `${eventsCount} events loaded` : "Connected to your journal"} • Supports English & தமிழ்
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenAiSettings && (
              <button
                type="button"
                onClick={onOpenAiSettings}
                className="rounded-xl border border-white/10 bg-slate-800/80 p-2 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition cursor-pointer"
                title="Configure AI API Key"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleClearChat}
              className="rounded-xl border border-white/10 bg-slate-800/80 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Clear conversation"
            >
              <span className="inline-flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Suggestion Pills */}
        <div className="flex items-center gap-2 overflow-x-auto px-6 py-2.5 border-b border-white/5 bg-slate-950/30 scrollbar-none">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
            Suggested:
          </span>
          {QUICK_PROMPTS.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(item.prompt)}
              className="inline-flex items-center rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-500/15 hover:border-cyan-500/40 transition shrink-0 cursor-pointer"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Chat Message List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {isUser ? "You" : "Diary AI"}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">{msg.timestamp}</span>
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl p-4 shadow-md ${
                    isUser
                      ? "rounded-tr-sm bg-gradient-to-br from-cyan-600 to-blue-600 text-white shadow-cyan-950/40 font-medium"
                      : "rounded-tl-sm bg-slate-800/80 border border-white/10 text-slate-200 backdrop-blur-md"
                  }`}
                >
                  {renderFormattedContent(msg.content)}
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isLoading && (
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                  Diary AI
                </span>
                <span className="text-[10px] text-slate-500">analyzing journal...</span>
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-slate-800/80 border border-white/10 p-4 text-slate-300 flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce" />
                  <span className="h-2 w-2 rounded-full bg-blue-400 animate-bounce [animation-delay:0.2s]" />
                  <span className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.4s]" />
                </div>
                <span className="text-xs text-slate-400">Searching your memory events...</span>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{error}</p>
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  className="mt-2 font-bold text-rose-200 underline hover:text-white cursor-pointer"
                >
                  Retry Request
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-white/10 bg-slate-950/80 backdrop-blur-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2"
          >
            <div className="flex-1 relative rounded-2xl border border-white/15 bg-slate-900/90 focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500 transition shadow-inner">
              <textarea
                ref={textareaRef}
                rows={2}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your day, workouts, meals... (Enter to send, தமிழ் ஆதரிக்கும்)"
                className="w-full resize-none bg-transparent px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none scrollbar-none"
              />
              <div className="flex items-center justify-between px-3 pb-2 text-[10px] text-slate-500">
                <span>Shift + Enter for new line</span>
                <span className="text-cyan-400/80">English / தமிழ் / Tanglish</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              className={`flex h-12 w-12 items-center justify-center rounded-2xl transition cursor-pointer shrink-0 shadow-lg ${
                inputMessage.trim() && !isLoading
                  ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold shadow-cyan-500/25 hover:scale-105 active:scale-95"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5"
              }`}
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
