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
import { FoodPrimaryAnchor, FoodOccasion, FoodOccasionType, LifeEvent } from "@/lib/timeline/types";

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
  changeSummary?: string;
}

function ruleBasedFallback(
  prompt: string,
  primaryAnchor: FoodPrimaryAnchor,
  existingEvent?: LifeEvent | null
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

  let occasion: FoodOccasion;
  if (primaryAnchor === "Breakfast") {
    occasion = occasionType === "Main Meal" ? "Breakfast" : "Pre-Breakfast Snack";
  } else if (primaryAnchor === "Lunch") {
    occasion = occasionType === "Main Meal" ? "Lunch / Brunch" : "Post-Lunch Snack";
  } else {
    occasion = occasionType === "Main Meal" ? "Dinner / Supper" : "Pre-Dinner Snack";
  }

  const items = prompt
    .split(/,|\band\b|\+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const title = prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt.charAt(0).toUpperCase() + prompt.slice(1);

  return {
    action: existingEvent ? "UPDATE" : "CREATE",
    title,
    description: prompt,
    primaryAnchor,
    occasionType,
    occasion,
    mealType: isSnack ? "Snack" : primaryAnchor,
    foodItems: items.length > 0 ? items : [prompt],
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
    }: {
      date: string;
      primaryAnchor: FoodPrimaryAnchor;
      prompt: string;
      existingEventId?: string;
    } = body;

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

    const aiConfig = await getAiConfig();
    let actionPayload: CellActionPayload | null = null;

    if (aiConfig.isConfigured && aiConfig.apiKey) {
      const systemPrompt = `You are a food calendar assistant specializing in nutritional logging and the Food Occasion Model.
User target date: "${date}".
Default primary anchor for this calendar row: "${primaryAnchor}".
Existing event currently in this slot:
${JSON.stringify(existingEvent || null, null, 2)}

User request: "${prompt.trim()}"

FOOD OCCASION MODEL SPECIFICATION:
Primary Anchors: "Breakfast" | "Lunch" | "Dinner"
Occasion Types: "Main Meal" | "Snack"
Allowed canonical occasions:
- Breakfast: "Breakfast" (Main Meal) | "Pre-Breakfast Snack" (Snack) | "Post-Breakfast Snack" (Snack)
- Lunch: "Lunch / Brunch" (Main Meal) | "Pre-Lunch Snack" (Snack) | "Post-Lunch Snack" (Snack)
- Dinner: "Dinner / Supper" (Main Meal) | "Pre-Dinner Snack" (Snack) | "Late-Night Snack" (Snack)

INSTRUCTIONS:
1. Determine the user's intent:
   - If the user asks to remove, delete, skip, cancel, or says they didn't eat ("didn't have lunch", "delete this", "clear"):
     "action": "DELETE"
   - If existingEvent is provided and user is altering or adding to it ("replace with salad", "also had tea", "correct time to 1pm"):
     "action": "UPDATE"
   - Otherwise:
     "action": "CREATE"
2. Build the output fields:
   - "title": Clean, appetizing title (e.g. "Masala Dosa & Sambar", "Greek Yogurt with Berries").
   - "description": Context or specific details mentioned.
   - "primaryAnchor": "${primaryAnchor}" unless the user explicitly specified another meal anchor (e.g. "actually lunch").
   - "occasionType": "Main Meal" or "Snack".
   - "occasion": One of the exact canonical strings matching the occasion type and primary anchor.
   - "mealType": "Breakfast", "Lunch", "Dinner", "Snack", or "Coffee / Beverage".
   - "foodItems": Array of individual food dishes or drinks (e.g. ["Dosa", "Sambar", "Chutney"]).
   - "startTime": "HH:MM" 24h format if stated (or inferred from anchor if user provided a time), otherwise null.
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
      actionPayload = ruleBasedFallback(prompt, primaryAnchor, existingEvent);
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
        caloriesEst: actionPayload.caloriesEst ?? existingEvent?.attributes?.caloriesEst,
        dietaryNotes: actionPayload.dietaryNotes ?? existingEvent?.attributes?.dietaryNotes,
      };

      const updated = await updateLifeEvent(existingEventId, {
        title: actionPayload.title || existingEvent?.title || "Meal",
        description: actionPayload.description || existingEvent?.description || "",
        startTime: actionPayload.startTime !== undefined ? actionPayload.startTime || undefined : existingEvent?.startTime,
        attributes,
      });

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
      tags: ["food", primaryAnchor.toLowerCase(), (actionPayload.occasionType || "meal").toLowerCase()],
      attributes: {
        primaryAnchor: actionPayload.primaryAnchor || primaryAnchor,
        occasionType: actionPayload.occasionType || "Main Meal",
        occasion: actionPayload.occasion,
        mealType: actionPayload.mealType || primaryAnchor,
        foodItems: actionPayload.foodItems || [],
        caloriesEst: actionPayload.caloriesEst || undefined,
        dietaryNotes: actionPayload.dietaryNotes || undefined,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await saveLifeEvent(newEventData);

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
