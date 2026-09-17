import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import {
  InstamartCategory,
  InstamartCategoryStat,
  InstamartMonthlySpend,
  InstamartOrder,
  InstamartSummary,
  InstamartTopItem,
} from "./types";

async function getOrdersCollection(userId: string) {
  const { db } = getFirebaseAdmin();
  const candidates = Array.from(
    new Set([
      userId,
      userId.replace(/[^a-zA-Z0-9_-]/g, "_"),
      "tsanthosh.online@gmail.com",
      "tsanthosh_online_gmail_com",
    ].filter(Boolean) as string[])
  );

  for (const cid of candidates) {
    const snap = await db
      .collection("users")
      .doc(cid)
      .collection("instamart_orders")
      .limit(1)
      .get();
    if (!snap.empty) {
      return db.collection("users").doc(cid).collection("instamart_orders");
    }
  }

  return db.collection("users").doc(candidates[0]).collection("instamart_orders");
}

/**
 * Saves or updates a single Instamart order
 */
export async function saveInstamartOrder(
  userId: string,
  order: InstamartOrder
): Promise<void> {
  const col = await getOrdersCollection(userId);
  await col.doc(order.id).set(order, { merge: true });
}

/**
 * Batch saves multiple Instamart orders efficiently in chunks of 450
 */
export async function batchSaveInstamartOrders(
  userId: string,
  orders: InstamartOrder[]
): Promise<number> {
  if (orders.length === 0) return 0;
  const { db } = getFirebaseAdmin();
  const col = await getOrdersCollection(userId);

  const CHUNK_SIZE = 450;
  let savedCount = 0;

  for (let i = 0; i < orders.length; i += CHUNK_SIZE) {
    const chunk = orders.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();

    for (const ord of chunk) {
      const docRef = col.doc(ord.id);
      batch.set(docRef, ord, { merge: true });
    }

    await batch.commit();
    savedCount += chunk.length;
  }

  return savedCount;
}

/**
 * Gets all processed message IDs or order IDs to avoid re-fetching
 */
export async function getExistingInstamartOrderIds(
  userId: string
): Promise<{ orderIds: Set<string>; messageIds: Set<string> }> {
  const col = await getOrdersCollection(userId);
  const snap = await col.select("orderId", "messageId").get();

  const orderIds = new Set<string>();
  const messageIds = new Set<string>();

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.orderId) orderIds.add(data.orderId);
    if (data.messageId) messageIds.add(data.messageId);
    orderIds.add(doc.id);
  }

  return { orderIds, messageIds };
}

