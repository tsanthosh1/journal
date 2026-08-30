import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import {
  getUserCategoryRules,
  saveUserCategoryRules,
} from "@/lib/serverCategoryRules";
import { setCollectionCounts } from "@/lib/serverStats";
import type { CategoryRule } from "@/lib/types";

export async function GET(request: Request) {
  const authResult = await getUserRef(request);

  if (!authResult.ok) {
    return Response.json({ error: authResult.error }, { status: authResult.status });
  }

  const rules = await getUserCategoryRules(authResult.userRef);

  return Response.json({ rules });
}

export async function PUT(request: Request) {
  const authResult = await getUserRef(request);

  if (!authResult.ok) {
    return Response.json({ error: authResult.error }, { status: authResult.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isCategoryRulesPayload(body)) {
    return Response.json({ error: "Invalid category rules." }, { status: 400 });
  }

  const rules = await saveUserCategoryRules(authResult.userRef, body.rules);
  await setCollectionCounts(authResult.userRef, {
    categoryRules: rules.length,
  });

  return Response.json({ rules });
}

async function getUserRef(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];

  if (!token) {
    return { ok: false as const, error: "Missing Firebase ID token.", status: 401 };
  }

  try {
    const { auth, db } = getFirebaseAdmin();
    const decodedToken = await auth.verifyIdToken(token);

    return {
      ok: true as const,
      userRef: db.collection("users").doc(decodedToken.uid),
    };
  } catch {
    return { ok: false as const, error: "Invalid Firebase ID token.", status: 401 };
  }
}

function isCategoryRulesPayload(
  value: unknown,
): value is { rules: CategoryRule[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "rules" in value &&
    Array.isArray(value.rules) &&
    value.rules.length <= 50
  );
}
