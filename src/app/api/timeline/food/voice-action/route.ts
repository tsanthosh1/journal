import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUser, unauthorizedResponse } from "@/lib/serverAuth";
import {
  saveLifeEvent,
  updateLifeEvent,
  deleteLifeEvent,
  getLifeEventById,
  getAiConfig,
} from "@/lib/timeline/storage";
import { resolveGeminiCandidateModels } from "@/lib/timeline/geminiModels";
import { FoodPrimaryAnchor, FoodOccasion, FoodOccasionType, FoodSourceType, LifeEvent } from "@/lib/timeline/types";
import { recordFoodItemsConsumed } from "@/lib/timeline/foodMasterStorage";
import {
  parseRelativeOrAbsoluteTime,
  inferAnchorFromTime,
  inferOccasionFromTime,
  getRelativeDate,
} from "@/lib/timeline/relativeTimeParser";

export const dynamic = "force-dynamic";

interface VoiceCalendarAction {
  action: "CREATE" | "UPDATE" | "DELETE";
  targetEventId?: string;
  date?: string;
  startTime?: string;
  title?: string;
  primaryAnchor?: FoodPrimaryAnchor;
  occasionType?: FoodOccasionType;
  occasion?: FoodOccasion;
  mealType?: string;
  foodItems?: string[];
  sourceType?: FoodSourceType;
  sourceName?: string | null;
  caloriesEst?: number | null;
  dietaryNotes?: string | null;
}

interface VoiceApiResponse {
  transcript?: string;
  summary: string;
  actions: VoiceCalendarAction[];
}

