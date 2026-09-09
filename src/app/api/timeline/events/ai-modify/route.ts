import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse } from "@/lib/serverAuth";
import { getAiConfig } from "@/lib/timeline/storage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { currentEvent, prompt } = body;

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: "No modification prompt provided." }, { status: 400 });
    }

    const aiConfig = await getAiConfig();
    if (!aiConfig.isConfigured || !aiConfig.apiKey) {
      return NextResponse.json(
        { error: "AI API key is not configured. Please tap AI Settings to add your Gemini or OpenRouter key." },
        { status: 400 }
      );
    }

    const systemPrompt = `You are an expert life timeline and personal diary AI assistant.
Your job is to update an existing event's fields based on the user's natural language modification prompt.
The prompt may be in English, Tamil (தமிழ்), or Tanglish.

Current Event Data:
${JSON.stringify(currentEvent || {}, null, 2)}

User's Modification Request:
"${prompt.trim()}"

RULES:
1. Apply the user's requested modifications accurately while preserving untouched fields.
2. "startTime" & "endTime": Use 24-hour "HH:MM" format or null if not applicable or if user asked to remove/clear it.
3. "activityType": Must be one of ["WORK", "FITNESS", "FOOD", "FINANCE", "SOCIAL", "TRAVEL", "REFLECTION", "GENERAL"].
4. "mood": Must be one of ["Energized", "Focused", "Happy", "Calm", "Tired", "Stressed", "Reflective"] or null.
5. "tags": Array of lowercase strings.
6. "attributes": Key-value dictionary of activity-specific details.
7. Return ONLY a single valid JSON object with the updated fields:
{
  "title": string,
  "description": string,
  "activityType": string,
  "date": string,
  "startTime": string | null,
  "endTime": string | null,
  "mood": string | null,
  "tags": string[],
  "attributes": Record<string, any>,
  "changeSummary": string
}`;

    const isGemini = aiConfig.provider === "gemini" || aiConfig.apiKey?.startsWith("AIzaSy");
    let updatedEvent: any = null;

    if (isGemini) {
      const candidateModels = Array.from(new Set([
        aiConfig.model,
        "gemini-2.5-flash",
        "gemini-flash-latest",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-2.5-flash-lite",
      ])).filter(Boolean);

      const payload = {
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: `Please update the event according to: "${prompt.trim()}"` }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      };

      let lastError: Error | null = null;
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
            const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
            updatedEvent = JSON.parse(cleaned);
            break;
          }
        } catch (err: any) {
          lastError = err;
        }
      }

      if (!updatedEvent) {
        throw lastError || new Error("Failed to modify event using Gemini.");
      }
    } else {
      // OpenRouter Fallback
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${aiConfig.apiKey}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Track Everything AI - Event Modifier",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiConfig.model || "openrouter/free",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Please update the event according to: "${prompt.trim()}"` },
          ],
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenRouter API error (${res.status}): ${errText}`);
      }

      const resData = await res.json();
      const content = resData.choices?.[0]?.message?.content;
      if (content) {
        const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
        updatedEvent = JSON.parse(cleaned);
      }
    }

    if (!updatedEvent) {
      throw new Error("Could not parse updated event from AI response.");
    }

    return NextResponse.json({
      success: true,
      updatedEvent,
      changeSummary: updatedEvent.changeSummary || "Event updated with AI.",
    });
  } catch (error: any) {
    console.error("POST /api/timeline/events/ai-modify error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to modify event with AI." },
      { status: 500 }
    );
  }
}
