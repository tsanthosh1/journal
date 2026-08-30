import { NextRequest, NextResponse } from "next/server";
import { getGoogleAuthUrl } from "@/lib/gmail/oauth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "default_user";
    const returnTo = searchParams.get("returnTo") || "/subscriptions";

    const statePayload = Buffer.from(
      JSON.stringify({ userId, returnTo }),
    ).toString("base64url");

    const origin = request.nextUrl.origin || new URL(request.url).origin;
    const authUrl = getGoogleAuthUrl(statePayload, origin);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Google auth initiate error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to generate Google OAuth URL" },
      { status: 500 },
    );
  }
}
