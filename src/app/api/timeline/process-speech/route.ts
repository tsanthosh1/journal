import { NextRequest, NextResponse } from "next/server";
import { extractLifeEventsFromSpeech } from "@/lib/timeline/aiExtractor";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const spokenText = body.spokenText || body.text || "";

    if (!spokenText.trim()) {
      return NextResponse.json(
        { error: "No spoken text or transcript provided." },
        { status: 400 }
      );
    }

    const targetDate = body.targetDate || body.date || new Date().toISOString().split("T")[0];
    const timezone = body.timezone || "Asia/Kolkata";
    const autoEvolveSchema = body.autoEvolveSchema !== false;

    console.log(`[POST /api/timeline/process-speech] Processing speech for date ${targetDate} (${spokenText.length} chars)`);

    const result = await extractLifeEventsFromSpeech(spokenText, {
      targetDate,
      timezone,
      autoEvolveSchema,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error("POST /api/timeline/process-speech error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process speech input" },
      { status: 500 }
    );
  }
}
