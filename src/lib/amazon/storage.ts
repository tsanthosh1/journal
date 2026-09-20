import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import {
  AmazonImportResult,
  AmazonOrder,
  AmazonOrderFilter,
  AmazonSummary,
  MonthlyAmazonSpend,
  PaymentAmazonSpend,
  RecipientAmazonSpend,
} from "./types";

export function getAmazonOrdersCollection(userId: string) {
  const { db } = getFirebaseAdmin();
  const normalizedUserId = userId || "default_user";
  return db.collection("users").doc(normalizedUserId).collection("amazonOrders");
}

/**
 * Checks if an order object is an invalid formula or summary row.
 */
export function isInvalidAmazonOrder(o: AmazonOrder): boolean {
  if (!o || !o.orderId) return true;
  const id = o.orderId.trim();
  if (
    id.startsWith("=") ||
    id.startsWith("+") ||
    /^(subtotal|total|grand\s*total|count|sum|average)\b/i.test(id)
  ) {
    return true;
  }
  // Missing or non-date orderDate
  if (!o.orderDate || !/^\d{4}-\d{2}-\d{2}/.test(o.orderDate)) {
    return true;
  }
  // Missing items
  if (!o.items || o.items.length === 0 || !o.items[0]) {
    return true;
  }
  return false;
}

export interface StoreAmazonOrdersOptions {
  duplicatesInSource?: number;
  duplicateOrderIds?: string[];
  truncateBeforeStore?: boolean;
}

/**
 * Stores parsed Amazon orders in Firestore under users/{userId}/amazonOrders/{orderId}.
 * Idempotent batch upserting (merge: true) with duplicate tracking.
 */
export async function storeAmazonOrders(
  userId: string,
  rawOrders: AmazonOrder[],
  options: StoreAmazonOrdersOptions = {},
): Promise<AmazonImportResult> {
  const orders = rawOrders.filter((o) => !isInvalidAmazonOrder(o));
  if (orders.length === 0 && !options.truncateBeforeStore) {
    return {
      totalRows: rawOrders.length,
      duplicatesInSource: options.duplicatesInSource || 0,
      duplicateOrderIds: options.duplicateOrderIds || [],
      importedOrders: 0,
      updatedOrders: 0,
      duplicatesExisting: 0,
      kindleOrdersCount: 0,
      primeOrdersCount: 0,
      totalSpend: 0,
      message: "No valid orders found to import.",
      truncatedFirst: false,
    };
  }

  const { db } = getFirebaseAdmin();
  const col = getAmazonOrdersCollection(userId);

  // If truncate option was requested, clear collection first
  let truncatedFirst = false;
  if (options.truncateBeforeStore) {
    await clearAllAmazonOrders(userId);
    truncatedFirst = true;
  }

  // Fetch existing order IDs to accurately detect duplicates / existing records
  const existingSnap = await col.select("orderId").get();
  const existingIds = new Set(existingSnap.docs.map((d) => d.id));

  let importedOrders = 0;
  let updatedOrders = 0;
  let duplicatesExisting = 0;
  let kindleOrdersCount = 0;
  let primeOrdersCount = 0;
  let totalSpend = 0;

  const CHUNK_SIZE = 450;
  for (let i = 0; i < orders.length; i += CHUNK_SIZE) {
    const chunk = orders.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();

    for (const order of chunk) {
      if (existingIds.has(order.orderId)) {
        updatedOrders++;
        duplicatesExisting++;
      } else {
        importedOrders++;
        existingIds.add(order.orderId);
      }

      if (order.isKindleUnlimited) {
        kindleOrdersCount++;
      }
      if (order.isAmazonPrime) {
        primeOrdersCount++;
      }
      totalSpend += order.totalAmount;

      const docRef = col.doc(order.orderId);
      batch.set(docRef, order, { merge: true });
    }

    await batch.commit();
  }

  const sourceDuplicates = options.duplicatesInSource || 0;
  let statusMessage = `Processed ${orders.length} orders (${importedOrders} new, ${updatedOrders} updated).`;
  if (sourceDuplicates > 0) {
    statusMessage += ` Detected and de-duplicated ${sourceDuplicates} duplicate records in source payload.`;
  }
  if (truncatedFirst) {
    statusMessage += " Existing collection was truncated before import.";
  }

  return {
    totalRows: rawOrders.length,
    duplicatesInSource: sourceDuplicates,
    duplicateOrderIds: options.duplicateOrderIds || [],
    importedOrders,
    updatedOrders,
    duplicatesExisting,
    kindleOrdersCount,
    primeOrdersCount,
    totalSpend: Math.round(totalSpend * 100) / 100,
    message: statusMessage,
    truncatedFirst,
  };
}

