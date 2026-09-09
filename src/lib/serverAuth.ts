import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";

export interface VerifiedUser {
  uid: string;
  email: string | null;
  primaryUserId: string;
  candidateUserIds: string[];
}

/**
 * Extracts and verifies the Firebase ID token from the Authorization header.
 * Returns decoded identity information on success, or null if missing/invalid.
 */
export async function getVerifiedUser(request: NextRequest): Promise<VerifiedUser | null> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  try {
    const { auth } = getFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    const email = decoded.email || null;
    const sanitizedEmail = email ? email.replace(/[^a-zA-Z0-9_-]/g, "_") : null;
    const primaryUserId = sanitizedEmail || decoded.uid;
    const candidateUserIds = Array.from(
      new Set([decoded.uid, sanitizedEmail, email].filter(Boolean) as string[]),
    );

    return {
      uid: decoded.uid,
      email,
      primaryUserId,
      candidateUserIds,
    };
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies the Firebase ID token from the Authorization header.
 * Returns the verified primary user identifier on success, or undefined if missing/invalid.
 *
 * Clients must send: Authorization: Bearer <firebase_id_token>
 */
export async function getVerifiedUserId(request: NextRequest): Promise<string | undefined> {
  const user = await getVerifiedUser(request);
  return user?.primaryUserId || undefined;
}

/**
 * Returns true if the request carries a valid Firebase ID token.
 * All protected API routes must call this and return 401 on false.
 */
export async function isAuthorizedUser(request: NextRequest): Promise<boolean> {
  return (await getVerifiedUserId(request)) !== undefined;
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
