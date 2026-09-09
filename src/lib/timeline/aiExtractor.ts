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
  } = {}
): Promise<AiExtractionResult> {
  const startTime = Date.now();
  const targetDate = options.targetDate || new Date().toISOString().split("T")[0];
  const autoEvolve = options.autoEvolveSchema !== false;

  const aiConfig = await getAiConfig();
  const currentSchemas = await getAllActivitySchemas();

  // If no API key is provided, gracefully use intelligent heuristic fallback
  if (!aiConfig.isConfigured || !aiConfig.apiKey) {
    console.log("[aiExtractor] No OpenRouter API key configured. Using heuristic fallback parser.");
    const fallbackEvents = heuristicSpeechParser(spokenText, targetDate);
    return {
      events: fallbackEvents,
      rawTranscript: spokenText,
      summaryOfNarration: `Parsed ${fallbackEvents.length} event(s) using heuristic engine (OpenRouter key not configured).`,
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
   - "title": Short, crisp, and descriptive (3-6 words, e.g. "5km Morning Run in Park", "Sprint Planning Meeting", "Oats & Almonds Breakfast").
   - "description": Complete context and narrative details mentioned for that specific event.
   - "activityType": Pick the best matching activity type from above.
   - "date": "${targetDate}" unless explicitly stated otherwise (e.g. yesterday, last night).
   - "startTime": 24-hour HH:MM format if mentioned or implied (e.g. "08:30", "14:15"). If approximate (e.g. "in the morning"), infer a reasonable time like "09:00" or leave empty if completely unspecified.
   - "endTime": 24-hour HH:MM if duration is given (e.g. started at 8:00 and ran for 30 min -> endTime: "08:30").
   - "durationMinutes": Number of minutes spent if stated or calculated.
   - "mood": One of ["Energized", "Focused", "Happy", "Calm", "Tired", "Stressed", "Reflective"] or null if neutral.
   - "tags": Array of 2-4 clean keyword tags (lowercase, e.g. ["running", "cardio", "morning"]).
   - "attributes": Key-value dictionary. Use standard attribute keys from the schema whenever applicable.
   - "newAttributesDiscovered": If the user mentions relevant attributes that are NOT part of the standard attributes for that activity type (e.g. "blood pressure", "coffee rating", "shoes used", "podcast listened to"), list them in "newAttributesDiscovered" so our system can evolve the activity's JSON Schema!
     - "fieldKey": camelCase identifier (e.g. "bloodPressure", "coffeeRating")
     - "label": Human readable label (e.g. "Blood Pressure", "Coffee Rating")
     - "suggestedType": "string" | "number" | "boolean" | "list" | "unit_number"
     - "unit": optional unit (e.g. "bpm", "mmHg", "stars")
     - "sampleValue": The extracted value

Respond ONLY in valid JSON format matching this structure:
{
  "summary": "Brief 1-sentence summary of the entire log",
  "events": [
    {
      "title": "...",
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
    console.log(`[aiExtractor] Invoking OpenRouter model "${aiConfig.model}"...`);
    const isFreeRouter = aiConfig.model === "openrouter/free";
    const requestBody: any = {
      model: aiConfig.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: spokenText },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    };

    // If using the free router, configure fallback chain across top free models
    if (isFreeRouter) {
      requestBody.models = [
        "openrouter/free",
        "google/gemini-2.0-flash-exp:free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "qwen/qwen-2.5-72b-instruct:free",
      ];
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
    const content = resData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("OpenRouter returned empty message content.");
    }

    const parsed = JSON.parse(content);
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
      rawTranscript: spokenText,
      summaryOfNarration: parsed.summary || `Extracted ${events.length} event(s) from spoken transcript.`,
      modelUsed: resData.model || aiConfig.model,
      executionDurationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    console.error("[aiExtractor] OpenRouter API extraction failed:", err);
    console.log("[aiExtractor] Falling back to heuristic parser due to API error.");

    const fallbackEvents = heuristicSpeechParser(spokenText, targetDate);
    return {
      events: fallbackEvents,
      rawTranscript: spokenText,
      summaryOfNarration: `Extracted ${fallbackEvents.length} event(s) via heuristic fallback (OpenRouter error: ${err.message}).`,
      modelUsed: `Fallback Heuristic Engine (${err.message})`,
      executionDurationMs: Date.now() - startTime,
    };
  }
}