export interface GetInstamartOrdersOptions {
  month?: string; // "YYYY-MM"
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Retrieves orders for a user with optional search and month filtering
 */
export async function getInstamartOrders(
  userId: string,
  options: GetInstamartOrdersOptions = {}
): Promise<{ orders: InstamartOrder[]; total: number }> {
  const col = await getOrdersCollection(userId);
  const snap = await col.get();

  let orders = snap.docs.map((d) => d.data() as InstamartOrder);

  // Filter by month
  if (options.month && options.month !== "ALL") {
    orders = orders.filter((o) => o.orderMonth === options.month);
  }

  // Filter by search query (order ID, item name, address)
  if (options.search && options.search.trim()) {
    const q = options.search.toLowerCase().trim();
    orders = orders.filter((o) => {
      const inId = o.orderId.toLowerCase().includes(q);
      const inAddr = o.deliveryAddress.toLowerCase().includes(q);
      const inItems = o.items.some((it) => it.name.toLowerCase().includes(q));
      return inId || inAddr || inItems;
    });
  }

  // Sort descending by orderDateTime
  orders.sort((a, b) => b.orderDateTime.localeCompare(a.orderDateTime));

  const total = orders.length;
  const offset = options.offset || 0;
  const limit = options.limit || 50;

  const paginated = orders.slice(offset, offset + limit);
  return { orders: paginated, total };
}

/**
 * Computes analytics and summary metrics across all user orders
 */
export async function getInstamartSummary(
  userId: string
): Promise<InstamartSummary> {
  const col = await getOrdersCollection(userId);
  const snap = await col.get();

  const orders = snap.docs.map((d) => d.data() as InstamartOrder);
  orders.sort((a, b) => a.orderDateTime.localeCompare(b.orderDateTime));

  if (orders.length === 0) {
    return {
      totalSpend: 0,
      totalOrders: 0,
      averageOrderValue: 0,
      averageMonthlySpend: 0,
      totalItemsCount: 0,
      firstOrderDate: null,
      latestOrderDate: null,
      feeTotals: {
        itemBill: 0,
        handlingFee: 0,
        deliveryFee: 0,
        discount: 0,
        tip: 0,
      },
      topItems: [],
      categoryBreakdown: [],
      monthlySpend: [],
      dayOfWeekBreakdown: [],
      timeSlotBreakdown: [],
    };
  }

  let totalSpend = 0;
  let totalItemsCount = 0;
  let totalItemBill = 0;
  let totalHandlingFee = 0;
  let totalDeliveryFee = 0;
  let totalDiscount = 0;
  let totalTip = 0;

  const itemsAggMap = new Map<
    string,
    {
      name: string;
      category: InstamartCategory;
      orderCount: number;
      totalQuantity: number;
      totalSpend: number;
    }
  >();

  const categoryMap = new Map<
    InstamartCategory,
    { count: number; totalQuantity: number; spend: number }
  >();

  const monthlyMap = new Map<string, InstamartMonthlySpend>();

  const dayOfWeekMap: Record<string, { count: number; spend: number }> = {
    Monday: { count: 0, spend: 0 },
    Tuesday: { count: 0, spend: 0 },
    Wednesday: { count: 0, spend: 0 },
    Thursday: { count: 0, spend: 0 },
    Friday: { count: 0, spend: 0 },
    Saturday: { count: 0, spend: 0 },
    Sunday: { count: 0, spend: 0 },
  };

  const timeSlotMap: Record<string, { count: number; spend: number }> = {
    "Morning (6 AM - 12 PM)": { count: 0, spend: 0 },
    "Afternoon (12 PM - 5 PM)": { count: 0, spend: 0 },
    "Evening (5 PM - 9 PM)": { count: 0, spend: 0 },
    "Late Night (9 PM - 6 AM)": { count: 0, spend: 0 },
  };

  const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  for (const ord of orders) {
    totalSpend += ord.grandTotal;
    totalItemsCount += ord.itemCount;
    totalItemBill += ord.itemBill || ord.grandTotal;
    totalHandlingFee += ord.handlingFee || 0;
    totalDeliveryFee += ord.deliveryFee || 0;
    totalDiscount += ord.discount || 0;
    totalTip += ord.tip || 0;

    // Day of week
    if (dayOfWeekMap[ord.dayOfWeek]) {
      dayOfWeekMap[ord.dayOfWeek].count++;
      dayOfWeekMap[ord.dayOfWeek].spend += ord.grandTotal;
    }

    // Time slot
    const hour = ord.hourOfDay;
    let slot = "Late Night (9 PM - 6 AM)";
    if (hour >= 6 && hour < 12) slot = "Morning (6 AM - 12 PM)";
    else if (hour >= 12 && hour < 17) slot = "Afternoon (12 PM - 5 PM)";
    else if (hour >= 17 && hour < 21) slot = "Evening (5 PM - 9 PM)";

    timeSlotMap[slot].count++;
    timeSlotMap[slot].spend += ord.grandTotal;

    // Monthly spend
    const m = ord.orderMonth;
    if (!monthlyMap.has(m)) {
      const [y, mon] = m.split("-");
      const displayMonth = `${MONTH_NAMES[parseInt(mon, 10) - 1]} ${y}`;
      monthlyMap.set(m, {
        month: m,
        displayMonth,
        spend: 0,
        orderCount: 0,
        itemCount: 0,
        handlingFee: 0,
        deliveryFee: 0,
      });
    }
    const mData = monthlyMap.get(m)!;
    mData.spend += ord.grandTotal;
    mData.orderCount++;
    mData.itemCount += ord.itemCount;
    mData.handlingFee += ord.handlingFee || 0;
    mData.deliveryFee += ord.deliveryFee || 0;

    // Items
    for (const it of ord.items) {
      // Top items key: normalized name
      const normName = it.name.trim();
      if (!itemsAggMap.has(normName)) {
        itemsAggMap.set(normName, {
          name: normName,
          category: it.category,
          orderCount: 0,
          totalQuantity: 0,
          totalSpend: 0,
        });
      }
      const itAgg = itemsAggMap.get(normName)!;
      itAgg.orderCount++;
      itAgg.totalQuantity += it.quantity;
      itAgg.totalSpend += it.price;

      // Category
      if (!categoryMap.has(it.category)) {
        categoryMap.set(it.category, { count: 0, totalQuantity: 0, spend: 0 });
      }
      const catAgg = categoryMap.get(it.category)!;
      catAgg.count++;
      catAgg.totalQuantity += it.quantity;
      catAgg.spend += it.price;
    }
  }

  // Top 20 items by orderCount, then spend
  const topItems: InstamartTopItem[] = Array.from(itemsAggMap.values())
    .map((it) => ({
      ...it,
      avgPrice:
        it.totalQuantity > 0
          ? Math.round((it.totalSpend / it.totalQuantity) * 100) / 100
          : 0,
    }))
    .sort((a, b) => b.orderCount - a.orderCount || b.totalSpend - a.totalSpend)
    .slice(0, 20);

  // Category breakdown
  const categoryBreakdown: InstamartCategoryStat[] = Array.from(
    categoryMap.entries()
  )
    .map(([cat, data]) => ({
      category: cat,
      count: data.count,
      totalQuantity: data.totalQuantity,
      spend: Math.round(data.spend * 100) / 100,
      percentage:
        totalSpend > 0
          ? Math.round((data.spend / totalSpend) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  // Monthly spend sorted chronologically
  const monthlySpend: InstamartMonthlySpend[] = Array.from(monthlyMap.values())
    .map((m) => ({
      ...m,
      spend: Math.round(m.spend * 100) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const dayOfWeekBreakdown = Object.entries(dayOfWeekMap).map(([day, val]) => ({
    day,
    count: val.count,
    spend: Math.round(val.spend * 100) / 100,
  }));

  const timeSlotBreakdown = Object.entries(timeSlotMap).map(([slot, val]) => ({
    slot,
    count: val.count,
    spend: Math.round(val.spend * 100) / 100,
  }));

  return {
    totalSpend: Math.round(totalSpend * 100) / 100,
    totalOrders: orders.length,
    averageOrderValue:
      orders.length > 0
        ? Math.round((totalSpend / orders.length) * 100) / 100
        : 0,
    averageMonthlySpend:
      monthlySpend.length > 0
        ? Math.round((totalSpend / monthlySpend.length) * 100) / 100
        : 0,
    totalItemsCount,
    firstOrderDate: orders[0]?.orderDate || null,
    latestOrderDate: orders[orders.length - 1]?.orderDate || null,
    feeTotals: {
      itemBill: Math.round(totalItemBill * 100) / 100,
      handlingFee: Math.round(totalHandlingFee * 100) / 100,
      deliveryFee: Math.round(totalDeliveryFee * 100) / 100,
      discount: Math.round(totalDiscount * 100) / 100,
      tip: Math.round(totalTip * 100) / 100,
    },
    topItems,
    categoryBreakdown,
    monthlySpend,
    dayOfWeekBreakdown,
    timeSlotBreakdown,
  };
}

/**
 * Deletes a single Instamart order
 */
export async function deleteInstamartOrder(
  userId: string,
  orderId: string
): Promise<void> {
  const col = await getOrdersCollection(userId);
  await col.doc(orderId).delete();
}
