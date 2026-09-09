import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse } from "@/lib/serverAuth";
import { getAvailableParsers, testParserOnContent } from "@/lib/parsers";

export async function GET(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse();
  }

  return NextResponse.json({ parsers: getAvailableParsers() });
}

export async function POST(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse();
  }

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
