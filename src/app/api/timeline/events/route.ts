import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUser } from "@/lib/serverAuth";
import {
  getLifeEventsByDate,
  getLifeEventsRange,
  saveLifeEvent,
  saveLifeEventsBatch,
} from "@/lib/timeline/storage";
import { LifeEvent, TimelineDaySummary } from "@/lib/timeline/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const verifiedUser = await getVerifiedUser(request);
  if (!verifiedUser) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    
    // Resolve user ID: query param or authenticated user identity
    const queryUserId = searchParams.get("userId");
    const authUserId = verifiedUser.email || verifiedUser.primaryUserId;
    const userId = (queryUserId && queryUserId !== "default_user") ? queryUserId : authUserId;

    let events: LifeEvent[] = [];

    if (date) {
      events = await getLifeEventsByDate(date, userId);
    } else if (startDate && endDate) {
      events = await getLifeEventsRange(startDate, endDate, userId);
    } else {
      const today = new Date().toLocaleDateString("en-CA");
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
      date: date || new Date().toLocaleDateString("en-CA"),
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
  const verifiedUser = await getVerifiedUser(request);
  if (!verifiedUser) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const authUserId = verifiedUser.email || verifiedUser.primaryUserId;
    const userId = (body.userId && body.userId !== "default_user") ? body.userId : authUserId;

    // Handle batch save
    if (Array.isArray(body.events)) {
      const eventsToSave = body.events.map((ev: any) => ({
        ...ev,
        userId: (ev.userId && ev.userId !== "default_user") ? ev.userId : userId,
        date: ev.date || new Date().toLocaleDateString("en-CA"),
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

    // Handle single event save (support both raw body or { event: ... })
    const eventPayload = body.event || body;
    if (!eventPayload.title || !eventPayload.activityType) {
      return NextResponse.json(
        { error: "title and activityType are required fields" },
        { status: 400 }
      );
    }

    const eventToSave = {
      ...eventPayload,
      userId: (eventPayload.userId && eventPayload.userId !== "default_user") ? eventPayload.userId : userId,
      date: eventPayload.date || new Date().toLocaleDateString("en-CA"),
      tags: Array.isArray(eventPayload.tags) ? eventPayload.tags : [],
      attributes: eventPayload.attributes || {},
    };

    const saved = await saveLifeEvent(eventToSave, eventPayload.id);
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
