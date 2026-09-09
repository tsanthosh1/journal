/**
 * Sanitizes an OAuth returnTo / redirect URL so it can only ever be
 * a same-origin relative path.  Blocks open-redirect attacks like:
 *   returnTo=https://evil.com   → /subscriptions
 *   returnTo=//evil.com         → /subscriptions
 *   returnTo=javascript:...     → /subscriptions
 */
export function sanitizeReturnTo(
  returnTo: string | null | undefined,
  fallback = "/subscriptions",
): string {
  if (
    !returnTo ||
    typeof returnTo !== "string" ||
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//")
  ) {
    return fallback;
  }
  // Strip any embedded protocol or authority that may have slipped through
  try {
    // new URL(relative, base) must resolve to the same origin
    const base = "http://localhost";
    const resolved = new URL(returnTo, base);
    if (resolved.origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return returnTo;
}
