import { FieldValue } from "firebase-admin/firestore";

import { applyCategoryRules, categorizeTransactions, getNextCategoryColor } from "@/lib/categoryRules";
import {
  getFirebaseAdmin,
  getFirebaseStorageBucket,
} from "@/lib/firebaseAdmin";
import { getUserCategoryRules } from "@/lib/serverCategoryRules";
import { createBatchWriter } from "@/lib/serverImportHelpers";
import { incrementCollectionCounts } from "@/lib/serverStats";
import { getTransactionFingerprint } from "@/lib/serverStatements";
import {
  getImportMetadata,
  validateImportPayload,
} from "@/lib/statementValidation";
import { enrichTransaction } from "@/lib/transactionEnrichment";

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

  const { fileHash, fileName, statementText } = getImportMetadata(body);
  const { statement } = validation;

  try {
    const { auth, db } = getFirebaseAdmin();
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;
    const userRef = db.collection("users").doc(userId);
    const statementRef = userRef.collection("statementFiles").doc(fileHash);
    const existingStatement = await statementRef.get();
    const categoryRules = await getUserCategoryRules(userRef);
    const categorizedTransactions = statement.transactions.map((transaction) => {
      if (transaction.categoryHint && transaction.categoryHint !== "Uncategorized") {
        return {
          ...transaction,
          isCategoryManual: true,
        };
      }
      return {
        ...transaction,
        categoryHint: applyCategoryRules(transaction, categoryRules),
      };
    });

    if (existingStatement.exists) {
      return Response.json(
        {
          error: "Statement already imported.",
          statementId: fileHash,
        },
        { status: 409 },
      );
    }

    const existingRuleCategories = new Set(categoryRules.map((rule) => rule.category));
    const manualCategoriesToAdd = new Set<string>();
    for (const transaction of categorizedTransactions) {
      if (
        transaction.isCategoryManual &&
        transaction.categoryHint &&
        transaction.categoryHint !== "Uncategorized" &&
        !existingRuleCategories.has(transaction.categoryHint)
      ) {
        manualCategoriesToAdd.add(transaction.categoryHint);
      }
    }

    const importedAt = FieldValue.serverTimestamp();
    const batchWriter = createBatchWriter(db);

    let ruleCount = categoryRules.length;
    for (const category of manualCategoriesToAdd) {
      const color = getNextCategoryColor(ruleCount);
      const ruleId = `rule-${Date.now()}-${ruleCount}`;
      batchWriter.set(userRef.collection("categoryRules").doc(ruleId), {
        id: ruleId,
        category: category,
        keywords: [],
        direction: "any",
        priority: ruleCount + 1,
        enabled: true,
        color: color,
        updatedAt: importedAt,
      });
      ruleCount += 1;
    }

    const storagePath = `users/${userId}/statements/${fileHash}.txt`;

    await getFirebaseStorageBucket().file(storagePath).save(statementText, {
      contentType: "text/plain; charset=utf-8",
      metadata: {
        cacheControl: "private, max-age=0",
        metadata: {
          fileHash,
          fileName,
          userId,
        },
      },
    });

    batchWriter.set(
      userRef,
      {
        updatedAt: importedAt,
      },
      { merge: true },
    );

    batchWriter.set(statementRef, {
      fileHash,
      fileName,
      storagePath,
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
      processedAt: importedAt,
      importedAt,
      updatedAt: importedAt,
    });

    const transactionWrites = new Map<
      string,
      {
        data: FirebaseFirestore.DocumentData;
        statementFileHashes: Set<string>;
        sourceCount: number;
      }
    >();

    for (const transaction of categorizedTransactions) {
      const transactionFingerprint = getTransactionFingerprint(
        statement.accountNumberMasked,
        transaction,
      );
      const enrichedTransaction = enrichTransaction(transaction);
      const existingWrite = transactionWrites.get(transactionFingerprint);

      if (existingWrite) {
        existingWrite.statementFileHashes.add(fileHash);
        existingWrite.sourceCount += 1;
        continue;
      }

      transactionWrites.set(transactionFingerprint, {
        data: {
          ...enrichedTransaction,
          transactionFingerprint,
          bankName: statement.bankName,
          accountNumberMasked: statement.accountNumberMasked,
          accountKey: `${statement.bankName}:${statement.accountNumberMasked}`,
          statementFileHash: fileHash,
          statementFileHashes: FieldValue.arrayUnion(fileHash),
          source: "bank_statement",
          reviewStatus: "pending_review",
          lastSeenAt: importedAt,
          updatedAt: importedAt,
        },
        statementFileHashes: new Set([fileHash]),
        sourceCount: 1,
      });
    }

    const transactionRefs = Array.from(transactionWrites.keys()).map(
      (fingerprint) => userRef.collection("financialTransactions").doc(fingerprint),
    );
    const existingTransactionSnapshots = (
      await Promise.all(
        chunk(transactionRefs, 300).map((refs) => db.getAll(...refs)),
      )
    ).flat();
    const existingTransactionCount = existingTransactionSnapshots.filter(
      (snapshot) => snapshot.exists,
    ).length;
    const newTransactionCount =
      transactionWrites.size - existingTransactionCount;

    for (const [transactionFingerprint, transactionWrite] of transactionWrites) {
      const transactionRef = userRef
        .collection("financialTransactions")
        .doc(transactionFingerprint);

      batchWriter.set(
        transactionRef,
        {
          ...transactionWrite.data,
          statementFileHashes: FieldValue.arrayUnion(
            ...Array.from(transactionWrite.statementFileHashes),
          ),
          sourceCount: FieldValue.increment(transactionWrite.sourceCount),
        },
        { merge: true },
      );
    }

    await batchWriter.commit();
    await incrementCollectionCounts(userRef, {
      statementFiles: 1,
      financialTransactions: newTransactionCount,
    });

    return Response.json({
      statementId: fileHash,
      transactionCount: statement.transactionCount,
    });
  } catch (error) {
    console.error("Statement import failed", error);
    return Response.json(getImportErrorResponse(error), {
      status: getImportErrorStatus(error),
    });
  }
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function getImportErrorResponse(error: unknown) {
  if (isFirestoreNotFoundError(error)) {
    return {
      error:
        "Firestore database was not found. Create Firestore Database in Firebase Console, or set FIRESTORE_DATABASE_ID if you are using a named database.",
      code: "firestore_not_found",
    };
  }

  return { error: "Could not import statement." };
}

function getImportErrorStatus(error: unknown) {
  return isFirestoreNotFoundError(error) ? 424 : 500;
}

function isFirestoreNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 5
  );
}
