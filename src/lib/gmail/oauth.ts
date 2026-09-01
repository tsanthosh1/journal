import { getFirebaseAdmin } from "../firebaseAdmin";
import { GmailTokenRecord } from "../subscriptionTypes";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_READONLY_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email openid";

export function resolveBaseUrl(customOrigin?: string): string {
  if (
    customOrigin &&
    !customOrigin.includes("0.0.0.0") &&
    !customOrigin.includes("localhost:8080")
  ) {
    return customOrigin;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.NODE_ENV === "production") {
    return "https://track-everything-ai.web.app";
  }
  return "http://localhost:3000";
}

export function getRequestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const host = forwardedHost || request.headers.get("host") || "";

  if (
    host &&
    !host.startsWith("0.0.0.0") &&
    !host.includes("localhost:8080")
  ) {
    return `${forwardedProto}://${host}`;
  }

  return resolveBaseUrl();
}

export function getGoogleOAuthCredentials(customOrigin?: string) {
  const clientId =
    process.env.GOOGLE_CLIENT_ID ??
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ??
    "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";

  const baseUrl = resolveBaseUrl(customOrigin);

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    `${baseUrl}/api/auth/google/callback`;

  return { clientId, clientSecret, redirectUri };
}

/**
 * Builds the Google OAuth 2.0 Authorization URL
 */
export function getGoogleAuthUrl(state = "default_user", customOrigin?: string): string {
  const { clientId, redirectUri } = getGoogleOAuthCredentials(customOrigin);

  if (!clientId) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local",
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent", // Force consent screen to guarantee refresh_token
    state,
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchanges the OAuth authorization code for Access and Refresh tokens
 */
export async function exchangeCodeForTokens(code: string, customOrigin?: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  email?: string;
  scope?: string;
}> {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthCredentials(customOrigin);

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.");
  }

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      `Google OAuth token exchange failed: ${data.error_description || data.error || response.statusText}`,
    );
  }

  const expiresInSec = data.expires_in || 3600;
  const expiryDate = Date.now() + expiresInSec * 1000;

  // Retrieve user email from userinfo endpoint
  let email: string | undefined;
  try {
    const userInfoRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${data.access_token}` },
      },
    );
    if (userInfoRes.ok) {
      const userInfo = await userInfoRes.json();
      email = userInfo.email;
    }
  } catch {
    // optional email retrieval
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiryDate,
    email,
    scope: data.scope,
  };
}

/**
 * Refreshes an expired Google OAuth Access Token using the Refresh Token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiryDate: number;
}> {
  const { clientId, clientSecret } = getGoogleOAuthCredentials();

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET for token refresh.");
  }

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      `Failed to refresh Google OAuth token: ${data.error_description || data.error || response.statusText}`,
    );
  }

  const expiresInSec = data.expires_in || 3600;
  const expiryDate = Date.now() + expiresInSec * 1000;

  return {
    accessToken: data.access_token,
    expiryDate,
  };
}

/**
 * Saves or updates Gmail OAuth token record in Firestore
 */
export async function saveGmailTokens(
  userId: string,
  tokens: {
    accessToken: string;
    refreshToken?: string;
    expiryDate: number;
    email?: string;
    scope?: string;
  },
): Promise<void> {
  const { db } = getFirebaseAdmin();
  const tokenDocRef = db.collection("gmail_tokens").doc(userId);

  const existing = await tokenDocRef.get();
  const existingData = existing.data() as GmailTokenRecord | undefined;

  const payload: Partial<GmailTokenRecord> = {
    userId,
    accessToken: tokens.accessToken,
    expiryDate: tokens.expiryDate,
    updatedAt: new Date().toISOString(),
  };

  if (tokens.refreshToken) {
    payload.refreshToken = tokens.refreshToken;
  } else if (existingData?.refreshToken) {
    payload.refreshToken = existingData.refreshToken;
  }

  if (tokens.email) payload.email = tokens.email;
  if (tokens.scope) payload.scope = tokens.scope;

  await tokenDocRef.set(payload, { merge: true });

  // Also store under normalized doc ID and "default_user" alias for single-tenant resilience
  if (tokens.email && tokens.email !== userId) {
    const emailKey = tokens.email.replace(/[^a-zA-Z0-9_-]/g, "_");
    await db.collection("gmail_tokens").doc(emailKey).set(payload, { merge: true });
    await db.collection("gmail_tokens").doc("default_user").set(payload, { merge: true });
  }
}

/**
 * Retrieves a valid Gmail access token for a user, automatically refreshing if close to expiry
 */
export async function getValidGmailToken(
  userId = "default_user",
  forceRefresh = false,
): Promise<{
  accessToken: string;
  email?: string;
  lastSyncAt?: string;
} | null> {
  const { db } = getFirebaseAdmin();
  
  // Try candidate keys in order:
  const candidateKeys = [
    userId,
    userId.replace(/[^a-zA-Z0-9_-]/g, "_"),
    "default_user",
  ];

  let record: GmailTokenRecord | null = null;
  let activeDocKey = userId;

  for (const key of candidateKeys) {
    if (!key) continue;
    const snap = await db.collection("gmail_tokens").doc(key).get();
    if (snap.exists) {
      record = snap.data() as GmailTokenRecord;
      activeDocKey = key;
      break;
    }
  }

  // If still not found, search by email field or grab the first available token document
  if (!record) {
    const emailQuery = await db
      .collection("gmail_tokens")
      .where("email", "==", userId)
      .limit(1)
      .get();
    if (!emailQuery.empty) {
      record = emailQuery.docs[0].data() as GmailTokenRecord;
      activeDocKey = emailQuery.docs[0].id;
    } else {
      const anyQuery = await db.collection("gmail_tokens").limit(1).get();
      if (!anyQuery.empty) {
        record = anyQuery.docs[0].data() as GmailTokenRecord;
        activeDocKey = anyQuery.docs[0].id;
      }
    }
  }

  if (!record) {
    return null;
  }

  const now = Date.now();
  const shouldRefresh =
    forceRefresh ||
    !record.accessToken ||
    !record.expiryDate ||
    record.expiryDate - now < 300000;

  // If token is expired / close to expiry / force refreshed, and refresh token is available
  if (shouldRefresh && record.refreshToken) {
    try {
      const refreshed = await refreshAccessToken(record.refreshToken);
      await saveGmailTokens(activeDocKey, {
        accessToken: refreshed.accessToken,
        expiryDate: refreshed.expiryDate,
        refreshToken: record.refreshToken,
      });
      return {
        accessToken: refreshed.accessToken,
        email: record.email,
        lastSyncAt: record.lastSyncAt,
      };
    } catch (err) {
      console.error("Token refresh error:", err);
      if (record.accessToken && !forceRefresh) {
        return {
          accessToken: record.accessToken,
          email: record.email,
          lastSyncAt: record.lastSyncAt,
        };
      }
      return null;
    }
  }

  return {
    accessToken: record.accessToken,
    email: record.email,
    lastSyncAt: record.lastSyncAt,
  };
}

/**
 * Removes user Gmail tokens (disconnect integration)
 */
export async function disconnectGmail(userId = "default_user"): Promise<void> {
  const { db } = getFirebaseAdmin();
  await db.collection("gmail_tokens").doc(userId).delete();
  const normalizedKey = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  await db.collection("gmail_tokens").doc(normalizedKey).delete();
  await db.collection("gmail_tokens").doc("default_user").delete();
}
