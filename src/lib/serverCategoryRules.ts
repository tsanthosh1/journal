import type { DocumentReference } from "firebase-admin/firestore";

import {
  DEFAULT_CATEGORY_RULES,
  sanitizeCategoryRules,
} from "@/lib/categoryRules";
import type { CategoryRule } from "@/lib/types";

export async function getUserCategoryRules(userRef: DocumentReference) {
  const snapshot = await userRef
    .collection("categoryRules")
    .orderBy("priority", "asc")
    .get();

  if (snapshot.empty) {
    await saveUserCategoryRules(userRef, DEFAULT_CATEGORY_RULES);
    return DEFAULT_CATEGORY_RULES;
  }

  return snapshot.docs.map((doc) => {
    const data = doc.data();

    return {
      id: doc.id,
      category: String(data.category ?? "Uncategorized"),
      keywords: Array.isArray(data.keywords)
        ? data.keywords.map(String)
        : [],
      direction:
        data.direction === "deposit" || data.direction === "withdrawal"
          ? data.direction
          : "any",
      priority: typeof data.priority === "number" ? data.priority : 999,
      enabled: data.enabled !== false,
      color: typeof data.color === "string" ? data.color : undefined,
    } satisfies CategoryRule;
  });
}

export async function saveUserCategoryRules(
  userRef: DocumentReference,
  rules: CategoryRule[],
) {
  const sanitizedRules = sanitizeCategoryRules(rules);
  const existingRules = await userRef.collection("categoryRules").listDocuments();
  const batch = userRef.firestore.batch();

  for (const ruleRef of existingRules) {
    batch.delete(ruleRef);
  }

  sanitizedRules.forEach((rule, index) => {
    batch.set(userRef.collection("categoryRules").doc(rule.id), {
      ...rule,
      priority: index + 1,
      updatedAt: new Date().toISOString(),
    });
  });

  await batch.commit();

  return sanitizedRules.map((rule, index) => ({
    ...rule,
    priority: index + 1,
  }));
}
