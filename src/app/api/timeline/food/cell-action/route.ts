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
} from "@/lib/timeline/relativeTimeParser";

export const dynamic = "force-dynamic";

interface CellActionPayload {
  action: "CREATE" | "UPDATE" | "DELETE";
  title?: string;
  description?: string;
  primaryAnchor: FoodPrimaryAnchor;
  occasionType: FoodOccasionType;
  occasion: FoodOccasion;
  mealType?: string;
  foodItems?: string[];
  startTime?: string | null;
  caloriesEst?: number | null;
  dietaryNotes?: string | null;
  sourceType?: FoodSourceType | string;
  sourceName?: string | null;
  changeSummary?: string;
}

function ruleBasedFallback(
  prompt: string,
  primaryAnchor: FoodPrimaryAnchor,
  existingEvent?: LifeEvent | null,
  currentTime?: string,
  date?: string
): CellActionPayload {
  const p = prompt.toLowerCase().trim();
  const isDelete = /delete|remove|clear|skip|didn't eat|did not eat|cancel|empty/.test(p);

  if (isDelete && existingEvent) {
    return {
      action: "DELETE",
      primaryAnchor: (existingEvent.attributes?.primaryAnchor as FoodPrimaryAnchor) || primaryAnchor,
      occasionType: (existingEvent.attributes?.occasionType as FoodOccasionType) || "Main Meal",
      occasion: (existingEvent.attributes?.occasion as FoodOccasion) || (primaryAnchor === "Lunch" ? "Lunch / Brunch" : primaryAnchor === "Dinner" ? "Dinner / Supper" : "Breakfast"),
      changeSummary: "Deleted meal event.",
    };
  }

  const isSnack = /snack|coffee|tea|juice|biscuit|cookie|smoothie/.test(p);
  const occasionType: FoodOccasionType = isSnack ? "Snack" : "Main Meal";

  const parsedTime = parseRelativeOrAbsoluteTime(prompt, currentTime, date);
  let effectiveAnchor: FoodPrimaryAnchor = primaryAnchor;
  let startTime: string | null = null;

  if (parsedTime.hasTime && parsedTime.startTime) {
    startTime = parsedTime.startTime;
    if (/breakfast/i.test(p)) {
      effectiveAnchor = "Breakfast";
    } else if (/dinner|supper/i.test(p)) {
      effectiveAnchor = "Dinner";
    } else if (/lunch|brunch/i.test(p)) {
      effectiveAnchor = "Lunch";
    } else {
      effectiveAnchor = inferAnchorFromTime(startTime);
    }
  }

  let occasion: FoodOccasion;
  if (startTime) {
    occasion = inferOccasionFromTime(startTime, isSnack);
  } else if (effectiveAnchor === "Breakfast") {
    occasion = occasionType === "Main Meal" ? "Breakfast" : "Pre-Breakfast Snack";
  } else if (effectiveAnchor === "Lunch") {
    occasion = occasionType === "Main Meal" ? "Lunch / Brunch" : "Post-Lunch Snack";
  } else {
    occasion = occasionType === "Main Meal" ? "Dinner / Supper" : "Pre-Dinner Snack";
  }

  // Detect Dining Source
  let sourceType: FoodSourceType = (existingEvent?.attributes?.sourceType as FoodSourceType) || "Home Cooked";
  let sourceName: string | null = existingEvent?.attributes?.sourceName || null;

  if (/swiggy|zomato|blinkit|zepto|ubereats|uber eats|eatclub|delivery|ordered/i.test(p)) {
    sourceType = "Online Delivery";
    if (/swiggy/i.test(p)) sourceName = "Swiggy";
    else if (/zomato/i.test(p)) sourceName = "Zomato";
    else if (/blinkit/i.test(p)) sourceName = "Blinkit";
    else if (/zepto/i.test(p)) sourceName = "Zepto";
    else if (/uber\s*eats/i.test(p)) sourceName = "Uber Eats";
    else if (!sourceName) sourceName = "Online Delivery";
  } else if (/hotel|restaurant|saravana bhavan|a2b|sangeetha|mess|cafe|bhavan|eatery|dine/i.test(p)) {
    sourceType = "Hotel / Restaurant";
    const hotelMatch = prompt.match(/(?:at|from|in)\s+(hotel\s+[\w\s]+|restaurant\s+[\w\s]+|[\w\s]+hotel|[\w\s]+restaurant|[\w\s]+mess|[\w\s]+cafe|saravana bhavan|a2b|sangeetha)/i);
    if (hotelMatch && hotelMatch[1]) {
      sourceName = hotelMatch[1].trim();
    } else if (/saravana bhavan/i.test(p)) {
      sourceName = "Hotel Saravana Bhavan";
    } else if (/a2b/i.test(p)) {
      sourceName = "A2B";
    } else if (!sourceName) {
      sourceName = "Hotel / Restaurant";
    }
  } else if (/takeaway|parcel|packed/i.test(p)) {
    sourceType = "Takeaway";
    if (!sourceName) sourceName = "Takeaway";
  }

  const cleanSubject = parsedTime.cleanText || prompt;
  const items = cleanSubject
    .split(/,|\band\b|\+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const title = cleanSubject.length > 50 ? `${cleanSubject.slice(0, 47)}...` : cleanSubject.charAt(0).toUpperCase() + cleanSubject.slice(1);

  return {
    action: existingEvent ? "UPDATE" : "CREATE",
    title,
    description: prompt,
    primaryAnchor: effectiveAnchor,
    occasionType,
    occasion,
    mealType: isSnack ? "Snack" : effectiveAnchor,
    foodItems: items.length > 0 ? items : [cleanSubject],
    sourceType,
    sourceName,
    startTime,
    changeSummary: existingEvent ? "Updated meal entry." : "Created new meal entry.",
  };
}

export async function POST(request: NextRequest) {
  const verifiedUser = await getVerifiedUser(request);
  if (!verifiedUser) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const {
      date,
      primaryAnchor = "Breakfast",
      prompt,
      existingEventId,
      currentFields,
      dryRun = false,
      currentTime: clientCurrentTime,
    }: {
      date: string;
      primaryAnchor: FoodPrimaryAnchor;
      prompt: string;
      existingEventId?: string;
      currentFields?: any;
      dryRun?: boolean;
      currentTime?: string;
    } = body;

    const now = new Date();
    const currentTime = clientCurrentTime || `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    if (!date) {
      return NextResponse.json({ error: "Missing 'date' parameter." }, { status: 400 });
    }

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: "No input prompt provided." }, { status: 400 });
    }

    const authUserId = verifiedUser.email || verifiedUser.primaryUserId;
    const userId = (body.userId && body.userId !== "default_user") ? body.userId : authUserId;

    // Fetch existing event if ID provided
    let existingEvent: LifeEvent | null = null;
    if (existingEventId) {
      existingEvent = await getLifeEventById(existingEventId);
    }

    // Build context data: prioritize current form fields if provided by client
    const contextData = currentFields
      ? {
          title: currentFields.title || existingEvent?.title,
          date,
          startTime: currentFields.startTime || existingEvent?.startTime,
          attributes: {
            primaryAnchor: currentFields.primaryAnchor || primaryAnchor,
            occasion: currentFields.occasion || existingEvent?.attributes?.occasion,
            foodItems: currentFields.foodItems || existingEvent?.attributes?.foodItems || [],
            sourceType: currentFields.sourceType || existingEvent?.attributes?.sourceType,
            sourceName: currentFields.sourceName || existingEvent?.attributes?.sourceName,
            caloriesEst: currentFields.caloriesEst || existingEvent?.attributes?.caloriesEst,
            dietaryNotes: currentFields.dietaryNotes || existingEvent?.attributes?.dietaryNotes,
          },
        }
      : existingEvent;

    const aiConfig = await getAiConfig();
    let actionPayload: CellActionPayload | null = null;

    if (aiConfig.isConfigured && aiConfig.apiKey) {
      const systemPrompt = `You are a food calendar assistant specializing in nutritional logging and the Food Occasion Model.
User target date: "${date}".
Current local reference time: "${currentTime}" (24-hour HH:MM format).
Default primary anchor for this calendar row: "${primaryAnchor}".
Current entry data in this form slot:
${JSON.stringify(contextData || null, null, 2)}

User request: "${prompt.trim()}"

RELATIVE & ABSOLUTE TIME RESOLUTION RULES:
When the user mentions time, resolve "startTime" (24-hour HH:MM format) and align "primaryAnchor":
- "now" / "just now" / "right now" / "just ate": use "${currentTime}".
- "few mins back" / "a few minutes back" / "few mins ago" / "couple mins back": subtract 5 minutes from "${currentTime}".
- "X mins back" / "X minutes ago" / "X mins before": subtract X minutes from "${currentTime}".
- "1 hour back" / "an hour ago" / "1 hr ago" / "one hour ago": subtract 60 minutes from "${currentTime}".
- "X hours back" / "X hours ago": subtract X hours from "${currentTime}".
- "half an hour back" / "half an hour ago": subtract 30 minutes from "${currentTime}".
- Absolute times: "at 1:30pm" -> "13:30", "at 8am" -> "08:00".
- If time is determined (either relative or absolute), set "primaryAnchor" to match:
  * 04:00 to 11:29 -> "Breakfast"
  * 11:30 to 16:59 -> "Lunch"
  * 17:00 to 03:59 -> "Dinner"
- If no time is stated or inferred, preserve existing startTime or leave null.
- Clean Title & Items: Do NOT include relative time expressions ("now", "just now", "1 hour back", "few mins back", "at 1pm") in "title" or "foodItems". Clean them!

FOOD OCCASION MODEL SPECIFICATION:
Primary Anchors: "Breakfast" | "Lunch" | "Dinner"
Occasion Types: "Main Meal" | "Snack"
Allowed canonical occasions:
- Breakfast: "Breakfast" (Main Meal) | "Pre-Breakfast Snack" (Snack) | "Post-Breakfast Snack" (Snack)
- Lunch: "Lunch / Brunch" (Main Meal) | "Pre-Lunch Snack" (Snack) | "Post-Lunch Snack" (Snack)
- Dinner: "Dinner / Supper" (Main Meal) | "Pre-Dinner Snack" (Snack) | "Late-Night Snack" (Snack)

DINING SOURCE & ORIGIN:
- "sourceType": "Home Cooked" | "Hotel / Restaurant" | "Online Delivery" | "Takeaway" | "Other"
  * E.g., Swiggy, Zomato, Blinkit, Zepto, delivery apps -> "Online Delivery"
  * E.g., hotel, restaurant, mess, cafe, dine-in -> "Hotel / Restaurant"
  * E.g., parcel, takeaway -> "Takeaway"
  * E.g., home food or unstated home cooking -> "Home Cooked"
- "sourceName": string or null (e.g. "Hotel Saravana Bhavan", "Swiggy", "Zomato", "A2B", "Domino's").

INSTRUCTIONS:
1. Determine the user's intent:
   - If the user asks to remove, delete, skip, cancel, or says they didn't eat ("didn't have lunch", "delete this", "clear"):
     "action": "DELETE"
   - If current/existing entry is provided and user is altering, adding, removing, or recalculating ("replace with salad", "also had tea", "add 1 cup rice"):
     "action": "UPDATE"
   - Otherwise:
     "action": "CREATE"
2. Build the output fields:
   - "title": Clean, appetizing title (e.g. "Masala Dosa & Sambar", "Greek Yogurt with Berries").
   - "description": Context or specific details mentioned.
   - "primaryAnchor": matching the resolved time or "${primaryAnchor}".
   - "occasionType": "Main Meal" or "Snack".
   - "occasion": One of the exact canonical strings matching the occasion type and primary anchor.
   - "mealType": "Breakfast", "Lunch", "Dinner", "Snack", or "Coffee / Beverage".
   - "foodItems": Array of individual food dishes or drinks (e.g. ["Dosa", "Sambar", "Chutney"]).
   - "sourceType": "Home Cooked" | "Hotel / Restaurant" | "Online Delivery" | "Takeaway" | "Other".
   - "sourceName": Hotel name, delivery app name, or restaurant name, or null.
   - "startTime": "HH:MM" 24h format if stated/inferred, otherwise null.
   - "caloriesEst": Estimated calories as a number if identifiable or null.
   - "dietaryNotes": Any notes or null.
   - "changeSummary": Short phrase describing what was done.

Return ONLY a single valid JSON object:
{
  "action": "CREATE" | "UPDATE" | "DELETE",
  "title": string,
  "description": string,
  "primaryAnchor": "Breakfast" | "Lunch" | "Dinner",
  "occasionType": "Main Meal" | "Snack",
  "occasion": string,
  "mealType": string,
  "foodItems": string[],
  "sourceType": "Home Cooked" | "Hotel / Restaurant" | "Online Delivery" | "Takeaway" | "Other",
  "sourceName": string | null,
  "startTime": string | null,
  "caloriesEst": number | null,
  "dietaryNotes": string | null,
  "changeSummary": string
}`;

      const isGemini = aiConfig.provider === "gemini" || aiConfig.apiKey?.startsWith("AIzaSy");

      if (isGemini) {
        const candidateModels = resolveGeminiCandidateModels(aiConfig.model);
        const payload = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: prompt.trim() }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
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
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
                actionPayload = JSON.parse(cleaned);
                break;
              }
            }
          } catch (err) {
            console.warn(`[food-cell-action] Gemini model ${model} failed, trying next candidate...`);
          }
        }
      } else {
        // OpenRouter Fallback
        try {
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${aiConfig.apiKey}`,
              "HTTP-Referer": "http://localhost:3000",
              "X-Title": "Track Everything AI - Food Calendar Action",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: aiConfig.model || "openrouter/free",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt.trim() },
              ],
              temperature: 0.2,
              response_format: { type: "json_object" },
            }),
          });

          if (res.ok) {
            const resData = await res.json();
            const text = resData.choices?.[0]?.message?.content;
            if (text) {
              actionPayload = JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
            }
          }
        } catch (err) {
          console.warn("[food-cell-action] OpenRouter request failed:", err);
        }
      }
    }

    // Fallback if AI was unavailable or couldn't parse
    if (!actionPayload) {
      actionPayload = ruleBasedFallback(prompt, primaryAnchor, existingEvent, currentTime, date);
    }

    // If dryRun is requested, return the refined fields directly to update the UI form live
    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        action: actionPayload.action,
        updatedFields: {
          title: actionPayload.title,
          description: actionPayload.description,
          primaryAnchor: actionPayload.primaryAnchor || primaryAnchor,
          occasionType: actionPayload.occasionType || "Main Meal",
          occasion: actionPayload.occasion,
          mealType: actionPayload.mealType || primaryAnchor,
          foodItems: actionPayload.foodItems || [],
          sourceType: actionPayload.sourceType || "Home Cooked",
          sourceName: actionPayload.sourceName || null,
          startTime: actionPayload.startTime || null,
          caloriesEst: actionPayload.caloriesEst !== undefined ? actionPayload.caloriesEst : null,
          dietaryNotes: actionPayload.dietaryNotes || actionPayload.description || "",
        },
        changeSummary: actionPayload.changeSummary || "AI updated form fields.",
      });
    }

    // Execute Database Action
    if (actionPayload.action === "DELETE") {
      if (existingEventId) {
        await deleteLifeEvent(existingEventId);
        return NextResponse.json({
          success: true,
          action: "DELETE",
          eventId: existingEventId,
          changeSummary: actionPayload.changeSummary || "Meal deleted.",
        });
      } else {
        return NextResponse.json({
          success: true,
          action: "DELETE",
          message: "No existing entry to delete in this cell.",
        });
      }
    }

    if (actionPayload.action === "UPDATE" && existingEventId) {
      const attributes = {
        ...(existingEvent?.attributes || {}),
        primaryAnchor: actionPayload.primaryAnchor || primaryAnchor,
        occasionType: actionPayload.occasionType || "Main Meal",
        occasion: actionPayload.occasion,
        mealType: actionPayload.mealType || actionPayload.primaryAnchor,
        foodItems: actionPayload.foodItems || [],
        sourceType: actionPayload.sourceType || existingEvent?.attributes?.sourceType || "Home Cooked",
        sourceName: actionPayload.sourceName !== undefined ? actionPayload.sourceName : existingEvent?.attributes?.sourceName,
        location: actionPayload.sourceName || existingEvent?.attributes?.location,
        caloriesEst: actionPayload.caloriesEst ?? existingEvent?.attributes?.caloriesEst,
        dietaryNotes: actionPayload.dietaryNotes ?? existingEvent?.attributes?.dietaryNotes,
      };

      const updated = await updateLifeEvent(existingEventId, {
        title: actionPayload.title || existingEvent?.title || "Meal",
        description: actionPayload.description || existingEvent?.description || "",
        startTime: actionPayload.startTime !== undefined ? actionPayload.startTime || undefined : existingEvent?.startTime,
        attributes,
      });

      if (actionPayload.foodItems && actionPayload.foodItems.length > 0) {
        await recordFoodItemsConsumed(
          userId,
          actionPayload.foodItems,
          actionPayload.primaryAnchor || primaryAnchor,
          actionPayload.occasion,
          date
        );
      }

      return NextResponse.json({
        success: true,
        action: "UPDATE",
        event: updated,
        changeSummary: actionPayload.changeSummary || "Meal updated.",
      });
    }

    // CREATE Action
    const newEventData: Omit<LifeEvent, "id"> = {
      userId,
      date,
      title: actionPayload.title || `${primaryAnchor} Meal`,
      description: actionPayload.description || prompt,
      activityType: "FOOD",
      startTime: actionPayload.startTime || undefined,
      tags: [
        "food",
        primaryAnchor.toLowerCase(),
        (actionPayload.occasionType || "meal").toLowerCase(),
        ...(actionPayload.sourceType ? [actionPayload.sourceType.toLowerCase().replace(/[^a-z0-9]/g, "")] : []),
      ],
      attributes: {
        primaryAnchor: actionPayload.primaryAnchor || primaryAnchor,
        occasionType: actionPayload.occasionType || "Main Meal",
        occasion: actionPayload.occasion,
        mealType: actionPayload.mealType || primaryAnchor,
        foodItems: actionPayload.foodItems || [],
        sourceType: actionPayload.sourceType || "Home Cooked",
        sourceName: actionPayload.sourceName || undefined,
        location: actionPayload.sourceName || undefined,
        caloriesEst: actionPayload.caloriesEst || undefined,
        dietaryNotes: actionPayload.dietaryNotes || undefined,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await saveLifeEvent(newEventData);

    if (actionPayload.foodItems && actionPayload.foodItems.length > 0) {
      await recordFoodItemsConsumed(
        userId,
        actionPayload.foodItems,
        actionPayload.primaryAnchor || primaryAnchor,
        actionPayload.occasion,
        date
      );
    }

    return NextResponse.json({
      success: true,
      action: "CREATE",
      event: saved,
      changeSummary: actionPayload.changeSummary || "Meal logged successfully.",
    });
  } catch (error: any) {
    console.error("POST /api/timeline/food/cell-action error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process food calendar cell action." },
      { status: 500 }
    );
  }
}