function ruleBasedVoiceParser(
  text: string,
  todayDate: string,
  existingEvents: Array<any>,
  currentTime?: string
): VoiceApiResponse {
  const actions: VoiceCalendarAction[] = [];
  const lower = text.toLowerCase();

  // Check for delete commands
  if (/\b(delete|remove|cancel|clear)\b/.test(lower)) {
    let matchedEvent: any = null;
    if (/\bbreakfast\b/.test(lower)) {
      matchedEvent = existingEvents.find((e) => (e.attributes?.primaryAnchor === "Breakfast" || /breakfast/i.test(e.title)) && e.date === todayDate);
    } else if (/\blunch\b/.test(lower)) {
      matchedEvent = existingEvents.find((e) => (e.attributes?.primaryAnchor === "Lunch" || /lunch/i.test(e.title)) && e.date === todayDate);
    } else if (/\bdinner\b/.test(lower)) {
      matchedEvent = existingEvents.find((e) => (e.attributes?.primaryAnchor === "Dinner" || /dinner/i.test(e.title)) && e.date === todayDate);
    }

    if (matchedEvent) {
      actions.push({
        action: "DELETE",
        targetEventId: matchedEvent.id,
      });
      return {
        transcript: text,
        summary: `Deleted ${matchedEvent.title || "meal entry"}.`,
        actions,
      };
    }
  }

  // Check for updates to existing entries (e.g. "change lunch to 2pm", "move dinner to 8:30pm", "change lunch to swiggy")
  const isUpdate = /\b(change|update|move|reschedule|edit|switch)\b/.test(lower);
  if (isUpdate && existingEvents.length > 0) {
    let target = existingEvents.find((e) => e.date === todayDate && (
      (/\blunch\b/.test(lower) && e.attributes?.primaryAnchor === "Lunch") ||
      (/\bbreakfast\b/.test(lower) && e.attributes?.primaryAnchor === "Breakfast") ||
      (/\bdinner\b/.test(lower) && e.attributes?.primaryAnchor === "Dinner")
    ));

    if (!target) {
      target = existingEvents[0];
    }

    if (target) {
      const parsedTime = parseRelativeOrAbsoluteTime(text, currentTime, todayDate);
      let newTime = target.startTime;
      if (parsedTime.hasTime && parsedTime.startTime) {
        newTime = parsedTime.startTime;
      }

      let newSourceType = target.attributes?.sourceType;
      let newSourceName = target.attributes?.sourceName;
      if (/\bswiggy\b/i.test(lower)) {
        newSourceType = "Online Delivery";
        newSourceName = "Swiggy";
      } else if (/\bzomato\b/i.test(lower)) {
        newSourceType = "Online Delivery";
        newSourceName = "Zomato";
      } else if (/\bhotel|restaurant\b/i.test(lower)) {
        newSourceType = "Hotel / Restaurant";
      } else if (/\bhome|cooked\b/i.test(lower)) {
        newSourceType = "Home Cooked";
      }

      actions.push({
        action: "UPDATE",
        targetEventId: target.id,
        startTime: newTime,
        sourceType: newSourceType,
        sourceName: newSourceName,
      });

      return {
        transcript: text,
        summary: `Updated ${target.title || "meal"} details.`,
        actions,
      };
    }
  }

  // Split into multiple sentences/clauses for multi-entry creation
  const clauses = text
    .split(/(?:\band\b|\bthen\b|\blater\b|\bafter that\b|[;,\n]+)/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 3);

  const entriesToProcess = clauses.length > 0 ? clauses : [text.trim()];

  for (const clause of entriesToProcess) {
    const cLower = clause.toLowerCase();
    const isBreakfast = /\b(breakfast|idli|dosa|poha|cereal|upma)\b/.test(cLower);
    const isDinner = /\b(dinner|supper|night)\b/.test(cLower);
    const isSnack = /\b(snack|coffee|tea|juice|biscuit|cookie|smoothie)\b/.test(cLower);

    const parsedTime = parseRelativeOrAbsoluteTime(clause, currentTime, todayDate);
    const entryDate = parsedTime.date || todayDate;

    let anchor: FoodPrimaryAnchor = "Lunch";
    let startTime: string;

    if (parsedTime.hasTime && parsedTime.startTime) {
      startTime = parsedTime.startTime;
      if (isBreakfast) {
        anchor = "Breakfast";
      } else if (isDinner) {
        anchor = "Dinner";
      } else {
        anchor = inferAnchorFromTime(startTime);
      }
    } else {
      if (isBreakfast) {
        anchor = "Breakfast";
        startTime = "08:30";
      } else if (isDinner) {
        anchor = "Dinner";
        startTime = "20:00";
      } else {
        anchor = "Lunch";
        startTime = "13:00";
      }
    }

    const occasion = inferOccasionFromTime(startTime, isSnack);
    const occasionType: FoodOccasionType = isSnack ? "Snack" : "Main Meal";

    let sourceType: FoodSourceType = "Home Cooked";
    let sourceName: string | null = null;
    if (/\bswiggy\b/.test(cLower)) {
      sourceType = "Online Delivery";
      sourceName = "Swiggy";
    } else if (/\bzomato\b/.test(cLower)) {
      sourceType = "Online Delivery";
      sourceName = "Zomato";
    } else if (/\bhotel|restaurant\b/.test(cLower)) {
      sourceType = "Hotel / Restaurant";
    } else if (/\btakeaway|parcel\b/.test(cLower)) {
      sourceType = "Takeaway";
    }

    const cleanTitle = parsedTime.cleanText;

    actions.push({
      action: "CREATE",
      date: entryDate,
      startTime,
      title: cleanTitle ? cleanTitle : `${anchor} Meal`,
      primaryAnchor: anchor,
      occasionType,
      occasion,
      mealType: anchor,
      foodItems: cleanTitle ? [cleanTitle] : [anchor],
      sourceType,
      sourceName,
    });
  }

  return {
    transcript: text,
    summary: `Created ${actions.length} food calendar ${actions.length === 1 ? "entry" : "entries"}.`,
    actions,
  };
}

