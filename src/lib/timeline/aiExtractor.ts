import {
  AiConfig,
  AiExtractionResult,
  ExtractedEventCandidate,
  ActivityJsonSchema,
} from "./types";
import { getAiConfig, getAllActivitySchemas, evolveActivitySchema } from "./storage";

/**
 * Heuristic/Regex fallback parser when no AI API key is configured
 */
function heuristicSpeechParser(spokenText: string, targetDate: string): ExtractedEventCandidate[] {
  const events: ExtractedEventCandidate[] = [];

  // Split on transition keywords like "Then", "Later", "After that", "Next", "Around"
  const sentences = spokenText
    .split(/(?:\.\s+|;\s+|\n+|(?:,\s+)?(?:then|later|after that|next|around\s+\d))\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  const cleanSentences = sentences.length > 0 ? sentences : [spokenText.trim()];

  for (const sentence of cleanSentences) {
    const lower = sentence.toLowerCase();

    // 1. Time extraction: e.g. "at 8am", "8:30 am", "at 14:00", "at 9 o'clock"
    const timeMatch = sentence.match(/(?:at|around|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    let startTime: string | undefined;
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const mins = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3]?.toLowerCase();
      if (meridiem === "pm" && hours < 12) hours += 12;
      if (meridiem === "am" && hours === 12) hours = 0;
      startTime = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    }

    // 2. Activity category classification
    let activityType = "GENERAL";
    let mood: string | undefined;
    const attributes: Record<string, any> = {};

    if (/run|jog|gym|workout|exercise|walk|cycling|yoga|swim|cardio|pushup/i.test(lower)) {
      activityType = "FITNESS";
      const kmMatch = sentence.match(/(\d+(?:\.\d+)?)\s*(?:km|kilometer|mile)s?/i);
      if (kmMatch) attributes.distanceKm = parseFloat(kmMatch[1]);
      const minMatch = sentence.match(/(\d+)\s*(?:min|minute)s?/i);
      if (minMatch) attributes.durationMins = parseInt(minMatch[1], 10);
      const calMatch = sentence.match(/(\d+)\s*(?:cal|calorie|kcal)s?/i);
      if (calMatch) attributes.caloriesBurned = parseInt(calMatch[1], 10);
    } else if (/breakfast|lunch|dinner|eat|ate|meal|snack|coffee|tea|juice|food/i.test(lower)) {
      activityType = "FOOD";
      if (/breakfast/i.test(lower)) attributes.mealType = "Breakfast";
      else if (/lunch/i.test(lower)) attributes.mealType = "Lunch";
      else if (/dinner/i.test(lower)) attributes.mealType = "Dinner";
      else if (/coffee|tea/i.test(lower)) attributes.mealType = "Coffee / Beverage";
    } else if (/meeting|standup|sprint|code|coding|review|client|work|call with|project/i.test(lower)) {
      activityType = "WORK";
      const withMatch = sentence.match(/(?:with|talking to)\s+([A-Z][a-z]+(?:\s+and\s+[A-Z][a-z]+)*)/);
      if (withMatch) attributes.collaborators = [withMatch[1]];
    } else if (/bought|purchased|spent|paid|rs|rupees|inr|dollar|\$/i.test(lower)) {
      activityType = "FINANCE";
      const amtMatch = sentence.match(/(?:rs\.?|inr|₹|\$)\s*(\d+(?:,\d+)*(?:\.\d+)?)/i) || sentence.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:rupees|rs|inr)/i);
      if (amtMatch) attributes.amount = parseFloat(amtMatch[1].replace(/,/g, ""));
    } else if (/drove|drive|cab|uber|ola|metro|flight|train|traffic|commute/i.test(lower)) {
      activityType = "TRAVEL";
    } else if (/felt|mood|grateful|gratitude|peaceful|tired|stressed|happy|exhausted/i.test(lower)) {
      activityType = "REFLECTION";
    }

    if (/great|amazing|awesome|energetic|happy|good/i.test(lower)) mood = "Energized";
    else if (/tired|exhausted|drained/i.test(lower)) mood = "Tired";
    else if (/focused|productive/i.test(lower)) mood = "Focused";
    else if (/stressed|overwhelmed/i.test(lower)) mood = "Stressed";

    // Format title
    const title = sentence
      .replace(/(?:at|around)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, "")
      .replace(/^(?:today|then|later|after that|next)\s*,?\s*/i, "")
      .trim();

    events.push({
      title: title.length > 50 ? `${title.slice(0, 47)}...` : title.charAt(0).toUpperCase() + title.slice(1),
      description: sentence,
      activityType,
      date: targetDate,
      startTime,
      mood,
      tags: [activityType.toLowerCase()],
      attributes,
    });
  }

  return events;
}

