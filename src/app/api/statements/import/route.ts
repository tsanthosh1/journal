import { FieldValue } from "firebase-admin/firestore";

import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import {
  getImportMetadata,
  validateImportPayload,
} from "@/lib/statementValidation";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];

  if (!token) {
    return Response.json({ error: "Missing Firebase ID token." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateImportPayload(body);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const { fileHash, fileName } = getImportMetadata(body);
  const { statement } = validation;

  try {
    const { auth, db } = getFirebaseAdmin();
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;
    const userRef = db.collection("users").doc(userId);
    const statementRef = userRef.collection("statementFiles").doc(fileHash);
    const existingStatement = await statementRef.get();

    if (existingStatement.exists) {
      return Response.json(
        {
          error: "Statement already imported.",
          statementId: fileHash,
        },
        { status: 409 },
      );
    }

    const batch = db.batch();
    const importedAt = FieldValue.serverTimestamp();

    batch.set(
      userRef,
      {
        updatedAt: importedAt,
      },
      { merge: true },
    );

    batch.set(statementRef, {
      fileHash,
      fileName,
      bankName: statement.bankName,
      accountNumberMasked: statement.accountNumberMasked,
      accountType: statement.accountType,
      currency: statement.currency,
      statementFrom: statement.statementFrom,
      statementTo: statement.statementTo,
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
      totalWithdrawals: statement.totalWithdrawals,
      totalDeposits: statement.totalDeposits,
      transactionCount: statement.transactionCount,
      status: "imported",
      source: "manual_upload",
      importedAt,
      updatedAt: importedAt,
    });

    for (const transaction of statement.transactions) {
      const transactionRef = userRef
        .collection("financialTransactions")
        .doc(`${fileHash}_${transaction.id}`);

      batch.set(transactionRef, {
        ...transaction,
        statementFileHash: fileHash,
        source: "bank_statement",
        reviewStatus: "pending_review",
        importedAt,
        updatedAt: importedAt,
      });
    }

    await batch.commit();

    return Response.json({
      statementId: fileHash,
      transactionCount: statement.transactionCount,
    });
  } catch (error) {
    console.error("Statement import failed", error);
    return Response.json(
      { error: "Could not import statement." },
      { status: 500 },
    );
  }
}