export const upsertAmazonOrders = storeAmazonOrders;

/**
 * Queries orders with optional filters, pagination, and sorting by date descending.
 */
export async function getAmazonOrders(
  userId: string,
  filter: AmazonOrderFilter = {},
): Promise<{ orders: AmazonOrder[]; total: number }> {
  const col = getAmazonOrdersCollection(userId);
  const snap = await col.orderBy("orderDate", "desc").get();

  const invalidDocRefs: FirebaseFirestore.DocumentReference[] = [];
  let allOrders: AmazonOrder[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as AmazonOrder;
    if (isInvalidAmazonOrder(data)) {
      invalidDocRefs.push(doc.ref);
    } else {
      allOrders.push(data);
    }
  }

  // Auto-clean any legacy corrupted formula docs in the background
  if (invalidDocRefs.length > 0) {
    Promise.all(invalidDocRefs.map((ref) => ref.delete())).catch((err) => {
      console.warn("Auto-clean invalid Amazon orders error:", err);
    });
  }

  // Apply in-memory filters for flexibility
  if (filter.month) {
    allOrders = allOrders.filter((o) => o.month === filter.month);
  }

  if (filter.recipient) {
    const targetRec = filter.recipient.toLowerCase();
    allOrders = allOrders.filter((o) => {
      const rec = (!o.recipient || o.recipient.toLowerCase() === "you") ? "Amazon Pay / Bill Payments" : o.recipient;
      return rec.toLowerCase() === targetRec;
    });
  }

  if (filter.type) {
    if (filter.type === "KINDLE") {
      allOrders = allOrders.filter((o) => o.isKindleUnlimited);
    } else if (filter.type === "PHYSICAL") {
      allOrders = allOrders.filter((o) => !o.isKindleUnlimited);
    } else if (filter.type === "REFUNDED") {
      allOrders = allOrders.filter((o) => (o.refundAmount || 0) > 0);
    } else if (filter.type === "CANCELLED") {
      allOrders = allOrders.filter((o) =>
        Boolean(o.orderStatus && /cancel|returned/i.test(o.orderStatus)),
      );
    }
  }

  if (filter.search && filter.search.trim()) {
    const q = filter.search.toLowerCase().trim();
    allOrders = allOrders.filter((o) => {
      const matchId = o.orderId.toLowerCase().includes(q);
      const matchItems = o.items.some((it) => it.toLowerCase().includes(q));
      const matchRecipient = o.recipient.toLowerCase().includes(q);
      const matchPayment = (o.paymentMethod || "").toLowerCase().includes(q);
      const matchStatus = (o.orderStatus || "").toLowerCase().includes(q);
      const matchAsin = (o.orderItems || []).some((item) => (item.asin || "").toLowerCase().includes(q));
      return matchId || matchItems || matchRecipient || matchPayment || matchStatus || matchAsin;
    });
  }

  const total = allOrders.length;
  const offset = filter.offset || 0;
  const limit = filter.limit || 50;
  const paginated = allOrders.slice(offset, offset + limit);

  return { orders: paginated, total };
}

/**
 * Computes high-level statistics and insights across all user Amazon orders.
 */
