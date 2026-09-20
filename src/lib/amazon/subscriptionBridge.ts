import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { Subscription, CycleState, HistoricalCycle } from "@/lib/subscriptionTypes";
import { areUserIdsEquivalent, sanitizeForFirestore } from "@/lib/subscriptionUtils";
import { getAmazonOrdersCollection } from "./storage";
import { AmazonOrder } from "./types";

/**
 * Creates or synchronizes the Amazon Kindle Unlimited subscription in the subscriptions collection.
 */
export async function syncKindleUnlimitedSubscription(
  userId: string,
  providedOrders?: AmazonOrder[],
): Promise<{ subscription: Subscription; syncedCyclesCount: number }> {
  const { db } = getFirebaseAdmin();
  const normalizedUserId = userId || "default_user";

  // 1. Fetch Kindle Unlimited orders if not provided
  let kindleOrders = providedOrders;
  if (!kindleOrders) {
    const ordersSnap = await getAmazonOrdersCollection(userId)
      .where("isKindleUnlimited", "==", true)
      .get();
    kindleOrders = ordersSnap.docs.map((d) => d.data() as AmazonOrder);
  }

  kindleOrders.sort((a, b) => a.orderDate.localeCompare(b.orderDate));

  // 2. Find existing subscription
  const subSnap = await db
    .collection("subscriptions")
    .where("source", "==", "AMAZON_MODULE")
    .get();

  let existingSubDoc = subSnap.docs.find((doc) => {
    const data = doc.data() as Subscription;
    return (
      areUserIdsEquivalent(data.userId, normalizedUserId) &&
      data.amazonConfig?.orderType === "KINDLE_UNLIMITED"
    );
  });

  const subId =
    existingSubDoc?.id ||
    `amazon-kindle-${normalizedUserId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const subRef = db.collection("subscriptions").doc(subId);

  const now = new Date().toISOString();
  const latestOrder = kindleOrders[kindleOrders.length - 1];

  // 3. Sync historical cycles
  const cyclesCol = subRef.collection("cycles");
  let syncedCyclesCount = 0;

  for (const order of kindleOrders) {
    const cycleMonth = order.month;
    const cycleDocRef = cyclesCol.doc(cycleMonth);

    const cycleData: HistoricalCycle = {
      id: cycleMonth,
      subscriptionId: subId,
      subscriptionName: "Amazon Kindle Unlimited",
      currency: "INR",
      cycleMonth,
      statementTotal: order.totalAmount,
      paidAmount: order.totalAmount,
      remainingBalance: 0,
      status: "FULLY_PAID",
      dueDate: order.orderDate,
      lastPaymentDate: order.orderDate,
      processedMessageIds: [order.orderId],
      createdAt: now,
      updatedAt: now,
    };

    await cycleDocRef.set(sanitizeForFirestore(cycleData), { merge: true });
    syncedCyclesCount++;
  }

  // 4. Calculate current / upcoming cycle state
  let currentCycle: CycleState;
  const standardMonthlyPrice = 169.0;
  const billingDay = 17;

  if (latestOrder) {
    // Next billing date calculation (17th of the following month)
    const latestDate = new Date(latestOrder.orderDate);
    const nextMonthDate = new Date(
      latestDate.getFullYear(),
      latestDate.getMonth() + 1,
      billingDay,
    );
    const nextDueDateIso = nextMonthDate.toISOString().split("T")[0];

    currentCycle = {
      cycleMonth: latestOrder.month,
      statementTotal: latestOrder.totalAmount,
      paidAmount: latestOrder.totalAmount,
      remainingBalance: 0,
      status: "FULLY_PAID",
      dueDate: latestOrder.orderDate,
      nextRenewalDate: nextDueDateIso,
      lastPaymentDate: latestOrder.orderDate,
      processedMessageIds: [latestOrder.orderId],
      updatedAt: now,
    };
  } else {
    currentCycle = {
      cycleMonth: now.slice(0, 7),
      statementTotal: standardMonthlyPrice,
      paidAmount: 0,
      remainingBalance: standardMonthlyPrice,
      status: "UNPAID",
      dueDate: `${now.slice(0, 7)}-${billingDay}`,
      processedMessageIds: [],
      updatedAt: now,
    };
  }

  const subscriptionData: Subscription = {
    id: subId,
    userId: normalizedUserId,
    name: "Amazon Kindle Unlimited",
    category: "Entertainment",
    billingType: "FIXED_TENURE",
    billingCycle: "MONTHLY",
    defaultAmount: standardMonthlyPrice,
    currency: "INR",
    dueDayOfMonth: billingDay,
    isPrepaid: true,
    source: "AMAZON_MODULE",
    notes: "Auto-synced from Amazon Order History CSV",
    imageUrl: "https://m.media-amazon.com/images/G/31/kindle/journeys/kindle_unlimited_logo.png",
    icon: "BookOpen",
    color: "#FF9900",
    amazonConfig: {
      orderType: "KINDLE_UNLIMITED",
      autoSyncOrders: true,
    },
    currentCycle,
    createdAt: existingSubDoc ? (existingSubDoc.data() as Subscription).createdAt : now,
    updatedAt: now,
  };

  await subRef.set(sanitizeForFirestore(subscriptionData), { merge: true });

  return {
    subscription: subscriptionData,
    syncedCyclesCount,
  };
}

/**
 * Checks whether Kindle Unlimited is currently linked to the user's subscriptions.
 */
export async function getKindleSubscriptionStatus(userId: string): Promise<{
  isLinked: boolean;
  subscription?: Subscription;
  syncedOrdersCount?: number;
}> {
  const { db } = getFirebaseAdmin();
  const normalizedUserId = userId || "default_user";

  const subSnap = await db
    .collection("subscriptions")
    .where("source", "==", "AMAZON_MODULE")
    .get();

  const existingSubDoc = subSnap.docs.find((doc) => {
    const data = doc.data() as Subscription;
    return (
      areUserIdsEquivalent(data.userId, normalizedUserId) &&
      data.amazonConfig?.orderType === "KINDLE_UNLIMITED"
    );
  });

  if (!existingSubDoc) {
    return { isLinked: false };
  }

  const sub = existingSubDoc.data() as Subscription;
  const cyclesSnap = await existingSubDoc.ref.collection("cycles").get();

  return {
    isLinked: true,
    subscription: sub,
    syncedOrdersCount: cyclesSnap.size,
  };
}
