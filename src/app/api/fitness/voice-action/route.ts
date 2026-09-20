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
import { LifeEvent, TreadmillAttributes } from "@/lib/timeline/types";

export const dynamic = "force-dynamic";

interface VoiceFitnessAction {
  action: "CREATE" | "UPDATE" | "DELETE";
  targetEventId?: string;
  date?: string;
  startTime?: string;
  title?: string;
  exerciseType?: string;
  workoutMode?: string;
  distanceKm?: number;
  durationMins?: number;
  speedKph?: number;
  inclinePercentage?: number;
  paceMinPerKm?: string;
  caloriesBurned?: number;
  avgHeartRate?: number;
  notes?: string;
}

interface VoiceFitnessApiResponse {
  transcript?: string;
  summary: string;
  actions: VoiceFitnessAction[];
}

function calculatePace(durationMins: number, distanceKm: number): string {
  if (!distanceKm || distanceKm <= 0 || !durationMins || durationMins <= 0) return "--:--";
  const paceMinutesDecimal = durationMins / distanceKm;
  const mins = Math.floor(paceMinutesDecimal);
  const secs = Math.round((paceMinutesDecimal - mins) * 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function getRelativeDate(todayStr: string, offsetDays: number): string {
  const [y, m, d] = todayStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + offsetDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function ruleBasedFitnessParser(
  text: string,
  todayDate: string,
  existingEvents: Array<any>
): VoiceFitnessApiResponse {
  const lower = text.toLowerCase();
  const actions: VoiceFitnessAction[] = [];

  // Check for delete commands
  if (/\b(delete|remove|cancel|clear)\b/.test(lower) && /\b(treadmill|workout|run)\b/.test(lower)) {
    let target = existingEvents.find((e) => e.date === todayDate) || existingEvents[0];
    if (target) {
      actions.push({ action: "DELETE", targetEventId: target.id });
      return {
        transcript: text,
        summary: `Deleted ${target.title || "workout session"}.`,
        actions,
      };
    }
  }

  // Relative date
  let entryDate = todayDate;
  if (/\byesterday\b|\blast night\b/.test(lower)) {
    entryDate = getRelativeDate(todayDate, -1);
  } else if (/\bday before yesterday\b/.test(lower)) {
    entryDate = getRelativeDate(todayDate, -2);
  } else if (/\btomorrow\b/.test(lower)) {
    entryDate = getRelativeDate(todayDate, 1);
  }

  // Time extraction
  const timeMatch = text.match(/(?:at|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let startTime = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const mer = timeMatch[3]?.toLowerCase();
    if (mer === "pm" && h < 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    startTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // Distance extraction: e.g. "4.5 km", "4.5km", "5k", "5 k"
  let distanceKm = 0;
  const distMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:km|kms|kilo|kilometer|k\b)/i);
  if (distMatch) {
    distanceKm = parseFloat(distMatch[1]);
  }

  // Duration extraction: e.g. "in 30 mins", "for 25 minutes", "30m"
  let durationMins = 0;
  const durMatch = text.match(/(\d+)\s*(?:min|mins|minutes|m\b)/i);
  if (durMatch) {
    durationMins = parseInt(durMatch[1], 10);
  }

  // Speed extraction: e.g. "speed 8.5", "at 8.5 km/h", "at 8.5 speed"
  let speedKph = 0;
  const speedMatch = text.match(/(?:speed|at)\s*(\d+(?:\.\d+)?)\s*(?:km\/h|kph|speed)?/i);
  if (speedMatch && !durMatch) {
    speedKph = parseFloat(speedMatch[1]);
  }

  // Incline extraction: e.g. "2% incline", "2 percent incline", "incline 3"
  let inclinePercentage = 0;
  const incMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)?\s*incline|incline\s*(\d+(?:\.\d+)?)/i);
  if (incMatch) {
    inclinePercentage = parseFloat(incMatch[1] || incMatch[2]);
  }

  // Calories extraction: e.g. "burned 300 calories", "300 cal", "300 kcal"
  let caloriesBurned = 0;
  const calMatch = text.match(/(\d+)\s*(?:cal|calories|kcal)/i);
  if (calMatch) {
    caloriesBurned = parseInt(calMatch[1], 10);
  }

  // Workout mode detection
  let workoutMode = "Brisk Walk";
  if (/\bhiit|sprint|intervals\b/i.test(lower)) workoutMode = "HIIT Intervals";
  else if (/\bincline walk|hill\b/i.test(lower) || inclinePercentage >= 3) workoutMode = "Incline Walk";
  else if (/\bjog\b/i.test(lower)) workoutMode = "Jog";
  else if (/\brun|endurance|marathon|5k|10k\b/i.test(lower)) workoutMode = "Endurance Run";
  else if (/\bwarmup|cooldown\b/i.test(lower)) workoutMode = "Warmup / Cooldown";

  // Auto-fill calculations
  if (!speedKph && distanceKm > 0 && durationMins > 0) {
    speedKph = Number(((distanceKm / durationMins) * 60).toFixed(1));
  } else if (!distanceKm && speedKph > 0 && durationMins > 0) {
    distanceKm = Number(((speedKph * durationMins) / 60).toFixed(2));
  } else if (!durationMins && distanceKm > 0 && speedKph > 0) {
    durationMins = Math.round((distanceKm / speedKph) * 60);
  }

  if (distanceKm === 0) distanceKm = 3.0;
  if (durationMins === 0) durationMins = 25;
  if (speedKph === 0) speedKph = Number(((distanceKm / durationMins) * 60).toFixed(1));
  if (caloriesBurned === 0) caloriesBurned = Math.round(distanceKm * 65);

  const paceMinPerKm = calculatePace(durationMins, distanceKm);

  actions.push({
    action: "CREATE",
    date: entryDate,
    startTime,
    title: `Treadmill ${workoutMode}`,
    exerciseType: "Treadmill",
    workoutMode,
    distanceKm,
    durationMins,
    speedKph,
    inclinePercentage,
    paceMinPerKm,
    caloriesBurned,
    notes: text,
  });

  return {
    transcript: text,
    summary: `Logged ${distanceKm} km treadmill ${workoutMode.toLowerCase()} (${durationMins}m, ${speedKph} km/h).`,
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
      existingEvents = [],
    } = body;

    const authUserId = user.email || user.primaryUserId || user.uid;
    const userId = (body.userId && body.userId !== "default_user") ? body.userId : authUserId;

    if (!audioBase64 && !speechText.trim()) {
      return NextResponse.json(
        { error: "No voice audio or text provided." },
        { status: 400 }
      );
    }

    let parsedResult: VoiceFitnessApiResponse | null = null;
    const aiConfig = await getAiConfig();

    if (aiConfig?.apiKey && (!aiConfig.provider || aiConfig.provider === "gemini")) {
      const candidateModels = resolveGeminiCandidateModels(aiConfig.model);

      const yesterdayDate = getRelativeDate(todayDate, -1);
      const dayBeforeYesterdayDate = getRelativeDate(todayDate, -2);
      const tomorrowDate = getRelativeDate(todayDate, 1);

      const systemPrompt = `You are a fitness AI tracking workouts with focus on Treadmill sessions.
The user speaks or types treadmill and fitness workout logs.
You extract structured workout metrics into JSON actions.

Date Resolution Rules:
- "today": "${todayDate}"
- "yesterday" / "last night": "${yesterdayDate}"
- "day before yesterday": "${dayBeforeYesterdayDate}"
- "tomorrow": "${tomorrowDate}"
CRITICAL: If the user refers to "yesterday" or a specific day, set the "date" field to the exact calculated date!

Valid Workout Modes for Treadmill:
- "Brisk Walk"
- "Incline Walk"
- "Jog"
- "Endurance Run"
- "HIIT Intervals"
- "Warmup / Cooldown"

Calculations to deduce:
- If speed and duration are given, calculate distance: (speedKph * durationMins) / 60
- If distance and duration are given, calculate speed: (distanceKm / durationMins) * 60
- If distance and speed are given, calculate duration: (distanceKm / speedKph) * 60
- If calories are not specified, estimate around: Math.round(distanceKm * 65)
- Calculate paceMinPerKm in format "M:SS" (e.g. "6:30", "7:45")

Existing Workouts Context for Updates or Deletes:
${JSON.stringify(
  existingEvents.map((e: any) => ({
    id: e.id,
    date: e.date,
    startTime: e.startTime,
    title: e.title,
    distanceKm: e.attributes?.distanceKm,
    durationMins: e.attributes?.durationMins,
  })),
  null,
  2
)}

Output strict JSON:
{
  "transcript": "Exact spoken or typed text",
  "summary": "1-sentence friendly summary (e.g. 'Logged 4.2 km treadmill jog in 30 mins')",
  "actions": [
    {
      "action": "CREATE" | "UPDATE" | "DELETE",
      "targetEventId": "string (for UPDATE/DELETE)",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "title": "Treadmill [Mode]",
      "exerciseType": "Treadmill",
      "workoutMode": "Brisk Walk" | "Incline Walk" | "Jog" | "Endurance Run" | "HIIT Intervals" | "Warmup / Cooldown",
      "distanceKm": number,
      "durationMins": number,
      "speedKph": number,
      "inclinePercentage": number,
      "paceMinPerKm": "M:SS",
      "caloriesBurned": number,
      "avgHeartRate": number or null,
      "notes": "string or null"
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
            ? `Microphone audio attached. Web speech preview: "${speechText}". Accurately extract treadmill workout metrics into JSON.`
            : "Transcribe audio and extract treadmill workout metrics into JSON actions.",
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
            const textResp = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textResp) {
              parsedResult = JSON.parse(textResp);
              break;
            }
          }
        } catch (mErr) {
          console.warn(`[fitness voice-action] Gemini model ${model} failed:`, mErr);
        }
      }
    }

    if (!parsedResult || !Array.isArray(parsedResult.actions) || parsedResult.actions.length === 0) {
      parsedResult = ruleBasedFitnessParser(speechText || "Treadmill workout", todayDate, existingEvents);
    }

    const appliedActions: any[] = [];

    for (const act of parsedResult.actions) {
      if (act.action === "DELETE" && act.targetEventId) {
        await deleteLifeEvent(act.targetEventId);
        appliedActions.push({ action: "DELETE", eventId: act.targetEventId });
      } else if (act.action === "UPDATE" && act.targetEventId) {
        const existing = await getLifeEventById(act.targetEventId);
        if (existing) {
          const distanceKm = act.distanceKm !== undefined ? Number(act.distanceKm) : existing.attributes?.distanceKm || 0;
          const durationMins = act.durationMins !== undefined ? Number(act.durationMins) : existing.attributes?.durationMins || 0;
          let speedKph = act.speedKph !== undefined ? Number(act.speedKph) : existing.attributes?.speedKph;
          if (!speedKph && distanceKm > 0 && durationMins > 0) {
            speedKph = Number(((distanceKm / durationMins) * 60).toFixed(1));
          }

          const attributes: TreadmillAttributes = {
            ...(existing.attributes || {}),
            exerciseType: "Treadmill",
            workoutMode: act.workoutMode || existing.attributes?.workoutMode || "Treadmill Workout",
            distanceKm,
            durationMins,
            speedKph,
            inclinePercentage: act.inclinePercentage !== undefined ? Number(act.inclinePercentage) : existing.attributes?.inclinePercentage,
            paceMinPerKm: act.paceMinPerKm || calculatePace(durationMins, distanceKm),
            caloriesBurned: act.caloriesBurned !== undefined ? Number(act.caloriesBurned) : existing.attributes?.caloriesBurned,
            avgHeartRate: act.avgHeartRate !== undefined ? Number(act.avgHeartRate) : existing.attributes?.avgHeartRate,
            notes: act.notes !== undefined ? act.notes : existing.attributes?.notes,
          };

          const updated = await updateLifeEvent(act.targetEventId, {
            title: act.title || existing.title,
            date: act.date || existing.date,
            startTime: act.startTime || existing.startTime,
            description: act.notes || existing.description,
            attributes,
          });

          appliedActions.push({ action: "UPDATE", session: updated });
        }
      } else if (act.action === "CREATE") {
        const distanceKm = Number(act.distanceKm) || 0;
        const durationMins = Number(act.durationMins) || 0;
        let speedKph = act.speedKph ? Number(act.speedKph) : 0;
        if (!speedKph && distanceKm > 0 && durationMins > 0) {
          speedKph = Number(((distanceKm / durationMins) * 60).toFixed(1));
        }
        const workoutMode = act.workoutMode || (distanceKm > 3 ? "Jog" : "Brisk Walk");
        const entryDate = act.date || todayDate;
        const startTime = act.startTime || new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

        const attributes: TreadmillAttributes = {
          exerciseType: "Treadmill",
          workoutMode,
          distanceKm,
          durationMins,
          speedKph,
          inclinePercentage: Number(act.inclinePercentage) || 0,
          paceMinPerKm: act.paceMinPerKm || calculatePace(durationMins, distanceKm),
          caloriesBurned: act.caloriesBurned ? Number(act.caloriesBurned) : Math.round(distanceKm * 65),
          avgHeartRate: act.avgHeartRate ? Number(act.avgHeartRate) : undefined,
          notes: act.notes || "",
        };

        const newEvent: Omit<LifeEvent, "id"> = {
          userId,
          date: entryDate,
          startTime,
          title: act.title || `Treadmill ${workoutMode}`,
          description: act.notes || `${workoutMode}: ${distanceKm} km in ${durationMins}m`,
          activityType: "FITNESS",
          tags: ["fitness", "treadmill", workoutMode.toLowerCase().replace(/[^a-z0-9]/g, "")],
          attributes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const saved = await saveLifeEvent(newEvent);
        appliedActions.push({ action: "CREATE", session: saved });
      }
    }

    return NextResponse.json({
      success: true,
      summary: parsedResult.summary || `Logged ${appliedActions.length} workout(s).`,
      transcript: parsedResult.transcript || speechText,
      appliedCount: appliedActions.length,
      actions: appliedActions,
    });
  } catch (error: any) {
    console.error("POST /api/fitness/voice-action error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process fitness voice input." },
      { status: 500 }
    );
  }
}
