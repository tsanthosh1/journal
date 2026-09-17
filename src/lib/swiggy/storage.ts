import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import {
  SwiggyCuisine,
  SwiggyMonthlySpend,
  SwiggyOrder,
  SwiggyRestaurantStat,
  SwiggySummary,
  SwiggyTopDish,
} from "./types";
import { categorizeSwiggyItem } from "./parser";

/**
 * Returns candidate user ID variations (e.g. tsanthosh.online@gmail.com and tsanthosh_online_gmail_com)
 */
function getCandidateUserIds(userId: string): string[] {
  const ids = new Set<string>();
  ids.add(userId);
  if (userId.includes("@")) {
    ids.add(userId.replace(/[@.]/g, "_"));
  } else if (userId.includes("_")) {
    ids.add(userId.replace(/_/g, "."));
  }
  return Array.from(ids);
}

/**
 * Resolves the active Firestore collection for a user
 */
async function getOrdersCollection(userId: string) {
  const { db } = getFirebaseAdmin();
  const candidates = getCandidateUserIds(userId);

  // Pick the candidate collection that already has documents
  for (const candidate of candidates) {
    const snap = await db
      .collection("users")
      .doc(candidate)
      .collection("swiggy_orders")
      .limit(1)
      .get();
    if (!snap.empty) {
      return db
        .collection("users")
        .doc(candidate)
        .collection("swiggy_orders");
    }
  }

  // Default to first candidate
  return db
    .collection("users")
    .doc(candidates[0])
    .collection("swiggy_orders");
}

/**
 * Fetches all existing order IDs and message IDs to prevent re-processing
 */
export async function getExistingSwiggyOrderIds(
  userId: string
): Promise<{ orderIds: Set<string>; messageIds: Set<string> }> {
  const col = await getOrdersCollection(userId);
  const snap = await col.select("orderId", "messageId").get();

  const orderIds = new Set<string>();
  const messageIds = new Set<string>();

  snap.forEach((doc) => {
    const data = doc.data();
    if (data.orderId) orderIds.add(data.orderId);
    if (data.messageId) messageIds.add(data.messageId);
    orderIds.add(doc.id);
  });

  return { orderIds, messageIds };
}

/**
 * Batch saves orders to Firestore
 */
export async function batchSaveSwiggyOrders(
  userId: string,
  orders: SwiggyOrder[]
): Promise<number> {
  if (orders.length === 0) return 0;
  const col = await getOrdersCollection(userId);
  const { db } = getFirebaseAdmin();

  let savedCount = 0;
  const CHUNK_SIZE = 450;

  for (let i = 0; i < orders.length; i += CHUNK_SIZE) {
    const chunk = orders.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();

    for (const order of chunk) {
      const docRef = col.doc(order.id);
      batch.set(docRef, order, { merge: true });
      savedCount++;
    }

    await batch.commit();
  }

  return savedCount;
}

/**
 * Retrieves orders for a user with optional filters and sorting
 */