export async function POST(request: NextRequest) {
  const user = await getVerifiedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const {
      audioBase64,
      audioMimeType = "audio/webm",
      speechText = "",
      todayDate = new Date().toISOString().split("T")[0],
      currentTime: clientCurrentTime,
      weekRange,
      existingEvents = [],
    } = body;

    const now = new Date();
    const currentTime = clientCurrentTime || `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const authUserId = user.email || user.primaryUserId || user.uid;
    const userId = (body.userId && body.userId !== "default_user") ? body.userId : authUserId;

    if (!audioBase64 && !speechText.trim()) {
      return NextResponse.json(
        { error: "No voice audio or text provided." },
        { status: 400 }
      );
    }

    let parsedResult: VoiceApiResponse | null = null;
    const aiConfig = await getAiConfig();

    if (aiConfig?.apiKey && (!aiConfig.provider || aiConfig.provider === "gemini")) {
      const candidateModels = resolveGeminiCandidateModels(aiConfig.model);

      const yesterdayDate = getRelativeDate(todayDate, -1);
      const dayBeforeYesterdayDate = getRelativeDate(todayDate, -2);
      const tomorrowDate = getRelativeDate(todayDate, 1);

      const systemPrompt = `You are an AI assistant controlling an interactive Food Calendar application.
The user speaks or types food tracking instructions. You have the power to:
1. "CREATE" multiple new food entries across dates and times.
2. "UPDATE" existing entries from the provided list (change time, title, food items, dining source, etc.).
3. "DELETE" existing entries from the provided list.

Reference Context:
- Current Reference Date: "${todayDate}"
- Current Reference Local Time: "${currentTime}" (24-hour HH:MM format, local time)
- Week Range: ${JSON.stringify(weekRange || {})}
- Existing Events in this week:
${JSON.stringify(
  existingEvents.map((e: any) => ({
    id: e.id,
    date: e.date,
    startTime: e.startTime,
    title: e.title,
    primaryAnchor: e.attributes?.primaryAnchor,
    occasion: e.attributes?.occasion,
    sourceType: e.attributes?.sourceType,
    sourceName: e.attributes?.sourceName,
    foodItems: e.attributes?.foodItems,
  })),
  null,
  2
)}

Date Resolution Rules:
- "today": "${todayDate}"
- "yesterday" / "last night": "${yesterdayDate}"
- "day before yesterday": "${dayBeforeYesterdayDate}"
- "tomorrow": "${tomorrowDate}"
CRITICAL DATE RULE: If the user says "yesterday", "last night", or a specific weekday, you MUST set the "date" field to the exact calculated date (e.g. "${yesterdayDate}"), NEVER defaulting to today!

CRITICAL RELATIVE TIME RULES:
When the user specifies relative time, compute the exact 24-hour "HH:MM" startTime relative to "${currentTime}":
- "now" / "just now" / "right now" / "just ate": use "${currentTime}"
- "few mins back" / "a few minutes back" / "few mins ago" / "couple mins back": subtract 5 minutes from "${currentTime}"
- "X mins back" / "X minutes ago" / "X mins before": subtract X minutes from "${currentTime}" (e.g. if "${currentTime}" is 14:35 and user says "10 mins back", startTime is "14:25")
- "1 hour back" / "an hour ago" / "1 hr ago" / "one hour ago": subtract 60 minutes from "${currentTime}" (e.g. if "${currentTime}" is 14:35, startTime is "13:35")
- "X hours back" / "X hours ago": subtract X hours from "${currentTime}" (e.g. if "${currentTime}" is 14:35 and user says "2 hours back", startTime is "12:35")
- "half an hour back" / "half an hour ago": subtract 30 minutes from "${currentTime}" (e.g. if "${currentTime}" is 14:35, startTime is "14:05")
- If subtracting relative time crosses midnight backwards (before 00:00), adjust "startTime" accordingly (e.g. 00:15 - 30 mins = "23:45") and set "date" to "${yesterdayDate}".

PRIMARY ANCHOR & OCCASION ALIGNMENT:
Automatically align "primaryAnchor" with the computed "startTime" (unless user explicitly named a different meal type):
- 04:00 to 11:29 -> "Breakfast"
- 11:30 to 16:59 -> "Lunch"
- 17:00 to 03:59 -> "Dinner"
Set "occasion" accordingly (e.g. "Lunch / Brunch" for main meals between 11:30 and 16:59, or "Post-Lunch Snack" for tea/coffee/snacks).

TITLE & FOOD ITEMS HYGIENE:
Do NOT include relative time expressions ("now", "just now", "1 hour back", "few mins back", "at 2pm") in the "title" or "foodItems" fields. Clean them!
E.g. "had curd rice 1 hour back" -> title: "Curd Rice", foodItems: ["Curd Rice"], startTime: computed time.

Valid Primary Anchors: "Breakfast", "Lunch", "Dinner".
Valid Occasion Types: "Main Meal", "Snack".
Valid Occasions: "Pre-Breakfast Snack", "Breakfast", "Post-Breakfast Snack", "Pre-Lunch Snack", "Lunch / Brunch", "Post-Lunch Snack", "Pre-Dinner Snack", "Dinner / Supper", "Post-Dinner Snack", "Midnight Snack".
Valid Source Types: "Home Cooked", "Hotel / Restaurant", "Online Delivery", "Takeaway", "Other".
Common source names: "Swiggy", "Zomato", or the restaurant/hotel name.

You MUST output strict JSON conforming to this schema:
{
  "transcript": "Exact spoken or typed text",
  "summary": "Friendly, concise 1-sentence summary of what actions you took (e.g. 'Created 2 meals and updated lunch to 1:30 PM')",
  "actions": [
    {
      "action": "CREATE" | "UPDATE" | "DELETE",
      "targetEventId": "string (REQUIRED for UPDATE and DELETE: must match an existing event id)",
      "date": "YYYY-MM-DD (e.g. ${todayDate})",
      "startTime": "HH:MM (24-hour format, e.g. 08:30, 13:15, 20:00)",
      "title": "Clear meal title (e.g. Masala Dosa, Swiggy Biryani)",
      "primaryAnchor": "Breakfast" | "Lunch" | "Dinner",
      "occasionType": "Main Meal" | "Snack",
      "occasion": "Breakfast" | "Lunch / Brunch" | "Dinner / Supper" | "...",
      "mealType": "Breakfast" | "Lunch" | "Dinner" | "Snack",
      "foodItems": ["item 1", "item 2"],
      "sourceType": "Home Cooked" | "Hotel / Restaurant" | "Online Delivery" | "Takeaway" | "Other",
      "sourceName": "Swiggy / Zomato / Restaurant Name or null",
      "caloriesEst": number or null,
      "dietaryNotes": string or null
    }
  ]
}`;

      const userParts: any[] = [];
      if (audioBase64) {
        userParts.push({
          inline_data: {
            mime_type: audioMimeType,
            data: audioBase64,
          },
        });
        userParts.push({
          text: speechText
            ? `Microphone audio recording attached. Web speech preview detected: "${speechText}". Accurately transcribe audio (supporting Indian accents, Swiggy, Zomato, hotels) and output JSON actions.`
            : "Accurately transcribe the microphone audio and output JSON actions to create, update, or delete meals.",
        });
      } else {
        userParts.push({ text: speechText });
      }

      const payload = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: userParts }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      };

      for (const model of candidateModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiConfig.apiKey}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            const data = await res.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textResponse) {
              parsedResult = JSON.parse(textResponse);
              break;
            }
          }
        } catch (modelErr) {
          console.warn(`[voice-action] Gemini model ${model} attempt failed:`, modelErr);
        }
      }
    }

    if (!parsedResult || !Array.isArray(parsedResult.actions) || parsedResult.actions.length === 0) {
      parsedResult = ruleBasedVoiceParser(speechText || "Meal entry", todayDate, existingEvents, currentTime);
    }

    // Execute the actions
    const appliedActions: any[] = [];

    for (const act of parsedResult.actions) {
      if (act.action === "DELETE" && act.targetEventId) {
        await deleteLifeEvent(act.targetEventId);
        appliedActions.push({ action: "DELETE", eventId: act.targetEventId });
      } else if (act.action === "UPDATE" && act.targetEventId) {
        const existing = await getLifeEventById(act.targetEventId);
        if (existing) {
          const attributes = {
            ...(existing.attributes || {}),
            primaryAnchor: act.primaryAnchor || existing.attributes?.primaryAnchor || "Lunch",
            occasionType: act.occasionType || existing.attributes?.occasionType || "Main Meal",
            occasion: act.occasion || existing.attributes?.occasion || "Lunch / Brunch",
            mealType: act.mealType || existing.attributes?.mealType || act.primaryAnchor,
            foodItems: act.foodItems && act.foodItems.length > 0 ? act.foodItems : existing.attributes?.foodItems || [],
            sourceType: act.sourceType || existing.attributes?.sourceType || "Home Cooked",
            sourceName: act.sourceName !== undefined ? act.sourceName : existing.attributes?.sourceName,
            caloriesEst: act.caloriesEst ?? existing.attributes?.caloriesEst,
            dietaryNotes: act.dietaryNotes ?? existing.attributes?.dietaryNotes,
          };

          const updated = await updateLifeEvent(act.targetEventId, {
            title: act.title || existing.title,
            startTime: act.startTime !== undefined ? act.startTime : existing.startTime,
            date: act.date || existing.date,
            attributes,
          });

          if (act.foodItems && act.foodItems.length > 0) {
            await recordFoodItemsConsumed(
              userId,
              act.foodItems,
              attributes.primaryAnchor,
              attributes.occasion,
              act.date || existing.date
            );
          }

          appliedActions.push({ action: "UPDATE", event: updated });
        }
      } else if (act.action === "CREATE") {
        const anchor = act.primaryAnchor || "Lunch";
        const occasionType = act.occasionType || "Main Meal";
        const occasion = act.occasion || (anchor === "Breakfast" ? "Breakfast" : anchor === "Lunch" ? "Lunch / Brunch" : "Dinner / Supper");
        const entryDate = act.date || todayDate;
        const sourceType = act.sourceType || "Home Cooked";

        const newEventData: Omit<LifeEvent, "id"> = {
          userId,
          date: entryDate,
          title: act.title || `${anchor} Meal`,
          description: act.dietaryNotes || act.title || "Voice logged meal",
          activityType: "FOOD",
          startTime: act.startTime || undefined,
          tags: [
            "food",
            anchor.toLowerCase(),
            occasionType.toLowerCase(),
            sourceType.toLowerCase().replace(/[^a-z0-9]/g, ""),
          ],
          attributes: {
            primaryAnchor: anchor,
            occasionType,
            occasion,
            mealType: act.mealType || anchor,
            foodItems: act.foodItems || [],
            sourceType,
            sourceName: act.sourceName || undefined,
            location: act.sourceName || undefined,
            caloriesEst: act.caloriesEst || undefined,
            dietaryNotes: act.dietaryNotes || undefined,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const saved = await saveLifeEvent(newEventData);

        if (act.foodItems && act.foodItems.length > 0) {
          await recordFoodItemsConsumed(
            userId,
            act.foodItems,
            anchor,
            occasion,
            entryDate
          );
        }

        appliedActions.push({ action: "CREATE", event: saved });
      }
    }

    return NextResponse.json({
      success: true,
      summary: parsedResult.summary || `Applied ${appliedActions.length} changes.`,
      transcript: parsedResult.transcript || speechText,
      appliedCount: appliedActions.length,
      actions: appliedActions,
    });
  } catch (error: any) {
    console.error("POST /api/timeline/food/voice-action error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process voice command." },
      { status: 500 }
    );
  }
}
