export type InstamartCategory =
  | "Vegetables & Fruits"
  | "Dairy, Bread & Eggs"
  | "Snacks & Munchies"
  | "Instant Food & Noodles"
  | "Baby & Child Care"
  | "Beverages & Drinks"
  | "Pantry & Cooking Essentials"
  | "Personal Care & Grooming"
  | "Household & Cleaning"
  | "Other";

export interface InstamartItem {
  name: string;
  quantity: number;
  price: number; // Total price in INR for this line item
  unitPrice: number; // price / quantity
  category: InstamartCategory;
}

export interface InstamartFeeBreakdown {
  itemBill: number;
  handlingFee: number;
  deliveryFee: number;
  discount: number;
  tip: number;
  grandTotal: number;
}

export interface InstamartOrder {
  id: string; // Order ID (e.g. "248426010908917")
  orderId: string;
  userId: string;
  messageId: string; // Gmail Message ID
  orderDate: string; // "YYYY-MM-DD"
  orderTime: string; // "HH:mm:ss"
  orderDateTime: string; // ISO string
  orderMonth: string; // "YYYY-MM"
  dayOfWeek: string; // "Sunday", "Monday", etc.
  hourOfDay: number; // 0-23
  deliveryAddress: string;
  items: InstamartItem[];
  itemCount: number; // sum of quantities
  uniqueItemCount: number;
  itemBill: number;
  handlingFee: number;
  deliveryFee: number;
  discount: number;
  tip: number;
  grandTotal: number;
  currency: string; // "INR"
  emailSubject: string;
  emailDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstamartTopItem {
  name: string;
  category: InstamartCategory;
  orderCount: number;
  totalQuantity: number;
  totalSpend: number;
  avgPrice: number;
}

export interface InstamartCategoryStat {
  category: InstamartCategory;
  count: number;
  totalQuantity: number;
  spend: number;
  percentage: number;
}

export interface InstamartMonthlySpend {
  month: string; // "YYYY-MM"
  displayMonth: string; // "Aug 2026"
  spend: number;
  orderCount: number;
  itemCount: number;
  handlingFee: number;
  deliveryFee: number;
}

export interface InstamartSummary {
  totalSpend: number;
  totalOrders: number;
  averageOrderValue: number;
  averageMonthlySpend: number;
  totalItemsCount: number;
  firstOrderDate: string | null;
  latestOrderDate: string | null;
  feeTotals: {
    itemBill: number;
    handlingFee: number;
    deliveryFee: number;
    discount: number;
    tip: number;
  };
  topItems: InstamartTopItem[];
  categoryBreakdown: InstamartCategoryStat[];
  monthlySpend: InstamartMonthlySpend[];
  dayOfWeekBreakdown: Array<{ day: string; count: number; spend: number }>;
  timeSlotBreakdown: Array<{ slot: string; count: number; spend: number }>;
}

export interface InstamartSyncProgress {
  totalFound: number;
  processed: number;
  newlySynced: number;
  skippedExisting: number;
  errors: number;
  isComplete: boolean;
  statusMessage: string;
}
