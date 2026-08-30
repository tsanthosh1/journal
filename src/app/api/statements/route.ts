import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { setCollectionCounts } from "@/lib/serverStats";
import type { ProcessedStatementRecord } from "@/lib/types";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];

  if (!token) {
    return Response.json({ error: "Missing Firebase ID token." }, { status: 401 });
  }

  try {
    const { auth, db } = getFirebaseAdmin();
    const decodedToken = await auth.verifyIdToken(token);
    const snapshot = await db
      .collection("users")
      .doc(decodedToken.uid)
      .collection("statementFiles")
      .orderBy("importedAt", "desc")
      .limit(50)
      .get();

    const statements: ProcessedStatementRecord[] = snapshot.docs
      .map((doc) => {
        const data = doc.data();

        return {
          fileHash: String(data.fileHash ?? doc.id),
          fileName: String(data.fileName ?? "Unknown file"),
          bankName: String(data.bankName ?? "Unknown bank"),
          accountNumberMasked: String(data.accountNumberMasked ?? "Unknown account"),
          statementFrom:
            typeof data.statementFrom === "string" ? data.statementFrom : null,
          statementTo: typeof data.statementTo === "string" ? data.statementTo : null,
          transactionCount:
            typeof data.transactionCount === "number" ? data.transactionCount : 0,
          processedAt: toIsoString(data.processedAt ?? data.importedAt),
        };
      })
      .sort((left, right) => {
        const leftTime = getStatementTime(left.statementTo);
        const rightTime = getStatementTime(right.statementTo);
        return rightTime - leftTime;
      });

    return Response.json({ statements });
  } catch (error) {
    console.error("Statement list failed", error);
    return Response.json({ error: "Could not load statements." }, { status: 500 });
  }
}

function getStatementTime(dateStr: string | null) {
  if (!dateStr) {
    return 0;
  }
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!match) {
    return 0;
  }
  const [, day, month, year] = match;
  const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
  return Date.UTC(fullYear, Number(month) - 1, Number(day));
}

export async function DELETE(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];

  if (!token) {
    return Response.json({ error: "Missing Firebase ID token." }, { status: 401 });
  }

  try {
    const { auth, db } = getFirebaseAdmin();
    const decodedToken = await auth.verifyIdToken(token);
    const userRef = db.collection("users").doc(decodedToken.uid);
    const [statementDocs, transactionDocs] = await Promise.all([
      userRef.collection("statementFiles").listDocuments(),
      userRef.collection("financialTransactions").listDocuments(),
    ]);

    await Promise.all([
      ...statementDocs.map((doc) => db.recursiveDelete(doc)),
      ...transactionDocs.map((doc) => db.recursiveDelete(doc)),
    ]);
    await setCollectionCounts(userRef, {
      statementFiles: 0,
      financialTransactions: 0,
    });

    return Response.json({
      deletedStatementCount: statementDocs.length,
      deletedTransactionRootCount: transactionDocs.length,
    });
  } catch (error) {
    console.error("Statement truncate failed", error);
    return Response.json(
      { error: "Could not clear imported statements." },
      { status: 500 },
    );
  }
}

function toIsoString(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return new Date(0).toISOString();
}
