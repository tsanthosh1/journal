import type { User } from "firebase/auth";

/**
 * Drop-in replacement for fetch() that automatically injects the Firebase ID
 * token into every request as `Authorization: Bearer <token>`.
 *
 * Usage:
 *   const res = await authFetch(user, "/api/sync/worker", { method: "POST", ... });
 *
 * Throws if user is null (not authenticated).
 */
export async function authFetch(
  user: User | null,
  url: string,
  options?: RequestInit,
): Promise<Response> {
  if (!user) {
    throw new Error("authFetch: user is not authenticated");
  }

  // getIdToken() returns a cached token and only refreshes when it's close to expiry
  const idToken = await user.getIdToken();

  return fetch(url, {
    ...options,
    headers: {
      ...(options?.headers ?? {}),
      Authorization: `Bearer ${idToken}`,
    },
  });
}
