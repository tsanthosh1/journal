import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUser, unauthorizedResponse } from "@/lib/serverAuth";
import { getLifeEventById, updateLifeEvent, saveLifeEvent } from "@/lib/timeline/storage";
import { FoodPrimaryAnchor, FoodOccasion, FoodOccasionType } from "@/lib/timeline/types";

export const dynamic = "force-dynamic";

function getAdaptedOccasion(
  currentOccasion: string | undefined,
  targetAnchor: FoodPrimaryAnchor,
  occasionType: FoodOccasionType = "Main Meal"
): FoodOccasion {
  if (occasionType === "Snack") {
    if (targetAnchor === "Breakfast") return "Pre-Breakfast Snack";
    if (targetAnchor === "Lunch") return "Post-Lunch Snack";
    return "Pre-Dinner Snack";
  } else {
    if (targetAnchor === "Breakfast") return "Breakfast";
    if (targetAnchor === "Lunch") return "Lunch / Brunch";
    return "Dinner / Supper";
  }
}

export async function POST(request: NextRequest) {
  const verifiedUser = await getVerifiedUser(request);
  if (!verifiedUser) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const {
      eventId,
      targetDate,
      targetAnchor,
      isCopy = false,
    }: {
      eventId: string;
      targetDate: string;
      targetAnchor: FoodPrimaryAnchor;
      isCopy: boolean;
    } = body;

    if (!eventId || !targetDate || !targetAnchor) {
      return NextResponse.json(
        { error: "eventId, targetDate, and targetAnchor are required." },
        { status: 400 }
      );
    }

    const event = await getLifeEventById(eventId);
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const occasionType: FoodOccasionType =
      (event.attributes?.occasionType as FoodOccasionType) || "Main Meal";
    const adaptedOccasion = getAdaptedOccasion(
      event.attributes?.occasion,
      targetAnchor,
      occasionType
    );

    const updatedAttributes = {
      ...(event.attributes || {}),
      primaryAnchor: targetAnchor,
      occasionType,
      occasion: adaptedOccasion,
      mealType: occasionType === "Snack" ? "Snack" : targetAnchor,
    };

    if (isCopy) {
      // Create duplicate entry on target date and anchor
      const now = new Date().toISOString();
      const newEventData = {
        userId: event.userId,
        date: targetDate,
        startTime: event.startTime,
        endTime: event.endTime,
        durationMinutes: event.durationMinutes,
        title: event.title,
        description: event.description,
        activityType: "FOOD",
        mood: event.mood,
        tags: Array.isArray(event.tags) ? [...event.tags] : ["food", targetAnchor.toLowerCase()],
        attributes: updatedAttributes,
        createdAt: now,
        updatedAt: now,
      };

      const copied = await saveLifeEvent(newEventData);
      return NextResponse.json({
        success: true,
        action: "COPY",
        event: copied,
        message: `Copied ${event.title} to ${targetDate} (${targetAnchor})`,
      });
    } else {
      // Move entry to target date and anchor
      const updated = await updateLifeEvent(eventId, {
        date: targetDate,
        attributes: updatedAttributes,
      });

      return NextResponse.json({
        success: true,
        action: "MOVE",
        event: updated,
        message: `Moved ${event.title} to ${targetDate} (${targetAnchor})`,
      });
    }
  } catch (error: any) {
    console.error("POST /api/timeline/food/move-copy error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to move or copy food event" },
      { status: 500 }
    );
  }
}