/**
 * OpenRouter AI Event Decomposer
 */
export async function extractLifeEventsFromSpeech(
  spokenText: string,
  options: {
    targetDate?: string;
    timezone?: string;
    autoEvolveSchema?: boolean;
    audioBase64?: string;
    audioMimeType?: string;
  } = {}
): Promise<AiExtractionResult> {
  const startTime = Date.now();
  const targetDate = options.targetDate || new Date().toISOString().split("T")[0];
  const autoEvolve = options.autoEvolveSchema !== false;

  const aiConfig = await getAiConfig();
  const currentSchemas = await getAllActivitySchemas();

  // If no API key is provided, gracefully use intelligent heuristic fallback
  if (!aiConfig.isConfigured || !aiConfig.apiKey) {
    console.log("[aiExtractor] No AI API key configured. Using heuristic fallback parser.");
    const fallbackEvents = heuristicSpeechParser(spokenText, targetDate);
    return {
      events: fallbackEvents,
      rawTranscript: spokenText,
      summaryOfNarration: `Parsed ${fallbackEvents.length} event(s) using heuristic engine (AI key not configured).`,
      modelUsed: "Heuristic Fallback Engine",
      executionDurationMs: Date.now() - startTime,
    };
  }

  // Build JSON Schemas summary context for the prompt
  const schemaContext = Object.entries(currentSchemas)
    .map(([type, s]) => {
      const fieldList = s.fields.map((f) => `${f.key} (${f.type}${f.unit ? ` - ${f.unit}` : ""})`).join(", ");
      return `- **${type}** (${s.title}): Standard attributes [${fieldList}]`;
    })
    .join("\n");

  const systemPrompt = `You are an expert personal diary and life timeline AI agent.
Your mission is to take a user's spoken stream-of-consciousness or daily summary narration and decompose it into distinct, chronological life events.

Current Date: ${targetDate}
Timezone: ${options.timezone || "Local"}

Known Activity Types and their existing JSON Schemas:
${schemaContext}

Standard Activity Types to assign:
"WORK" | "FITNESS" | "FOOD" | "FINANCE" | "SOCIAL" | "TRAVEL" | "REFLECTION" | "GENERAL"

RULES:
1. Split the user's speech into discrete individual events.
2. For each event:
   - "title": Short, crisp, and descriptive (3-6 words, e.g. "5km Morning Run in Park", "Won Colonist.io Online Match", "Oats & Almonds Breakfast").
   - "description": Complete context and narrative details mentioned for that specific event.
   - "activityType": Pick the best matching activity type from above.
   - "date": "${targetDate}" unless explicitly stated otherwise (e.g. yesterday, last night).
   - "startTime": 24-hour HH:MM format if mentioned or implied (e.g. "08:30", "14:15"). If approximate (e.g. "in the morning"), infer a reasonable time like "09:00" or leave empty if completely unspecified.
   - "endTime": 24-hour HH:MM if duration is given (e.g. started at 8:00 and ran for 30 min -> endTime: "08:30").
   - "durationMinutes": Number of minutes spent if stated or calculated.
   - "mood": One of ["Energized", "Focused", "Happy", "Calm", "Tired", "Stressed", "Reflective"] or null if neutral.
   - "tags": Array of 2-4 clean keyword tags (lowercase, e.g. ["gaming", "colonist", "online"]).
   - "attributes": Key-value dictionary. Use standard attribute keys from the schema whenever applicable.
   - "newAttributesDiscovered": If the user mentions relevant attributes that are NOT part of the standard attributes for that activity type (e.g. "gameName", "roundsPlayed", "bloodPressure"), list them in "newAttributesDiscovered" so our system can evolve the activity's JSON Schema!
     - "fieldKey": camelCase identifier (e.g. "gameName", "roundsPlayed")
     - "label": Human readable label (e.g. "Game Name", "Rounds Played")
     - "suggestedType": "string" | "number" | "boolean" | "list" | "unit_number"
     - "unit": optional unit
     - "sampleValue": The extracted value

PHONETIC SPEECH-TO-TEXT NORMALIZATION & ACCENT UNDERSTANDING:
The narration may contain phonetic homophones, speech recognition artifacts, brand name misspellings, or accented English slips.
Examples:
- "colonist.in online inversion" -> "Colonist.io online version"
- "I want the game" (when recounting score/session) -> "I won the game"
- "one origo" -> "one round" or "one match"
Intelligently infer the speaker's true intent, reconstruct actual proper names, and extract accurate life events!

Respond ONLY in valid JSON format matching this structure:
{
  "transcript": "Exact verbatim transcription of what was said in the audio",
  "summary": "Brief 1-sentence summary of the entire log",
  "events": [
    {
      "title": "Short crisp title",
      "description": "...",
      "activityType": "...",
      "date": "${targetDate}",
      "startTime": "...",
      "endTime": "...",
      "durationMinutes": 30,
      "mood": "...",
      "tags": ["..."],
      "attributes": { ... },
      "newAttributesDiscovered": [ ... ]
    }
  ]
}`;

  try {
    let parsed: any;
    let finalTranscript = spokenText;
    let modelUsed = aiConfig.model;

    const isGemini = aiConfig.provider === "gemini" || aiConfig.apiKey?.startsWith("AIzaSy");

    if (isGemini) {
      // ─────────────────────────────────────────────────────────────
      // Google Gemini 2.0 Flash Engine (Direct Audio + JSON)
      // ─────────────────────────────────────────────────────────────
      const geminiModel = aiConfig.model && aiConfig.model.includes("gemini") ? aiConfig.model : "gemini-2.0-flash";
      console.log(`[aiExtractor] Invoking Google Gemini (${geminiModel}) - Audio Multimodal: ${Boolean(options.audioBase64)}...`);

      const geminiRes = await extractWithGemini(
        aiConfig.apiKey,
        geminiModel,
        systemPrompt,
        spokenText,
        options.audioBase64,
        options.audioMimeType
      );

      parsed = geminiRes.parsed;
      if (geminiRes.transcript) {
        finalTranscript = geminiRes.transcript;
      }
      modelUsed = geminiRes.modelUsed;
    } else {
      // ─────────────────────────────────────────────────────────────
      // OpenRouter Engine
      // ─────────────────────────────────────────────────────────────
      console.log(`[aiExtractor] Invoking OpenRouter model "${aiConfig.model}"...`);
      const isFreeRouter = !aiConfig.model || aiConfig.model === "openrouter/free" || aiConfig.model.endsWith(":free");
      
      const requestBody: any = {
        model: aiConfig.model || "openrouter/free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: spokenText },
        ],
        temperature: 0.2,
      };

      if (isFreeRouter) {
        requestBody.models = [
          "nvidia/nemotron-3-super-120b-a12b:free",
          "inclusionai/ling-3.0-flash-fin:free",
          "google/gemma-4-31b-it:free",
        ];
      }

      if (!isFreeRouter && (aiConfig.model.includes("gpt-4") || aiConfig.model.includes("claude-3-5"))) {
        requestBody.response_format = { type: "json_object" };
      }

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${aiConfig.apiKey}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Track Everything AI - Life Events Diary",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
      }

      const resData = await response.json();
      const choice = resData.choices?.[0];
      
      let rawContent = choice?.message?.content || choice?.message?.reasoning || choice?.text || "";

      if (!rawContent || !rawContent.trim()) {
        throw new Error(`OpenRouter returned empty message content (model: ${resData.model || aiConfig.model}).`);
      }

      let cleanContent = rawContent.trim();
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(`Model (${resData.model || aiConfig.model}) returned non-JSON output: "${cleanContent.slice(0, 100)}"`);
      }
      cleanContent = jsonMatch[0];

      parsed = JSON.parse(cleanContent);
      modelUsed = resData.model || aiConfig.model;
    }

    const events: ExtractedEventCandidate[] = parsed.events || [];

    // Auto-evolve schemas if new attributes were discovered
    if (autoEvolve) {
      for (const ev of events) {
        if (ev.newAttributesDiscovered && ev.newAttributesDiscovered.length > 0) {
          try {
            await evolveActivitySchema(
              ev.activityType,
              ev.newAttributesDiscovered.map((na) => ({
                fieldKey: na.fieldKey,
                label: na.label,
                type: na.suggestedType,
                unit: na.unit,
                sampleValue: na.sampleValue,
              }))
            );
            console.log(
              `[aiExtractor] Auto-evolved schema for "${ev.activityType}" with ${ev.newAttributesDiscovered.length} new field(s).`
            );
          } catch (evolveErr) {
            console.warn(`[aiExtractor] Failed to auto-evolve schema for ${ev.activityType}:`, evolveErr);
          }
        }
      }
    }

    return {
      events,
      rawTranscript: finalTranscript,
      summaryOfNarration: parsed.summary || `Extracted ${events.length} event(s) from narration.`,
      modelUsed,
      executionDurationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    console.error("[aiExtractor] AI API extraction failed:", err);
    console.log("[aiExtractor] Falling back to heuristic parser due to API error.");

    const fallbackEvents = heuristicSpeechParser(spokenText, targetDate);
    return {
      events: fallbackEvents,
      rawTranscript: spokenText,
      summaryOfNarration: `Extracted ${fallbackEvents.length} event(s) via heuristic fallback (${err.message}).`,
      modelUsed: `Fallback Heuristic Engine (${err.message})`,
      executionDurationMs: Date.now() - startTime,
    };
  }
}

