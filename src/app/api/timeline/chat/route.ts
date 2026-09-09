import { NextRequest, NextResponse } from "next/server";
import { getAiConfig, getAllUserLifeEvents } from "@/lib/timeline/storage";
import { LifeEvent } from "@/lib/timeline/types";

export const dynamic = "force-dynamic";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messages: ChatMessage[] = body.messages || [];

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 });
    }

    const aiConfig = await getAiConfig();
    const allEvents = await getAllUserLifeEvents("default_user");

    // Filter events if date range specified
    let events = allEvents;
    if (body.dateRange?.start && body.dateRange?.end) {
      events = allEvents.filter(
        (ev) => ev.date >= body.dateRange.start && ev.date <= body.dateRange.end
      );
    }

    // If no AI key is configured, return helpful response
    if (!aiConfig.isConfigured || !aiConfig.apiKey) {
      return NextResponse.json({
        success: true,
        reply: `I see you have **${events.length} life events** recorded in your diary! However, no AI API key is configured yet. Please tap **AI Settings** to add your free Google Gemini or OpenRouter API key so I can deeply analyze, summarize, and converse about your journal.`,
        eventsCount: events.length,
      });
    }

    // Format events chronologically as clean Markdown context
    const formattedEvents = events.slice(0, 150).map((ev, index) => {
      const parts: string[] = [
        `[#${index + 1}] Date: ${ev.date}${ev.startTime ? ` at ${ev.startTime}` : ""}${ev.endTime ? ` - ${ev.endTime}` : ""}`,
        `Category: ${ev.activityType}`,
        `Title: ${ev.title}`,
      ];

      if (ev.description) parts.push(`Details: ${ev.description}`);
      if (ev.durationMinutes) parts.push(`Duration: ${ev.durationMinutes} minutes`);
      if (ev.mood) parts.push(`Mood: ${ev.mood}`);
      if (ev.tags && ev.tags.length > 0) parts.push(`Tags: [${ev.tags.join(", ")}]`);

      if (ev.attributes && Object.keys(ev.attributes).length > 0) {
        const attrStr = Object.entries(ev.attributes)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
          .join(" | ");
        parts.push(`Attributes: { ${attrStr} }`);
      }

      return parts.join("\n");
    }).join("\n---\n");

    const todayStr = new Date().toISOString().split("T")[0];

    const systemPrompt = `You are "Journal AI", the user's personal memory assistant and life companion.
You have direct, intimate access to the user's authentic daily journal, life events, workouts, meals, moods, and habits.

Current Date: ${todayStr}
Total Events in User's Journal: ${events.length}

=== USER'S RECORDED LIFE EVENTS & TIMELINE CONTEXT ===
${formattedEvents || "No recorded events yet."}
====================================================

YOUR CAPABILITIES & INSTRUCTIONS:
1. Answer the user's questions with empathy, precision, and helpful insights based strictly on their actual journal data.
2. You can summarize days/weeks, calculate totals (e.g. total workout minutes, meals, gaming matches), uncover behavioral patterns, and track mood changes over time.
3. Always cite specific dates and event titles when answering (e.g. "On September 9, 2026, you won a Colonist.io match...").
4. If the user asks about something that is not mentioned in their recorded events, politely let them know it hasn't been logged in their diary yet.
5. MULTILINGUAL (ENGLISH, TAMIL தமிழ், TANGLISH):
   - If the user asks in Tamil (தமிழ்), reply naturally in Tamil.
   - If the user asks in Tanglish (e.g. "inniku enna saapten?"), reply in Tanglish or Tamil with warm, conversational clarity.
   - If the user asks in English, reply in English.
6. Format your responses with clear Markdown (bold headers, bullet points, clean numbers). Keep answers concise and direct unless the user asks for a detailed retrospective.`;

    let reply = "";
    const isGemini = aiConfig.provider === "gemini" || aiConfig.apiKey?.startsWith("AIzaSy");

    if (isGemini) {
      // ─────────────────────────────────────────────────────────────
      // Google Gemini Engine with Multi-Model Fallback
      // ─────────────────────────────────────────────────────────────
      const candidateModels = Array.from(new Set([
        aiConfig.model,
        "gemini-2.5-flash",
        "gemini-flash-latest",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-2.5-flash-lite",
      ])).filter(Boolean);

      // Build Gemini conversation contents
      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const payload = {
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents,
        generationConfig: {
          temperature: 0.3,
        },
      };

      let lastError: Error | null = null;
      let succeeded = false;

      for (const candidateModel of candidateModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${aiConfig.apiKey}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            const errText = await res.text();
            if ([404, 429, 500, 502, 503, 504].includes(res.status)) {
              lastError = new Error(`Gemini ${candidateModel} status ${res.status}`);
              await new Promise((r) => setTimeout(r, 400));
              continue;
            }
            throw new Error(`Gemini error (${res.status}): ${errText}`);
          }

          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            reply = text;
            succeeded = true;
            break;
          }
        } catch (err: any) {
          lastError = err;
        }
      }

      if (!succeeded) {
        throw lastError || new Error("Failed to get response from Gemini models.");
      }
    } else {
      // ─────────────────────────────────────────────────────────────
      // OpenRouter Engine
      // ─────────────────────────────────────────────────────────────
      const openRouterMessages = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      ];

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${aiConfig.apiKey}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Track Everything AI - Journal Chat",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiConfig.model || "openrouter/free",
          messages: openRouterMessages,
          temperature: 0.3,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenRouter API error (${res.status}): ${errText}`);
      }

      const resData = await res.json();
      reply = resData.choices?.[0]?.message?.content || "";
    }

    return NextResponse.json({
      success: true,
      reply,
      eventsCount: events.length,
      provider: aiConfig.provider,
    });
  } catch (error: any) {
    console.error("POST /api/timeline/chat error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process chat query." },
      { status: 500 }
    );
  }
}