export async function getAmazonSummary(userId: string): Promise<AmazonSummary> {
  const col = getAmazonOrdersCollection(userId);
  const snap = await col.get();

  const invalidDocRefs: FirebaseFirestore.DocumentReference[] = [];
  const orders: AmazonOrder[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as AmazonOrder;
    if (isInvalidAmazonOrder(data)) {
      invalidDocRefs.push(doc.ref);
    } else {
      orders.push(data);
    }
  }

  // Auto-clean any legacy corrupted formula docs in the background
  if (invalidDocRefs.length > 0) {
    Promise.all(invalidDocRefs.map((ref) => ref.delete())).catch((err) => {
      console.warn("Auto-clean invalid Amazon summary docs error:", err);
    });
  }

  let totalSpend = 0;
  let totalItems = 0;
  let totalRefunded = 0;
  let refundedOrdersCount = 0;
  let kindleOrdersCount = 0;
  let kindleTotalSpend = 0;
  let primeOrdersCount = 0;
  let totalSavings = 0;

  let minDate: string | null = null;
  let maxDate: string | null = null;

  const monthlyMap = new Map<string, { spend: number; count: number }>();
  const recipientMap = new Map<string, { spend: number; count: number }>();
  const paymentMap = new Map<string, { spend: number; count: number }>();

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  for (const o of orders) {
    const netOrderSpend = o.totalAmount;
    totalSpend += netOrderSpend;
    totalItems += (o.orderItems && o.orderItems.length > 0) ? o.orderItems.length : (o.items.length || 1);

    if ((o.refundAmount || 0) > 0) {
      totalRefunded += o.refundAmount || 0;
      refundedOrdersCount++;
    }

    if (o.isKindleUnlimited) {
      kindleOrdersCount++;
      kindleTotalSpend += o.totalAmount;
    }

    if (o.isAmazonPrime) {
      primeOrdersCount++;
    }

    if ((o.totalSavings || 0) > 0) {
      totalSavings += o.totalSavings || 0;
    }

    if (o.orderDate) {
      if (!minDate || o.orderDate < minDate) minDate = o.orderDate;
      if (!maxDate || o.orderDate > maxDate) maxDate = o.orderDate;
    }

    // Monthly bucket
    const m = o.month || "Unknown";
    const mData = monthlyMap.get(m) || { spend: 0, count: 0 };
    mData.spend += netOrderSpend;
    mData.count += 1;
    monthlyMap.set(m, mData);

    // Recipient bucket
    const rec =
      !o.recipient || o.recipient.toLowerCase() === "you"
        ? "Amazon Pay / Bill Payments"
        : o.recipient;
    const rData = recipientMap.get(rec) || { spend: 0, count: 0 };
    rData.spend += netOrderSpend;
    rData.count += 1;
    recipientMap.set(rec, rData);

    // Payment bucket
    const pay = o.paymentMethod || "Other";
    const pData = paymentMap.get(pay) || { spend: 0, count: 0 };
    pData.spend += netOrderSpend;
    pData.count += 1;
    paymentMap.set(pay, pData);
  }

  // Format monthly stats chronologically
  const monthlyStats: MonthlyAmazonSpend[] = Array.from(monthlyMap.entries())
    .sort(([mA], [mB]) => mA.localeCompare(mB))
    .map(([month, data]) => {
      let formattedMonth = month;
      const parts = month.split("-");
      if (parts.length === 2) {
        const mIdx = parseInt(parts[1], 10) - 1;
        if (mIdx >= 0 && mIdx < 12) {
          formattedMonth = `${monthNames[mIdx]} ${parts[0]}`;
        }
      }
      return {
        month,
        formattedMonth,
        spend: Math.round(data.spend * 100) / 100,
        ordersCount: data.count,
      };
    });

  // Recipient stats sorted by spend desc
  const recipientStats: RecipientAmazonSpend[] = Array.from(recipientMap.entries())
    .map(([recipient, data]) => ({
      recipient,
      spend: Math.round(data.spend * 100) / 100,
      ordersCount: data.count,
    }))
    .sort((a, b) => b.spend - a.spend);

  // Payment stats sorted by spend desc
  const paymentStats: PaymentAmazonSpend[] = Array.from(paymentMap.entries())
    .map(([method, data]) => ({
      method,
      spend: Math.round(data.spend * 100) / 100,
      ordersCount: data.count,
    }))
    .sort((a, b) => b.spend - a.spend);

  const totalOrders = orders.length;
  const averageOrderValue =
    totalOrders > 0 ? Math.round((totalSpend / totalOrders) * 100) / 100 : 0;

  return {
    totalSpend: Math.round(totalSpend * 100) / 100,
    totalOrders,
    totalItems,
    averageOrderValue,
    totalRefunded: Math.round(totalRefunded * 100) / 100,
    refundedOrdersCount,
    kindleOrdersCount,
    kindleTotalSpend: Math.round(kindleTotalSpend * 100) / 100,
    primeOrdersCount,
    totalSavings: Math.round(totalSavings * 100) / 100,
    dateRange: { start: minDate, end: maxDate },
    monthlyStats,
    recipientStats,
    paymentStats,
  };
}

/**
 * Deletes an Amazon order by ID.
 */
export async function deleteAmazonOrder(userId: string, orderId: string): Promise<boolean> {
  const col = getAmazonOrdersCollection(userId);
  await col.doc(orderId).delete();
  return true;
}

/**
 * Clears all Amazon orders for a user.
 */
export async function clearAllAmazonOrders(userId: string): Promise<number> {
  const { db } = getFirebaseAdmin();
  const col = getAmazonOrdersCollection(userId);
  const snap = await col.select().get();

  const CHUNK_SIZE = 450;
  let deleted = 0;

  for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
    const chunk = snap.docs.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();
    for (const doc of chunk) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    deleted += chunk.length;
  }

  return deleted;
}
