import { NextRequest, NextResponse } from "next/server";
import { extractLifeEventsFromSpeech } from "@/lib/timeline/aiExtractor";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const spokenText = body.spokenText || body.text || "";
    const audioBase64 = body.audioBase64;
    const audioMimeType = body.audioMimeType || "audio/webm";

    if (!spokenText.trim() && !audioBase64) {
      return NextResponse.json(
        { error: "No spoken text or audio recording provided." },
        { status: 400 }
      );
    }

    const targetDate = body.targetDate || body.date || new Date().toISOString().split("T")[0];
    const timezone = body.timezone || "Asia/Kolkata";
    const autoEvolveSchema = body.autoEvolveSchema !== false;

    console.log(`[POST /api/timeline/process-speech] Processing speech for date ${targetDate} (text: ${spokenText.length} chars, audio: ${Boolean(audioBase64)})`);

    const result = await extractLifeEventsFromSpeech(spokenText, {
      targetDate,
      timezone,
      autoEvolveSchema,
      audioBase64,
      audioMimeType,
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
