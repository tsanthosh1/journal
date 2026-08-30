import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type WriteBatch,
} from "firebase-admin/firestore";

export function createBatchWriter(db: Firestore) {
  const batches: WriteBatch[] = [db.batch()];
  let currentBatch = batches[0];
  let currentBatchWrites = 0;

  function set(
    ref: DocumentReference,
    data: FirebaseFirestore.DocumentData,
    options?: FirebaseFirestore.SetOptions,
  ) {
    if (currentBatchWrites >= 450) {
      currentBatch = db.batch();
      batches.push(currentBatch);
      currentBatchWrites = 0;
    }

    if (options) {
      currentBatch.set(ref, data, options);
    } else {
      currentBatch.set(ref, data);
    }

    currentBatchWrites += 1;
  }

  return {
    set,
    async commit() {
      await Promise.all(batches.map((batch) => batch.commit()));
    },
  };
}

export function serverTimestamp() {
  return FieldValue.serverTimestamp();
}
