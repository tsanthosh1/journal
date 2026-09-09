import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";

/**
 * Extracts and verifies the Firebase ID token from the Authorization header.
 * Returns the decoded token UID on success, or null if missing/invalid.
 *
 * Clients must send: Authorization: Bearer <firebase_id_token>
 */
export async function getVerifiedUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  try {
    const { auth } = getFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

/**
 * Returns true if the request carries a valid Firebase ID token.
 * All protected API routes must call this and return 401 on false.
 */
export async function isAuthorizedUser(request: NextRequest): Promise<boolean> {
  return (await getVerifiedUserId(request)) !== null;
}

/**
 * Standard 401 Unauthorized response for protected API endpoints.
 */
export function unauthorizedResponse(
  message = "Unauthorized: valid Firebase ID token required (Authorization: Bearer <token>)",
  additionalData: Record<string, unknown> = {},
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...additionalData,
    },
    { status: 401 },
  );
}

/**
 * @deprecated — userId from query/header is no longer trusted as identity.
 * Use getVerifiedUserId() which validates against Firebase Auth.
 * Kept only for graceful migration; will be removed once all callers are updated.
 */
export function getRequestUserId(request: NextRequest): string | null {
  const { searchParams } = new URL(request.url);
  const paramUserId = searchParams.get("userId");
  const headerUserId = request.headers.get("x-user-id");
  const userId = paramUserId || headerUserId;
  if (!userId || !userId.trim() || userId === "default_user" || userId === "default-user") {
    return null;
  }
  return userId.trim();
}
