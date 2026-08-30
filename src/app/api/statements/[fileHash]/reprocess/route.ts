import { FieldValue } from "firebase-admin/firestore";

import { applyCategoryRules } from "@/lib/categoryRules";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { getUserCategoryRules } from "@/lib/serverCategoryRules";
import {
  getTransactionFingerprint,
  loadStatementTransactions,
} from "@/lib/serverStatements";
import { enrichTransaction } from "@/lib/transactionEnrichment";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ fileHash: string }> },
) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];

  if (!token) {
    return Response.json({ error: "Missing Firebase ID token." }, { status: 401 });
  }

  const { fileHash } = await params;

  if (!/^[a-f0-9]{64}$/.test(fileHash)) {
    return Response.json({ error: "Invalid statement id." }, { status: 400 });
  }

  try {
    const { auth, db } = getFirebaseAdmin();
    const decodedToken = await auth.verifyIdToken(token);
    const userRef = db.collection("users").doc(decodedToken.uid);
    const statementRef = userRef.collection("statementFiles").doc(fileHash);
    const statementDoc = await statementRef.get();

    if (!statementDoc.exists) {
      return Response.json({ error: "Statement not found." }, { status: 404 });
    }

    const statementData = statementDoc.data() ?? {};
    const [rules, transactions] = await Promise.all([
      getUserCategoryRules(userRef),
      loadStatementTransactions(userRef, fileHash, {
        statementFrom:
          typeof statementData.statementFrom === "string"
            ? statementData.statementFrom
            : null,
        statementTo:
          typeof statementData.statementTo === "string"
            ? statementData.statementTo
            : null,
      }),
    ]);
    const batch = db.batch();
    const updatedAt = FieldValue.serverTimestamp();

    let reprocessedCount = 0;

    for (const transaction of transactions) {
      if (transaction.categoryHint === "Uncategorized") {
        const categoryHint = applyCategoryRules(transaction, rules);
        if (categoryHint !== "Uncategorized") {
          const enrichedTransaction = enrichTransaction({
            ...transaction,
            categoryHint,
          });
          const transactionFingerprint =
            transaction.transactionFingerprint ??
            getTransactionFingerprint(
              String(statementData.accountNumberMasked ?? ""),
              transaction,
            );
          const transactionRef = userRef
            .collection("financialTransactions")
            .doc(transactionFingerprint);

          batch.set(
            transactionRef,
            {
              ...enrichedTransaction,
              transactionFingerprint,
              bankName: String(statementData.bankName ?? "Unknown bank"),
              accountNumberMasked: String(
                statementData.accountNumberMasked ?? "Unknown account",
              ),
              accountKey: `${String(statementData.bankName ?? "Unknown bank")}:${String(
                statementData.accountNumberMasked ?? "Unknown account",
              )}`,
              statementFileHash: fileHash,
              statementFileHashes: FieldValue.arrayUnion(fileHash),
              source: "bank_statement",
              reviewStatus: "pending_review",
              updatedAt,
            },
            { merge: true },
          );
          reprocessedCount += 1;
        }
      }
    }

    batch.set(
      statementRef,
      {
        categorizedAt: updatedAt,
        updatedAt,
      },
      { merge: true },
    );

    await batch.commit();

    return Response.json({ transactionCount: reprocessedCount });
  } catch (error) {
    console.error("Statement reprocess failed", error);
    return Response.json(
      { error: "Could not reprocess statement." },
      { status: 500 },
    );
  }
}
