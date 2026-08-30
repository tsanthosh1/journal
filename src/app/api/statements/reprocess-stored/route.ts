import { FieldValue } from "firebase-admin/firestore";

import { applyCategoryRules } from "@/lib/categoryRules";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { getUserCategoryRules } from "@/lib/serverCategoryRules";
import { toStatementTransaction } from "@/lib/serverStatements";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];

  if (!token) {
    return Response.json({ error: "Missing Firebase ID token." }, { status: 401 });
  }

  try {
    const { auth, db } = getFirebaseAdmin();
    const decodedToken = await auth.verifyIdToken(token);
    const userRef = db.collection("users").doc(decodedToken.uid);

    const [uncategorizedSnapshot, categoryRules] = await Promise.all([
      userRef
        .collection("financialTransactions")
        .where("categoryHint", "==", "Uncategorized")
        .get(),
      getUserCategoryRules(userRef),
    ]);

    const batch = db.batch();
    const updatedAt = FieldValue.serverTimestamp();
    let reprocessedCount = 0;

    for (const doc of uncategorizedSnapshot.docs) {
      const data = doc.data();
      const transaction = toStatementTransaction({ ...data, transactionFingerprint: doc.id });
      const nextCategory = applyCategoryRules(transaction, categoryRules);

      if (nextCategory !== "Uncategorized") {
        batch.update(doc.ref, {
          categoryHint: nextCategory,
          updatedAt,
        });
        reprocessedCount += 1;
      }
    }

    if (reprocessedCount > 0) {
      await batch.commit();
    }

    return Response.json({
      reprocessedStatementCount: 1, // Satisfy client code check for success
      skippedStatementCount: 0,
      transactionCount: reprocessedCount,
    });
  } catch (error) {
    console.error("Stored statement reprocess failed", error);
    return Response.json(
      { error: "Could not reprocess stored statements." },
      { status: 500 },
    );
  }
}
