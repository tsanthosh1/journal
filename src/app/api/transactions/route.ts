import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { toStatementTransaction, getTransactionIndex } from "@/lib/serverStatements";
import type { ParsedStatement, StatementTransaction } from "@/lib/types";
import { getNextCategoryColor } from "@/lib/categoryRules";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 250;

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];

  if (!token) {
    return Response.json({ error: "Missing Firebase ID token." }, { status: 401 });
  }

  const url = new URL(request.url);
  const accountKey = url.searchParams.get("accountKey") ?? "";

  try {
    const { auth, db } = getFirebaseAdmin();
    const decodedToken = await auth.verifyIdToken(token);
    const page = Math.max(Number(url.searchParams.get("page") ?? "1"), 1);
    const pageSize = Math.min(
      Math.max(Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE), 1),
      MAX_PAGE_SIZE,
    );
    const userRef = db.collection("users").doc(decodedToken.uid);
    const snapshot = await getTransactionSnapshot(userRef, accountKey, url);
    let allTransactions: StatementTransaction[] = snapshot.docs.map((doc) =>
      toStatementTransaction({ ...doc.data(), transactionFingerprint: doc.id }),
    );

    if (!allTransactions.length) {
      allTransactions = await getLegacyAccountTransactions(userRef, accountKey);
    }

    allTransactions = allTransactions
      .filter((transaction) => matchesServerFilters(transaction, url))
      .sort(compareTransactions);
    const totalCount = allTransactions.length;
    const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
    const normalizedPage = Math.min(page, totalPages);
    const start = (normalizedPage - 1) * pageSize;
    const transactions = allTransactions.slice(start, start + pageSize);
    const statement = buildVirtualStatement(accountKey, transactions, totalCount);

    return Response.json({
      statement,
      page: normalizedPage,
      pageSize,
      totalCount,
      totalPages,
      hasNextPage: normalizedPage < totalPages,
      hasPreviousPage: normalizedPage > 1,
    });
  } catch (error) {
    console.error("Transaction query failed", error);
    return Response.json(
      { error: "Could not load transactions." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
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

  if (
    typeof body !== "object" ||
    body === null ||
    !("transactionFingerprint" in body) ||
    !("category" in body) ||
    typeof (body as any).transactionFingerprint !== "string" ||
    typeof (body as any).category !== "string"
  ) {
    return Response.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { transactionFingerprint, category } = body as {
    transactionFingerprint: string;
    category: string;
  };

  try {
    const { auth, db } = getFirebaseAdmin();
    const decodedToken = await auth.verifyIdToken(token);
    const userRef = db.collection("users").doc(decodedToken.uid);
    const transactionRef = userRef
      .collection("financialTransactions")
      .doc(transactionFingerprint);

    const doc = await transactionRef.get();
    if (!doc.exists) {
      return Response.json({ error: "Transaction not found." }, { status: 404 });
    }

    const rulesCollection = userRef.collection("categoryRules");
    const existingRulesSnapshot = await rulesCollection.where("category", "==", category).limit(1).get();
    if (existingRulesSnapshot.empty && category !== "Uncategorized") {
      const allRulesSnapshot = await rulesCollection.get();
      const count = allRulesSnapshot.size;
      const color = getNextCategoryColor(count);
      const ruleId = `rule-${Date.now()}`;
      await rulesCollection.doc(ruleId).set({
        id: ruleId,
        category: category,
        keywords: [],
        direction: "any",
        priority: count + 1,
        enabled: true,
        color: color,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await transactionRef.update({
      categoryHint: category,
      isCategoryManual: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update transaction category", error);
    return Response.json(
      { error: "Could not update transaction category." },
      { status: 500 },
    );
  }
}

async function getTransactionSnapshot(
  userRef: FirebaseFirestore.DocumentReference,
  accountKey: string,
  url: URL,
) {
  let query: FirebaseFirestore.Query = userRef.collection("financialTransactions");

  if (accountKey) {
    const keys = accountKey
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    if (keys.length === 1) {
      query = query.where("accountKey", "==", keys[0]);
    } else if (keys.length > 1) {
      query = query.where("accountKey", "in", keys);
    }
  }

  query = applyExactFilters(query, url);

  return query.get();
}

async function getLegacyAccountTransactions(
  userRef: FirebaseFirestore.DocumentReference,
  accountKey: string,
) {
  const transactions = new Map<string, StatementTransaction>();
  const accountsToLoad = accountKey
    ? accountKey.split(",").map((k) => k.trim()).filter(Boolean)
    : [];

  if (accountsToLoad.length === 0) {
    const statementsSnapshot = await userRef.collection("statementFiles").get();
    const accountKeysSet = new Set<string>();
    for (const doc of statementsSnapshot.docs) {
      const data = doc.data();
      if (data.bankName && data.accountNumberMasked) {
        accountKeysSet.add(`${data.bankName}:${data.accountNumberMasked}`);
      }
    }
    accountsToLoad.push(...Array.from(accountKeysSet));
  }

  for (const key of accountsToLoad) {
    const [bankName, accountNumberMasked] = key.split(":");
    if (!bankName || !accountNumberMasked) continue;

    const statementsSnapshot = await userRef
      .collection("statementFiles")
      .where("bankName", "==", bankName)
      .where("accountNumberMasked", "==", accountNumberMasked)
      .get();

    for (const statementDoc of statementsSnapshot.docs) {
      const transactionSnapshot = await userRef
        .collection("financialTransactions")
        .where("statementFileHashes", "array-contains", statementDoc.id)
        .get();

      for (const transactionDoc of transactionSnapshot.docs) {
        const transaction = toStatementTransaction({
          ...transactionDoc.data(),
          transactionFingerprint: transactionDoc.id,
        });

        transactions.set(transaction.transactionFingerprint ?? transaction.id, transaction);
      }
    }
  }

  return Array.from(transactions.values()).sort(compareTransactions);
}

function hasFilters(url: URL) {
  return [
    "year",
    "month",
    "category",
    "direction",
    "query",
    "fromDate",
    "toDate",
    "minAmount",
    "maxAmount",
  ].some((key) => Boolean(url.searchParams.get(key)));
}

function applyExactFilters(query: FirebaseFirestore.Query, url: URL) {
  const category = url.searchParams.get("category");
  const direction = url.searchParams.get("direction");
  const searchToken = url.searchParams.get("query")?.toLowerCase().trim();

  if (category) {
    query = query.where("categoryHint", "==", category);
  }

  if (direction === "withdrawal" || direction === "deposit") {
    query = query.where("direction", "==", direction);
  }

  if (searchToken) {
    query = query.where("searchTokens", "array-contains", searchToken);
  }

  return query;
}

function matchesServerFilters(transaction: StatementTransaction, url: URL) {
  const fromDate = url.searchParams.get("fromDate");
  const toDate = url.searchParams.get("toDate");
  const minAmount = Number(url.searchParams.get("minAmount") || "NaN");
  const maxAmount = Number(url.searchParams.get("maxAmount") || "NaN");
  const yearStr = url.searchParams.get("year");
  const monthStr = url.searchParams.get("month");

  if (yearStr) {
    const year = Number(yearStr);
    if (transaction.year !== year) {
      return false;
    }
  }

  if (monthStr) {
    const month = Number(monthStr);
    if (transaction.month !== month) {
      return false;
    }
  }

  const transactionTime = getTransactionSortTime(transaction);

  if (fromDate && transactionTime < new Date(`${fromDate}T00:00:00.000Z`).getTime()) {
    return false;
  }

  if (toDate && transactionTime > new Date(`${toDate}T23:59:59.999Z`).getTime()) {
    return false;
  }

  if (Number.isFinite(minAmount) && transaction.amount < minAmount) {
    return false;
  }

  if (Number.isFinite(maxAmount) && transaction.amount > maxAmount) {
    return false;
  }

  return true;
}

function buildVirtualStatement(
  accountKey: string,
  transactions: StatementTransaction[],
  totalCount: number,
) {
  let bankName = "All Accounts";
  let accountNumberMasked = "Consolidated view";

  if (accountKey && !accountKey.includes(",")) {
    const [b, a] = accountKey.split(":");
    bankName = b || "Unknown bank";
    accountNumberMasked = a || "Unknown account";
  } else if (accountKey && accountKey.includes(",")) {
    const count = accountKey.split(",").filter(Boolean).length;
    bankName = `${count} Accounts`;
    accountNumberMasked = "Selected view";
  }

  return {
    bankName,
    accountNumberMasked,
    accountType: null,
    currency: "INR",
    statementFrom: null,
    statementTo: null,
    generatedAt: new Date().toISOString(),
    transactionCount: totalCount,
    openingBalance: null,
    closingBalance: transactions[0]?.closingBalance ?? null,
    totalWithdrawals: roundMoney(
      transactions.reduce(
        (sum, transaction) => sum + (transaction.withdrawalAmount ?? 0),
        0,
      ),
    ),
    totalDeposits: roundMoney(
      transactions.reduce(
        (sum, transaction) => sum + (transaction.depositAmount ?? 0),
        0,
      ),
    ),
    transactions,
  } satisfies ParsedStatement;
}

function getTransactionSortTime(transaction: StatementTransaction) {
  if (transaction.transactionDateIso) {
    return new Date(transaction.transactionDateIso).getTime();
  }

  const match = transaction.date.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);

  if (!match) {
    return 0;
  }

  const [, day, month, year] = match;
  const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);

  return Date.UTC(fullYear, Number(month) - 1, Number(day));
}

function compareTransactions(left: StatementTransaction, right: StatementTransaction) {
  const leftTime = getTransactionSortTime(left);
  const rightTime = getTransactionSortTime(right);

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return getTransactionIndex(right.id) - getTransactionIndex(left.id);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
