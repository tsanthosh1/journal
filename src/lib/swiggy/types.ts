export type SwiggyCuisine =
  | "Biryani & Rice"
  | "South Indian"
  | "North Indian"
  | "Chinese & Asian"
  | "Fast Food & Burgers"
  | "Pizza & Italian"
  | "Desserts & Bakery"
  | "Beverages & Juices"
  | "Snacks & Chaat"
  | "Arabian & BBQ"
  | "Other";

export interface SwiggyItem {
  name: string;
  quantity: number;
  price: number; // Total price in INR for this line item
  unitPrice: number; // price / quantity
  cuisine: SwiggyCuisine;
}

export interface SwiggyFeeBreakdown {
  itemBill: number;
  packagingFee: number;
  deliveryFee: number;
  platformFee: number;
  taxes: number;
  discount: number;
  tip: number;
  grandTotal: number;
}

export interface SwiggyOrder {
  id: string; // Order ID (e.g. "248425639117464")
  orderId: string;
  userId: string;
  messageId: string; // Gmail Message ID
  restaurantName: string; // e.g. "Ambur Star Briyani"
  restaurantAddress: string;
  deliveryAddress: string;
  orderDate: string; // "YYYY-MM-DD"
  orderTime: string; // "HH:mm:ss"
  orderDateTime: string; // ISO string
  orderMonth: string; // "YYYY-MM"
  dayOfWeek: string; // "Sunday", "Monday", etc.
  hourOfDay: number; // 0-23
  deliveryDurationMinutes: number | null; // e.g. 22
  deliveryStatus: string; // e.g. "Delivered"
  items: SwiggyItem[];
  itemCount: number; // sum of quantities
  uniqueItemCount: number;
  itemBill: number;
  packagingFee: number;
  deliveryFee: number;
  platformFee: number;
  taxes: number;
  discount: number;
  couponCode: string | null;
  tip: number;
  grandTotal: number;
  currency: string; // "INR"
  emailSubject: string;
  emailDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface SwiggyTopDish {
  name: string;
  cuisine: SwiggyCuisine;
  orderCount: number;
  totalQuantity: number;
  totalSpend: number;
  avgPrice: number;
}

export interface SwiggyRestaurantStat {
  name: string;
  orderCount: number;
  totalSpend: number;
  avgOrderValue: number;
  lastOrderDate: string;
}

export interface SwiggyMonthlySpend {
  month: string; // "YYYY-MM"
  displayMonth: string; // "Aug 2026"
  spend: number;
  orderCount: number;
  itemCount: number;
  discounts: number;
  packagingFee: number;
  deliveryFee: number;
}

export interface SwiggySummary {
  totalSpend: number;
  totalOrders: number;
  averageOrderValue: number;
  averageMonthlySpend: number;
  totalItemsCount: number;
  totalSavings: number;
  averageDeliveryDuration: number | null; // in minutes
  firstOrderDate: string | null;
  latestOrderDate: string | null;
  feeTotals: {
    itemBill: number;
    packagingFee: number;
    deliveryFee: number;
    platformFee: number;
    taxes: number;
    discount: number;
    tip: number;
  };
  topRestaurants: SwiggyRestaurantStat[];
  topDishes: SwiggyTopDish[];
  cuisineBreakdown: Array<{
    cuisine: SwiggyCuisine;
    count: number;
    spend: number;
    percentage: number;
  }>;
  monthlySpend: SwiggyMonthlySpend[];
  dayOfWeekBreakdown: Array<{ day: string; count: number; spend: number }>;
  timeSlotBreakdown: Array<{ slot: string; count: number; spend: number }>;
}

export interface SwiggySyncProgress {
  totalFound: number;
  processed: number;
  newlySynced: number;
  skippedExisting: number;
  errors: number;
  isComplete: boolean;
  statusMessage: string;
}
