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

const DEFAULT_SERVICE_ACCOUNT_PATH =
  "~/.firebase/track-everything-ai-firebase-adminsdk-fbsvc-778b38f3e1.json";

function getFirebaseAdminApp(): App {
  if (getApps().length) {
    return getApps()[0];
  }

  const explicitServiceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const defaultServiceAccountPath = expandHome(DEFAULT_SERVICE_ACCOUNT_PATH);

  if (explicitServiceAccountPath) {
    return initializeApp({
      credential: cert(readServiceAccount(explicitServiceAccountPath)),
    });
  }

  if (existsSync(defaultServiceAccountPath)) {
    return initializeApp({
      credential: cert(readServiceAccount(defaultServiceAccountPath)),
    });
  }

  return initializeApp({
    credential: applicationDefault(),
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

  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  };
}
