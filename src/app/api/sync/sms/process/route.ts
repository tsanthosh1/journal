import { NextRequest, NextResponse } from "next/server";
import { runSmsSyncEngine } from "@/lib/sms/smsSyncEngine";

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const userId = body.userId || searchParams.get("userId") || "default_user";

    if (!userId || userId === "default_user") {
      return NextResponse.json(
        { error: "Valid userId is required for SMS processing" },
        { status: 400 },
      );
    }

    const result = await runSmsSyncEngine(userId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/sync/sms/process error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to process SMS messages" },
      { status: 500 },
    );
  }
}
