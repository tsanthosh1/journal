import { NextRequest, NextResponse } from "next/server";

/**
 * Extracts the user identifier from the request, checking:
 * 1. Query parameter `userId`
 * 2. Header `x-user-id`
 *
 * Rejects unauthenticated default identifiers (`default_user`, `default-user`, empty).
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

/**
 * Returns true if the request comes from an authenticated user.
 */
export function isAuthorizedUser(request: NextRequest): boolean {
  return getRequestUserId(request) !== null;
}

/**
 * Standard 401 Unauthorized response for protected API endpoints.
 */
export function unauthorizedResponse(
  message = "Unauthorized: Authentication required to access this resource",
  additionalData: Record<string, any> = {},
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
