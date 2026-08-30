import { FieldValue, type DocumentReference } from "firebase-admin/firestore";

type CollectionCountDeltas = {
  statementFiles?: number;
  financialTransactions?: number;
  categoryRules?: number;
};

type CollectionCounts = {
  statementFiles?: number;
  financialTransactions?: number;
  categoryRules?: number;
};

export function incrementCollectionCounts(
  userRef: DocumentReference,
  deltas: CollectionCountDeltas,
) {
  const data = Object.fromEntries(
    Object.entries(deltas)
      .filter(([, value]) => typeof value === "number" && value !== 0)
      .map(([key, value]) => [key, FieldValue.increment(value)]),
  );

  if (!Object.keys(data).length) {
    return Promise.resolve();
  }

  return userRef.collection("stats").doc("collectionCounts").set(
    {
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export function setCollectionCounts(
  userRef: DocumentReference,
  counts: CollectionCounts,
) {
  return userRef.collection("stats").doc("collectionCounts").set(
    {
      ...counts,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
