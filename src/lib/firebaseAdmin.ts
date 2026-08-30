import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const DEFAULT_SERVICE_ACCOUNT_PATH =
  "~/.firebase/track-everything-ai-firebase-adminsdk-fbsvc-778b38f3e1.json";

function getFirebaseAdminApp(): App {
  if (getApps().length) {
    return getApps()[0];
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
  const explicitServiceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const defaultServiceAccountPath = expandHome(DEFAULT_SERVICE_ACCOUNT_PATH);

  const storageBucket = getFirebaseStorageBucketName();
  const appOptions = storageBucket ? { storageBucket } : {};

  // 1. Direct JSON or Base64 string from environment variable (ideal for Vercel)
  if (serviceAccountJson) {
    try {
      let parsed = {};
      const trimmed = serviceAccountJson.trim();
      if (trimmed.startsWith("{")) {
        parsed = JSON.parse(trimmed);
      } else {
        // Assume Base64 encoded JSON
        const decoded = Buffer.from(trimmed, "base64").toString("utf8");
        parsed = JSON.parse(decoded);
      }
      return initializeApp({
        credential: cert(parsed),
        ...appOptions,
      });
    } catch (err) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", err);
    }
  }

  // 2. Explicit file path
  if (explicitServiceAccountPath) {
    return initializeApp({
      credential: cert(readServiceAccount(explicitServiceAccountPath)),
      ...appOptions,
    });
  }

  // 3. Local default service account path
  if (existsSync(defaultServiceAccountPath)) {
    return initializeApp({
      credential: cert(readServiceAccount(defaultServiceAccountPath)),
      ...appOptions,
    });
  }

  // 4. Default application credentials
  return initializeApp({
    credential: applicationDefault(),
    ...appOptions,
  });
}

function readServiceAccount(path: string) {
  try {
    return JSON.parse(readFileSync(expandHome(path), "utf8"));
  } catch (error) {
    throw new Error(
      `Could not read Firebase service account from ${path}. ${
        error instanceof Error ? error.message : ""
      }`,
    );
  }
}

function expandHome(path: string) {
  return path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path;
}

export function getFirebaseAdmin() {
  const app = getFirebaseAdminApp();
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Already configured or settings cannot be re-applied
  }

  return {
    app,
    auth: getAuth(app),
    db,
    storage: getStorage(app),
  };
}

export function getFirebaseStorageBucketName() {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ??
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    ""
  );
}

export function getFirebaseStorageBucket() {
  const { storage } = getFirebaseAdmin();
  const bucketName = getFirebaseStorageBucketName();

  if (!bucketName) {
    throw new Error(
      "Firebase Storage bucket is not configured. Set FIREBASE_STORAGE_BUCKET or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.",
    );
  }

  return storage.bucket(bucketName);
}
