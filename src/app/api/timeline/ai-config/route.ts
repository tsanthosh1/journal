import { NextRequest, NextResponse } from "next/server";
import { getAiConfig, saveAiConfig } from "@/lib/timeline/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getAiConfig();
    const maskedKey = config.apiKey
      ? `${config.apiKey.slice(0, 7)}...${config.apiKey.slice(-4)}`
      : undefined;

    return NextResponse.json({
      success: true,
      config: {
        provider: config.provider,
        isConfigured: config.isConfigured,
        model: config.model,
        maskedKey,
        updatedAt: config.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("GET /api/timeline/ai-config error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch AI config" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const updated = await saveAiConfig({
      provider: body.provider,
      apiKey: body.apiKey,
      model: body.model,
    });

    return NextResponse.json({
      success: true,
      message: `${updated.provider === "gemini" ? "Google Gemini" : "OpenRouter"} AI configuration updated`,
      config: {
        provider: updated.provider,
        isConfigured: updated.isConfigured,
        model: updated.model,
      },
    });
  } catch (error: any) {
    console.error("POST /api/timeline/ai-config error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save AI config" },
      { status: 500 }
    );
  }
}