/**
 * Direct Google Gemini REST API caller with multimodal audio support
 */
async function extractWithGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  spokenText: string,
  audioBase64?: string,
  audioMimeType?: string
): Promise<{ parsed: any; transcript?: string; modelUsed: string }> {
  // Candidate flash models in order of recency
  const candidateModels = Array.from(new Set([
    model || "gemini-3.6-flash",
    "gemini-3.6-flash",
    "gemini-2.5-flash",
    "gemini-1.5-flash",
  ])).filter((m) => m.startsWith("gemini-"));

  const userParts: any[] = [];

  if (audioBase64) {
    userParts.push({
      inline_data: {
        mime_type: audioMimeType || "audio/webm",
        data: audioBase64,
      },
    });
    userParts.push({
      text: spokenText
        ? `Here is the user's recorded microphone audio. Browser live speech preview captured: "${spokenText}". Accurately transcribe the exact spoken words from the audio (comprehending Indian accents and gaming names like Colonist.io), and extract into the life events JSON matching the schema.`
        : "Accurately transcribe this audio recording (comprehending accents, slang, and brand names) and extract into the life events JSON matching the schema.",
    });
  } else {
    userParts.push({
      text: spokenText,
    });
  }

  const payload: any = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: userParts,
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  };

  let lastError: Error | null = null;

  for (const candidateModel of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 404) {
          console.warn(`[aiExtractor] Gemini model ${candidateModel} returned 404, trying next candidate...`);
          lastError = new Error(`Google Gemini model ${candidateModel} not found.`);
          continue;
        }

        // Handle prepayment credits depletion
        if (errText.includes("prepayment credits are depleted") || (response.status === 429 && errText.includes("RESOURCE_EXHAUSTED"))) {
          throw new Error(
            `Google Gemini: Prepayment credits are depleted on this project. To use Gemini 100% Free, create a key in Google AI Studio (aistudio.google.com) under a default project without Cloud billing attached, or switch to OpenRouter in AI Settings.`
          );
        }

        throw new Error(`Google Gemini API error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textContent || !textContent.trim()) {
        throw new Error("Google Gemini returned empty response content.");
      }

      let clean = textContent.trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        clean = jsonMatch[0];
      }

      const parsed = JSON.parse(clean);
      return {
        parsed,
        transcript: parsed.transcript || spokenText,
        modelUsed: `Google ${candidateModel}`,
      };
    } catch (err: any) {
      if (err.message.includes("Prepayment credits") || err.message.includes("API error")) {
        throw err;
      }
      lastError = err;
    }
  }

  throw lastError || new Error("All Google Gemini candidate models failed.");
}
