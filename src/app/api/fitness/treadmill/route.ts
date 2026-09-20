import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUser, unauthorizedResponse } from "@/lib/serverAuth";
import {
  saveLifeEvent,
  updateLifeEvent,
  deleteLifeEvent,
  getLifeEventsRange,
  getLifeEventById,
} from "@/lib/timeline/storage";
import { LifeEvent, TreadmillAttributes } from "@/lib/timeline/types";

export const dynamic = "force-dynamic";

function calculatePace(durationMins: number, distanceKm: number): string {
  if (!distanceKm || distanceKm <= 0 || !durationMins || durationMins <= 0) return "--:--";
  const paceMinutesDecimal = durationMins / distanceKm;
  const mins = Math.floor(paceMinutesDecimal);
  const secs = Math.round((paceMinutesDecimal - mins) * 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

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

    const now = new Date();
    const startDate = searchParams.get("startDate") || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const endDate = searchParams.get("endDate") || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    const allEvents = await getLifeEventsRange(startDate, endDate, userIds);

    // Filter for treadmill workouts
    const treadmillEvents = allEvents.filter((ev) => {
      if (ev.activityType !== "FITNESS") return false;
      const exType = (ev.attributes?.exerciseType || "").toLowerCase();
      const title = (ev.title || "").toLowerCase();
      const tags = (ev.tags || []).map((t) => t.toLowerCase());
      return exType.includes("treadmill") || title.includes("treadmill") || tags.includes("treadmill");
    });

    // Compute Summary Metrics
    let totalDistanceKm = 0;
    let totalDurationMins = 0;
    let totalCalories = 0;
    let speedSum = 0;
    let speedCount = 0;

    for (const ev of treadmillEvents) {
      const dist = Number(ev.attributes?.distanceKm) || 0;
      const dur = Number(ev.attributes?.durationMins) || 0;
      const cal = Number(ev.attributes?.caloriesBurned) || 0;
      const spd = Number(ev.attributes?.speedKph) || 0;

      totalDistanceKm += dist;
      totalDurationMins += dur;
      totalCalories += cal;

      if (spd > 0) {
        speedSum += spd;
        speedCount++;
      } else if (dist > 0 && dur > 0) {
        speedSum += (dist / dur) * 60;
        speedCount++;
      }
    }

    const avgSpeedKph = speedCount > 0 ? Number((speedSum / speedCount).toFixed(1)) : 0;
    const avgPace = calculatePace(totalDurationMins, totalDistanceKm);

    return NextResponse.json({
      success: true,
      sessions: treadmillEvents,
      summary: {
        totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
        totalDurationMins,
        totalDurationHours: Number((totalDurationMins / 60).toFixed(1)),
        totalCalories,
        sessionsCount: treadmillEvents.length,
        avgSpeedKph,
        avgPace,
      },
    });
  } catch (error: any) {
    console.error("GET /api/fitness/treadmill error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch treadmill workouts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const verifiedUser = await getVerifiedUser(request);
  if (!verifiedUser) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const authUserId = verifiedUser.email || verifiedUser.primaryUserId || verifiedUser.uid;
    const userId = (body.userId && body.userId !== "default_user") ? body.userId : authUserId;

    const date = body.date || new Date().toISOString().split("T")[0];
    const startTime = body.startTime || new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const distanceKm = Number(body.distanceKm) || 0;
    const durationMins = Number(body.durationMins) || 0;
    const workoutMode = body.workoutMode || (distanceKm > 3 ? "Jog" : "Brisk Walk");
    const inclinePercentage = body.inclinePercentage !== undefined ? Number(body.inclinePercentage) : 0;

    let speedKph = body.speedKph ? Number(body.speedKph) : 0;
    if (!speedKph && distanceKm > 0 && durationMins > 0) {
      speedKph = Number(((distanceKm / durationMins) * 60).toFixed(1));
    }

    const paceMinPerKm = body.paceMinPerKm || calculatePace(durationMins, distanceKm);
    const caloriesBurned = body.caloriesBurned ? Number(body.caloriesBurned) : Math.round(distanceKm * 65);
    const avgHeartRate = body.avgHeartRate ? Number(body.avgHeartRate) : undefined;
    const notes = body.notes || "";

    const title = body.title || `Treadmill ${workoutMode}`;

    const attributes: TreadmillAttributes = {
      exerciseType: "Treadmill",
      workoutMode,
      distanceKm,
      durationMins,
      speedKph,
      inclinePercentage,
      paceMinPerKm,
      caloriesBurned,
      avgHeartRate,
      notes,
    };

    const newEvent: Omit<LifeEvent, "id"> = {
      userId,
      date,
      startTime,
      title,
      description: notes || `${workoutMode}: ${distanceKm} km in ${durationMins} mins at ${speedKph} km/h`,
      activityType: "FITNESS",
      tags: ["fitness", "treadmill", workoutMode.toLowerCase().replace(/[^a-z0-9]/g, "")],
      attributes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await saveLifeEvent(newEvent);

    return NextResponse.json({
      success: true,
      session: saved,
      message: `Logged ${distanceKm} km treadmill ${workoutMode.toLowerCase()}!`,
    });
  } catch (error: any) {
    console.error("POST /api/fitness/treadmill error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to log treadmill session" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const verifiedUser = await getVerifiedUser(request);
  if (!verifiedUser) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const id = body.id || body.eventId;
    if (!id) {
      return NextResponse.json({ error: "Session ID is required for updates." }, { status: 400 });
    }

    const existing = await getLifeEventById(id);
    if (!existing) {
      return NextResponse.json({ error: "Treadmill session not found." }, { status: 404 });
    }

    const distanceKm = body.distanceKm !== undefined ? Number(body.distanceKm) : existing.attributes?.distanceKm || 0;
    const durationMins = body.durationMins !== undefined ? Number(body.durationMins) : existing.attributes?.durationMins || 0;
    let speedKph = body.speedKph !== undefined ? Number(body.speedKph) : existing.attributes?.speedKph;
    if (!speedKph && distanceKm > 0 && durationMins > 0) {
      speedKph = Number(((distanceKm / durationMins) * 60).toFixed(1));
    }

    const paceMinPerKm = body.paceMinPerKm || calculatePace(durationMins, distanceKm);

    const attributes: TreadmillAttributes = {
      ...(existing.attributes || {}),
      exerciseType: "Treadmill",
      workoutMode: body.workoutMode || existing.attributes?.workoutMode || "Treadmill Workout",
      distanceKm,
      durationMins,
      speedKph,
      inclinePercentage: body.inclinePercentage !== undefined ? Number(body.inclinePercentage) : existing.attributes?.inclinePercentage,
      paceMinPerKm,
      caloriesBurned: body.caloriesBurned !== undefined ? Number(body.caloriesBurned) : existing.attributes?.caloriesBurned,
      avgHeartRate: body.avgHeartRate !== undefined ? Number(body.avgHeartRate) : existing.attributes?.avgHeartRate,
      notes: body.notes !== undefined ? body.notes : existing.attributes?.notes,
    };

    const updated = await updateLifeEvent(id, {
      title: body.title || existing.title,
      date: body.date || existing.date,
      startTime: body.startTime !== undefined ? body.startTime : existing.startTime,
      description: body.notes || existing.description,
      attributes,
    });

    return NextResponse.json({
      success: true,
      session: updated,
      message: "Treadmill session updated.",
    });
  } catch (error: any) {
    console.error("PUT /api/fitness/treadmill error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update treadmill session" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const verifiedUser = await getVerifiedUser(request);
  if (!verifiedUser) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get("id");

    if (!id) {
      try {
        const body = await request.json();
        id = body.id || body.eventId;
      } catch {}
    }

    if (!id) {
      return NextResponse.json({ error: "Session ID is required for deletion." }, { status: 400 });
    }

    await deleteLifeEvent(id);

    return NextResponse.json({
      success: true,
      message: "Treadmill workout deleted successfully.",
    });
  } catch (error: any) {
    console.error("DELETE /api/fitness/treadmill error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete workout session" },
      { status: 500 }
    );
  }
}
