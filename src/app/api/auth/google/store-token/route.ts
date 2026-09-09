import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse } from "@/lib/serverAuth";
import { saveGmailTokens } from "@/lib/gmail/oauth";

export async function POST(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { userId, email, accessToken, refreshToken, expiryDate } = body;

    if (!userId || !accessToken) {
      return NextResponse.json(
        { error: "Missing required fields: userId and accessToken" },
        { status: 400 },
      );
    }

    await saveGmailTokens(userId, {
      accessToken,
      refreshToken,
      expiryDate: expiryDate || Date.now() + 3600000,
      email,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/auth/google/store-token error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to store token" },
      { status: 500 },
    );
  }
}
