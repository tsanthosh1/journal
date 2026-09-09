import { NextRequest, NextResponse } from "next/server";
import {
  getLifeEventsByDate,
  getLifeEventsRange,
  saveLifeEvent,
  saveLifeEventsBatch,
} from "@/lib/timeline/storage";
import { LifeEvent, TimelineDaySummary } from "@/lib/timeline/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const userId = searchParams.get("userId") || "default_user";

    let events: LifeEvent[] = [];

    if (date) {
      events = await getLifeEventsByDate(date, userId);
    } else if (startDate && endDate) {
      events = await getLifeEventsRange(startDate, endDate, userId);
    } else {
      const today = new Date().toISOString().split("T")[0];
      events = await getLifeEventsByDate(today, userId);
    }

    // Compute summary metrics
    const activityCounts: Record<string, number> = {};
    const moodsDetected = new Set<string>();
    let totalDurationMinutes = 0;

    for (const ev of events) {
      activityCounts[ev.activityType] = (activityCounts[ev.activityType] || 0) + 1;
      if (ev.mood) moodsDetected.add(ev.mood);
      if (ev.durationMinutes) totalDurationMinutes += ev.durationMinutes;
    }

    const summary: TimelineDaySummary = {
      date: date || new Date().toISOString().split("T")[0],
      totalEvents: events.length,
      totalDurationMinutes,
      activityCounts,
      moodsDetected: Array.from(moodsDetected),
    };

    return NextResponse.json({
      success: true,
      events,
      summary,
    });
  } catch (error: any) {
    console.error("GET /api/timeline/events error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch events" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body.userId || "default_user";

    // Handle batch save
    if (Array.isArray(body.events)) {
      const eventsToSave = body.events.map((ev: any) => ({
        ...ev,
        userId,
        tags: Array.isArray(ev.tags) ? ev.tags : [],
        attributes: ev.attributes || {},
      }));

      const saved = await saveLifeEventsBatch(eventsToSave);
      return NextResponse.json({
        success: true,
        count: saved.length,
        events: saved,
      });
    }

    // Handle single event save
    if (!body.title || !body.activityType) {
      return NextResponse.json(
        { error: "title and activityType are required fields" },
        { status: 400 }
      );
    }

    const eventToSave = {
      ...body,
      userId,
      date: body.date || new Date().toISOString().split("T")[0],
      tags: Array.isArray(body.tags) ? body.tags : [],
      attributes: body.attributes || {},
    };

    const saved = await saveLifeEvent(eventToSave, body.id);
    return NextResponse.json({
      success: true,
      event: saved,
    });
  } catch (error: any) {
    console.error("POST /api/timeline/events error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save event" },
      { status: 500 }
    );
  }
}
