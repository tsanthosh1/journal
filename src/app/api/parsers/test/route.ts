import { NextRequest, NextResponse } from "next/server";
import { getAvailableParsers, testParserOnContent } from "@/lib/parsers";

export async function GET() {
  return NextResponse.json({ parsers: getAvailableParsers() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { parserModule, content, subject, customRegex, parserConfig } = body;

    if (!parserModule || !content) {
      return NextResponse.json(
        { error: "Missing required fields: parserModule and content" },
        { status: 400 },
      );
    }

    const testResult = testParserOnContent(
      parserModule,
      content,
      subject || "",
      customRegex,
      parserConfig,
    );

    return NextResponse.json({ testResult });
  } catch (error) {
    console.error("POST /api/parsers/test error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to test parser" },
      { status: 500 },
    );
  }
}
