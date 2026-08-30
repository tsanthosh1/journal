import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  getRequestOrigin,
  saveGmailTokens,
} from "@/lib/gmail/oauth";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";

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

  const origin = getRequestOrigin(request);
  const baseRedirectUrl = new URL(returnTo, origin);

  if (error) {
    baseRedirectUrl.searchParams.set("auth_error", error);
    return NextResponse.redirect(baseRedirectUrl);
  }

  if (!code) {
    baseRedirectUrl.searchParams.set("auth_error", "No code provided");
    return NextResponse.redirect(baseRedirectUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens(code, origin);
    const targetUserId =
      userId && userId !== "default_user"
        ? userId
        : (tokens.email || "default_user");

    await saveGmailTokens(targetUserId, tokens);

    // Create Firebase Auth custom token if possible so user is automatically signed into Firebase Auth client
    try {
      if (tokens.email) {
        const { auth: adminAuth } = getFirebaseAdmin();
        let userRecord;
        try {
          userRecord = await adminAuth.getUserByEmail(tokens.email);
        } catch {
          userRecord = await adminAuth.createUser({
            email: tokens.email,
            emailVerified: true,
          });
        }
        const customToken = await adminAuth.createCustomToken(userRecord.uid);
        baseRedirectUrl.searchParams.set("firebase_token", customToken);
      }
    } catch (adminErr) {
      console.warn("Could not generate Firebase custom token:", adminErr);
    }

    if (tokens.email) {
      baseRedirectUrl.searchParams.set("email", tokens.email);
    }
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
