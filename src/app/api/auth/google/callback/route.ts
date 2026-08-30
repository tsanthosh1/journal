import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, saveGmailTokens } from "@/lib/gmail/oauth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const rawState = searchParams.get("state");
  const error = searchParams.get("error");

  let userId = "default_user";
  let returnTo = "/subscriptions";

  if (rawState) {
    try {
      const decoded = JSON.parse(Buffer.from(rawState, "base64url").toString("utf8"));
      if (decoded.userId) userId = decoded.userId;
      if (decoded.returnTo) returnTo = decoded.returnTo;
    } catch {
      userId = rawState;
    }
  }

  const baseRedirectUrl = new URL(returnTo, request.url);

  if (error) {
    baseRedirectUrl.searchParams.set("auth_error", error);
    return NextResponse.redirect(baseRedirectUrl);
  }

  if (!code) {
    baseRedirectUrl.searchParams.set("auth_error", "No code provided");
    return NextResponse.redirect(baseRedirectUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveGmailTokens(userId, tokens);

    baseRedirectUrl.searchParams.set("auth", "success");
    return NextResponse.redirect(baseRedirectUrl);
  } catch (err) {
    console.error("Google auth callback error:", err);
    baseRedirectUrl.searchParams.set(
      "auth_error",
      (err as Error).message || "Token exchange failed",
    );
    return NextResponse.redirect(baseRedirectUrl);
  }
}
