import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { loadStatementTransactions } from "@/lib/serverStatements";
import type { ParsedStatement } from "@/lib/types";

export async function GET(
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
    const statementDoc = await userRef
      .collection("statementFiles")
      .doc(fileHash)
      .get();

    if (!statementDoc.exists) {
      return Response.json({ error: "Statement not found." }, { status: 404 });
    }

    const statementData = statementDoc.data() ?? {};
    const transactions = await loadStatementTransactions(userRef, fileHash, {
      statementFrom:
        typeof statementData.statementFrom === "string"
          ? statementData.statementFrom
          : null,
      statementTo:
        typeof statementData.statementTo === "string"
          ? statementData.statementTo
          : null,
    });

    const statement: ParsedStatement = {
      bankName: String(statementData.bankName ?? "Unknown bank"),
      accountNumberMasked: String(
        statementData.accountNumberMasked ?? "Unknown account",
      ),
      accountType:
        typeof statementData.accountType === "string"
          ? statementData.accountType
          : null,
      currency: String(statementData.currency ?? "INR"),
      statementFrom:
        typeof statementData.statementFrom === "string"
          ? statementData.statementFrom
          : null,
      statementTo:
        typeof statementData.statementTo === "string"
          ? statementData.statementTo
          : null,
      generatedAt: toIsoString(statementData.importedAt),
      transactionCount:
        typeof statementData.transactionCount === "number"
          ? statementData.transactionCount
          : transactions.length,
      openingBalance:
        typeof statementData.openingBalance === "number"
          ? statementData.openingBalance
          : null,
      closingBalance:
        typeof statementData.closingBalance === "number"
          ? statementData.closingBalance
          : null,
      totalWithdrawals:
        typeof statementData.totalWithdrawals === "number"
          ? statementData.totalWithdrawals
          : 0,
      totalDeposits:
        typeof statementData.totalDeposits === "number"
          ? statementData.totalDeposits
          : 0,
      transactions,
    };

    return Response.json({ statement });
  } catch (error) {
    console.error("Statement detail failed", error);
    return Response.json({ error: "Could not load statement." }, { status: 500 });
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
