import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUser, unauthorizedResponse } from "@/lib/serverAuth";
import {
  saveLifeEvent,
  updateLifeEvent,
  deleteLifeEvent,
  getLifeEventsRange,
  getLifeEventById,
} from "@/lib/timeline/storage";
import { getFitnessProfile, saveFitnessProfile, calculateBmi } from "@/lib/fitness/profileStorage";
import { LifeEvent, BodyWeightAttributes } from "@/lib/timeline/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const verifiedUser = await getVerifiedUser(request);
  if (!verifiedUser) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const queryUserId = searchParams.get("userId");
    const authUserId = verifiedUser.email || verifiedUser.primaryUserId;
    const userIds = Array.from(
      new Set([
        queryUserId,
        authUserId,
        verifiedUser.uid,
        verifiedUser.primaryUserId,
        verifiedUser.email,
      ].filter(Boolean) as string[])
    );

    const primaryUserId = userIds[0];

    // Default to last 365 days of weight history
    const now = new Date();
    const startDate =
      searchParams.get("startDate") ||
      new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split("T")[0];
    const endDate = searchParams.get("endDate") || now.toISOString().split("T")[0];

    const allEvents = await getLifeEventsRange(startDate, endDate, userIds);

    // Filter for weight logs
    const weightEvents = allEvents.filter((ev) => {
      if (ev.activityType !== "FITNESS") return false;
      const metricType = (ev.attributes?.metricType || "").toLowerCase();
      const exerciseType = (ev.attributes?.exerciseType || "").toLowerCase();
      const title = (ev.title || "").toLowerCase();
      return (
        metricType === "weight" ||
        exerciseType === "weight" ||
        exerciseType === "bodyweight" ||
        title.startsWith("weight:") ||
        title.startsWith("weight log")
      );
    });

    // Sort chronologically ascending for stats calculation
    weightEvents.sort((a, b) => {
      const dateA = `${a.date}T${a.startTime || "12:00"}`;
      const dateB = `${b.date}T${b.startTime || "12:00"}`;
      return dateA.localeCompare(dateB);
    });

    // Compute stats
    let minWeightKg = 0;
    let maxWeightKg = 0;
    let startWeightKg: number | null = null;
    let currentWeightKg: number | null = null;
    let lastWeighedDate: string | null = null;

    if (weightEvents.length > 0) {
      const firstAttrs = weightEvents[0].attributes as BodyWeightAttributes;
      const lastAttrs = weightEvents[weightEvents.length - 1].attributes as BodyWeightAttributes;

      startWeightKg = firstAttrs?.weightKg || null;
      currentWeightKg = lastAttrs?.weightKg || null;
      lastWeighedDate = weightEvents[weightEvents.length - 1].date;

      const weights = weightEvents
        .map((ev) => (ev.attributes as BodyWeightAttributes)?.weightKg)
        .filter((w): w is number => typeof w === "number" && w > 0);

      if (weights.length > 0) {
        minWeightKg = Math.min(...weights);
        maxWeightKg = Math.max(...weights);
      }
    }

    // Get fitness profile for height, target, BMI
    const profile = await getFitnessProfile(primaryUserId);
    const heightCm = profile?.heightCm || null;

    let bmi: number | null = null;
    let bmiCategory: string | null = null;
    if (currentWeightKg && heightCm && heightCm > 0) {
      const calc = calculateBmi(currentWeightKg, heightCm);
      bmi = calc.bmi;
      bmiCategory = calc.category;
    }

    const netChangeKg =
      currentWeightKg !== null && startWeightKg !== null
        ? Math.round((currentWeightKg - startWeightKg) * 10) / 10
        : 0;

    // Build enriched list sorted newest first
    const enrichedLogs = [...weightEvents]
      .reverse()
      .map((ev, index, arr) => {
        const attrs = ev.attributes as BodyWeightAttributes;
        const currentWeight = attrs?.weightKg || 0;
        let deltaFromPrevious: number | null = null;

        // Compare to older entry (next in reverse array)
        if (index < arr.length - 1) {
          const prevWeight = (arr[index + 1].attributes as BodyWeightAttributes)?.weightKg || 0;
          if (prevWeight > 0) {
            deltaFromPrevious = Math.round((currentWeight - prevWeight) * 10) / 10;
          }
        }

        return {
          ...ev,
          deltaFromPrevious,
        };
      });

    return NextResponse.json({
      logs: enrichedLogs,
      summary: {
        currentWeightKg,
        startWeightKg: profile?.startingWeightKg || startWeightKg,
        targetWeightKg: profile?.targetWeightKg || null,
        netChangeKg,
        minWeightKg,
        maxWeightKg,
        heightCm,
        heightUnit: profile?.heightUnit || "cm",
        bmi,
        bmiCategory,
        lastWeighedDate,
        totalLogs: weightEvents.length,
      },
      profile,
    });
  } catch (error: any) {
    console.error("Failed to fetch weight logs:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch weight data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const verifiedUser = await getVerifiedUser(request);
  if (!verifiedUser) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const primaryUserId =
      body.userId || verifiedUser.email || verifiedUser.primaryUserId || verifiedUser.uid;

    const weightKg = parseFloat(body.weightKg);
    if (!weightKg || isNaN(weightKg) || weightKg <= 0) {
      return NextResponse.json({ error: "Valid weight in kg is required" }, { status: 400 });
    }

    const date = body.date || new Date().toISOString().split("T")[0];
    const startTime = body.startTime || new Date().toTimeString().slice(0, 5);
    const bodyFatPercentage = body.bodyFatPercentage ? parseFloat(body.bodyFatPercentage) : undefined;
    const waistCm = body.waistCm ? parseFloat(body.waistCm) : undefined;
    const notes = body.notes || "";

    // Fetch profile to compute BMI
    const profile = await getFitnessProfile(primaryUserId);
    let bmiAtTime: number | undefined;
    if (profile?.heightCm && profile.heightCm > 0) {
      const calc = calculateBmi(weightKg, profile.heightCm);
      bmiAtTime = calc.bmi;
    }

    const attributes: BodyWeightAttributes = {
      metricType: "Weight",
      exerciseType: "Weight",
      weightKg: Math.round(weightKg * 10) / 10,
      unit: body.unit || "kg",
      bodyFatPercentage: bodyFatPercentage ? Math.round(bodyFatPercentage * 10) / 10 : undefined,
      waistCm: waistCm ? Math.round(waistCm * 10) / 10 : undefined,
      bmiAtTime,
      notes: notes || undefined,
    };

    const newEvent: Omit<LifeEvent, "id"> = {
      userId: primaryUserId,
      activityType: "FITNESS",
      title: `Weight Log: ${attributes.weightKg} kg`,
      description: notes || `Recorded weight of ${attributes.weightKg} kg`,
      date,
      startTime,
      attributes,
      tags: ["fitness", "weight", "body-metrics"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const savedEvent = await saveLifeEvent(newEvent);

    // Update user profile with latest weight and calculated BMI
    await saveFitnessProfile(primaryUserId, {
      currentWeightKg: attributes.weightKg,
      lastWeighedDate: date,
      // If no starting weight exists yet, set this as start weight
      startingWeightKg: profile?.startingWeightKg || attributes.weightKg,
    });

    return NextResponse.json({
      success: true,
      event: savedEvent,
      message: "Weight logged successfully",
    });
  } catch (error: any) {
    console.error("Failed to log weight:", error);
    return NextResponse.json({ error: error.message || "Failed to log weight" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const verifiedUser = await getVerifiedUser(request);
  if (!verifiedUser) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { id, weightKg, date, startTime, bodyFatPercentage, waistCm, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "Event id is required" }, { status: 400 });
    }

    const existing = await getLifeEventById(id);
    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const parsedWeight = weightKg !== undefined ? parseFloat(weightKg) : existing.attributes?.weightKg;
    const finalWeightKg = Math.round(parsedWeight * 10) / 10;

    const primaryUserId = existing.userId || verifiedUser.email || verifiedUser.uid;
    const profile = await getFitnessProfile(primaryUserId);
    let bmiAtTime: number | undefined;
    if (profile?.heightCm && profile.heightCm > 0) {
      const calc = calculateBmi(finalWeightKg, profile.heightCm);
      bmiAtTime = calc.bmi;
    }

    const updatedAttributes: BodyWeightAttributes = {
      ...existing.attributes,
      metricType: "Weight",
      weightKg: finalWeightKg,
      bodyFatPercentage: bodyFatPercentage !== undefined ? parseFloat(bodyFatPercentage) : existing.attributes?.bodyFatPercentage,
      waistCm: waistCm !== undefined ? parseFloat(waistCm) : existing.attributes?.waistCm,
      bmiAtTime,
      notes: notes !== undefined ? notes : existing.attributes?.notes,
    };

    const updated = await updateLifeEvent(id, {
      title: `Weight Log: ${finalWeightKg} kg`,
      description: notes || existing.description,
      date: date || existing.date,
      startTime: startTime || existing.startTime,
      attributes: updatedAttributes,
    });

    // Refresh profile current weight
    await saveFitnessProfile(primaryUserId, {
      currentWeightKg: finalWeightKg,
    });

    return NextResponse.json({
      success: true,
      event: updated,
      message: "Weight entry updated",
    });
  } catch (error: any) {
    console.error("Failed to update weight:", error);
    return NextResponse.json({ error: error.message || "Failed to update weight" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const verifiedUser = await getVerifiedUser(request);
  if (!verifiedUser) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    await deleteLifeEvent(id);
    return NextResponse.json({ success: true, message: "Weight entry deleted" });
  } catch (error: any) {
    console.error("Failed to delete weight entry:", error);
    return NextResponse.json({ error: error.message || "Failed to delete" }, { status: 500 });
  }
}
