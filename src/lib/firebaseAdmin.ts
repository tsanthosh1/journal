import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const DEFAULT_SERVICE_ACCOUNT_PATH =
  "~/.firebase/track-everything-ai-firebase-adminsdk-fbsvc-778b38f3e1.json";

function getFirebaseAdminApp(): App {
  if (getApps().length) {
    return getApps()[0];
  }

  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? DEFAULT_SERVICE_ACCOUNT_PATH;
  const serviceAccount = readServiceAccount(serviceAccountPath);

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

function readServiceAccount(path: string) {
  try {
    const resolvedPath = path.startsWith("~/")
      ? resolve(homedir(), path.slice(2))
      : path;

    return JSON.parse(readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not read Firebase service account from ${path}. ${
        error instanceof Error ? error.message : ""
      }`,
    );
  }
}

export function getFirebaseAdmin() {
  const app = getFirebaseAdminApp();

  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  };
}