export async function getSwiggyOrders(
  userId: string,
  options: {
    month?: string; // "YYYY-MM"
    restaurant?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ orders: SwiggyOrder[]; total: number }> {
  const col = await getOrdersCollection(userId);
  const snap = await col.get();

  let orders = snap.docs.map((d) => d.data() as SwiggyOrder);

  // Sort descending by date
  orders.sort((a, b) => b.orderDateTime.localeCompare(a.orderDateTime));

  // Filter by month
  if (options.month) {
    orders = orders.filter((o) => o.orderMonth === options.month);
  }

  // Filter by restaurant
  if (options.restaurant) {
    const rLower = options.restaurant.toLowerCase();
    orders = orders.filter((o) => o.restaurantName.toLowerCase().includes(rLower));
  }

  // Search by item name or restaurant name or order ID
  if (options.search) {
    const s = options.search.toLowerCase();
    orders = orders.filter(
      (o) =>
        o.orderId.toLowerCase().includes(s) ||
        o.restaurantName.toLowerCase().includes(s) ||
        (o.couponCode && o.couponCode.toLowerCase().includes(s)) ||
        o.items.some((it) => it.name.toLowerCase().includes(s))
    );
  }

  const total = orders.length;
  const offset = options.offset || 0;
  const limit = options.limit || 50;

  return {
    orders: orders.slice(offset, offset + limit),
    total,
  };
}

/**
 * Computes lifetime metrics and intelligence summary for Swiggy food orders
 */
export async function getSwiggySummary(userId: string): Promise<SwiggySummary> {
  const col = await getOrdersCollection(userId);
  const snap = await col.get();

  const orders = snap.docs.map((d) => d.data() as SwiggyOrder);
  orders.sort((a, b) => a.orderDateTime.localeCompare(b.orderDateTime));

  if (orders.length === 0) {
    return {
      totalSpend: 0,
      totalOrders: 0,
      averageOrderValue: 0,
      averageMonthlySpend: 0,
      totalItemsCount: 0,
      totalSavings: 0,
      averageDeliveryDuration: null,
      firstOrderDate: null,
      latestOrderDate: null,
      feeTotals: {
        itemBill: 0,
        packagingFee: 0,
        deliveryFee: 0,
        platformFee: 0,
        taxes: 0,
        discount: 0,
        tip: 0,
      },
      topRestaurants: [],
      topDishes: [],
      cuisineBreakdown: [],
      monthlySpend: [],
      dayOfWeekBreakdown: [],
      timeSlotBreakdown: [],
    };
  }

  let totalSpend = 0;
  let totalItemsCount = 0;
  let totalSavings = 0;
  let totalItemBill = 0;
  let totalPackagingFee = 0;
  let totalDeliveryFee = 0;
  let totalPlatformFee = 0;
  let totalTaxes = 0;
  let totalDiscount = 0;
  let totalTip = 0;
  let durationSum = 0;
  let durationCount = 0;

  const restaurantMap = new Map<
    string,
    { name: string; count: number; spend: number; lastDate: string }
  >();

  const dishMap = new Map<
    string,
    { name: string; cuisine: SwiggyCuisine; orderCount: number; totalQty: number; spend: number }
  >();

  const cuisineMap = new Map<SwiggyCuisine, { count: number; spend: number }>();
  const monthlyMap = new Map<string, SwiggyMonthlySpend>();

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
    "Breakfast / Morning (6 AM - 11 AM)": { count: 0, spend: 0 },
    "Lunch (11 AM - 3 PM)": { count: 0, spend: 0 },
    "Snacks & Tea (3 PM - 7 PM)": { count: 0, spend: 0 },
    "Dinner (7 PM - 11 PM)": { count: 0, spend: 0 },
    "Late Night (11 PM - 6 AM)": { count: 0, spend: 0 },
  };

  const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  for (const ord of orders) {
    totalSpend += ord.grandTotal;
    totalItemsCount += ord.itemCount;
    totalSavings += ord.discount;
    totalItemBill += ord.itemBill || ord.grandTotal;
    totalPackagingFee += ord.packagingFee || 0;
    totalDeliveryFee += ord.deliveryFee || 0;
    totalPlatformFee += ord.platformFee || 0;
    totalTaxes += ord.taxes || 0;
    totalDiscount += ord.discount || 0;
    totalTip += ord.tip || 0;

    if (ord.deliveryDurationMinutes && ord.deliveryDurationMinutes > 0) {
      durationSum += ord.deliveryDurationMinutes;
      durationCount++;
    }

    // Day of week
    if (dayOfWeekMap[ord.dayOfWeek]) {
      dayOfWeekMap[ord.dayOfWeek].count++;
      dayOfWeekMap[ord.dayOfWeek].spend += ord.grandTotal;
    }

    // Time slots
    const hr = ord.hourOfDay;
    let slot = "Dinner (7 PM - 11 PM)";
    if (hr >= 6 && hr < 11) slot = "Breakfast / Morning (6 AM - 11 AM)";
    else if (hr >= 11 && hr < 15) slot = "Lunch (11 AM - 3 PM)";
    else if (hr >= 15 && hr < 19) slot = "Snacks & Tea (3 PM - 7 PM)";
    else if (hr >= 19 && hr < 23) slot = "Dinner (7 PM - 11 PM)";
    else slot = "Late Night (11 PM - 6 AM)";

    timeSlotMap[slot].count++;
    timeSlotMap[slot].spend += ord.grandTotal;

    // Monthly Spend
    const m = ord.orderMonth;
    if (!monthlyMap.has(m)) {
      const [y, mm] = m.split("-");
      const monthIdx = parseInt(mm, 10) - 1;
      const displayMonth = `${MONTH_NAMES[monthIdx] || mm} ${y}`;
      monthlyMap.set(m, {
        month: m,
        displayMonth,
        spend: 0,
        orderCount: 0,
        itemCount: 0,
        discounts: 0,
        packagingFee: 0,
        deliveryFee: 0,
      });
    }
    const mData = monthlyMap.get(m)!;
    mData.spend += ord.grandTotal;
    mData.orderCount++;
    mData.itemCount += ord.itemCount;
    mData.discounts += ord.discount || 0;
    mData.packagingFee += ord.packagingFee || 0;
    mData.deliveryFee += ord.deliveryFee || 0;

    // Restaurant
    const rName = ord.restaurantName.trim();
    if (!restaurantMap.has(rName)) {
      restaurantMap.set(rName, {
        name: rName,
        count: 0,
        spend: 0,
        lastDate: ord.orderDate,
      });
    }
    const rData = restaurantMap.get(rName)!;
    rData.count++;
    rData.spend += ord.grandTotal;
    if (ord.orderDate > rData.lastDate) rData.lastDate = ord.orderDate;

    // Dishes & Cuisines
    for (const it of ord.items) {
      const normDish = it.name.trim();
      const effectiveCuisine =
        !it.cuisine || it.cuisine === "Other"
          ? categorizeSwiggyItem(normDish)
          : it.cuisine;

      if (!dishMap.has(normDish)) {
        dishMap.set(normDish, {
          name: normDish,
          cuisine: effectiveCuisine,
          orderCount: 0,
          totalQty: 0,
          spend: 0,
        });
      }
      const dData = dishMap.get(normDish)!;
      dData.orderCount++;
      dData.totalQty += it.quantity;
      dData.spend += it.price;
      if (dData.cuisine === "Other" && effectiveCuisine !== "Other") {
        dData.cuisine = effectiveCuisine;
      }

      // Cuisines
      if (!cuisineMap.has(effectiveCuisine)) {
        cuisineMap.set(effectiveCuisine, { count: 0, spend: 0 });
      }
      const cData = cuisineMap.get(effectiveCuisine)!;
      cData.count += it.quantity;
      cData.spend += it.price;
    }
  }

  // Top Restaurants by order count, then spend
  const topRestaurants: SwiggyRestaurantStat[] = Array.from(
    restaurantMap.values()
  )
    .map((r) => ({
      name: r.name,
      orderCount: r.count,
      totalSpend: Math.round(r.spend * 100) / 100,
      avgOrderValue: Math.round((r.spend / r.count) * 100) / 100,
      lastOrderDate: r.lastDate,
    }))
    .sort((a, b) => b.orderCount - a.orderCount || b.totalSpend - a.totalSpend)
    .slice(0, 20);

  // Top 25 Dishes
  const topDishes: SwiggyTopDish[] = Array.from(dishMap.values())
    .map((d) => ({
      name: d.name,
      cuisine: d.cuisine,
      orderCount: d.orderCount,
      totalQuantity: d.totalQty,
      totalSpend: Math.round(d.spend * 100) / 100,
      avgPrice:
        d.totalQty > 0
          ? Math.round((d.spend / d.totalQty) * 100) / 100
          : 0,
    }))
    .sort((a, b) => b.orderCount - a.orderCount || b.totalSpend - a.totalSpend)
    .slice(0, 25);

  // Cuisine Breakdown
  const cuisineBreakdown = Array.from(cuisineMap.entries())
    .map(([c, val]) => ({
      cuisine: c,
      count: val.count,
      spend: Math.round(val.spend * 100) / 100,
      percentage:
        totalSpend > 0
          ? Math.round((val.spend / totalSpend) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  // Monthly spend chronologically
  const monthlySpend: SwiggyMonthlySpend[] = Array.from(monthlyMap.values())
    .map((m) => ({
      ...m,
      spend: Math.round(m.spend * 100) / 100,
      discounts: Math.round(m.discounts * 100) / 100,
      packagingFee: Math.round(m.packagingFee * 100) / 100,
      deliveryFee: Math.round(m.deliveryFee * 100) / 100,
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

  const activeMonthsCount = monthlySpend.length || 1;
  const averageMonthlySpend = Math.round(totalSpend / activeMonthsCount);

  return {
    totalSpend: Math.round(totalSpend * 100) / 100,
    totalOrders: orders.length,
    averageOrderValue:
      orders.length > 0
        ? Math.round((totalSpend / orders.length) * 100) / 100
        : 0,
    averageMonthlySpend,
    totalItemsCount,
    totalSavings: Math.round(totalSavings * 100) / 100,
    averageDeliveryDuration:
      durationCount > 0 ? Math.round(durationSum / durationCount) : null,
    firstOrderDate: orders[0]?.orderDate || null,
    latestOrderDate: orders[orders.length - 1]?.orderDate || null,
    feeTotals: {
      itemBill: Math.round(totalItemBill * 100) / 100,
      packagingFee: Math.round(totalPackagingFee * 100) / 100,
      deliveryFee: Math.round(totalDeliveryFee * 100) / 100,
      platformFee: Math.round(totalPlatformFee * 100) / 100,
      taxes: Math.round(totalTaxes * 100) / 100,
      discount: Math.round(totalDiscount * 100) / 100,
      tip: Math.round(totalTip * 100) / 100,
    },
    topRestaurants,
    topDishes,
    cuisineBreakdown,
    monthlySpend,
    dayOfWeekBreakdown,
    timeSlotBreakdown,
  };
}

/**
 * Deletes a single Swiggy food order
 */
export async function deleteSwiggyOrder(
  userId: string,
  orderId: string
): Promise<void> {
  const col = await getOrdersCollection(userId);
  await col.doc(orderId).delete();
}
