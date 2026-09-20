export interface AmazonOrderItem {
  title: string;
  asin?: string;
  quantity: number;
  price: number;
  discount?: number;
  itemUrl?: string;
  imageUrl?: string;
}

export interface AmazonPromotion {
  description: string;
  amount: number;
}

export interface AmazonOrder {
  orderId: string;
  orderUrl: string;
  items: string[];
  orderItems?: AmazonOrderItem[];
  itemsRaw?: string;
  recipient: string;
  recipientName?: string;
  recipientStreet?: string;
  recipientCityPostal?: string;
  recipientCountry?: string;
  orderDate: string; // YYYY-MM-DD
  year: number;
  month: string; // YYYY-MM
  totalAmount: number;
  currency?: string;
  orderStatus?: string;
  detailsUrl?: string;
  promotions?: AmazonPromotion[];
  totalSavings?: number;
  shippingAmount?: number;
  shippingRefund?: number;
  giftAmount?: number;
  vatAmount?: number;
  refundAmount?: number;
  paymentsRaw?: string;
  paymentMethod?: string;
  isKindleUnlimited: boolean;
  isAmazonPrime?: boolean;
  invoiceUrl?: string;
  importedAt: string;
  updatedAt: string;
}

export interface MonthlyAmazonSpend {
  month: string; // YYYY-MM
  formattedMonth: string; // e.g. "Sep 2026"
  spend: number;
  ordersCount: number;
}

export interface RecipientAmazonSpend {
  recipient: string;
  spend: number;
  ordersCount: number;
}

export interface PaymentAmazonSpend {
  method: string;
  spend: number;
  ordersCount: number;
}

export interface AmazonSummary {
  totalSpend: number;
  totalOrders: number;
  totalItems: number;
  averageOrderValue: number;
  totalRefunded: number;
  refundedOrdersCount: number;
  kindleOrdersCount: number;
  kindleTotalSpend: number;
  primeOrdersCount?: number;
  totalSavings?: number;
  dateRange: {
    start: string | null;
    end: string | null;
  };
  monthlyStats: MonthlyAmazonSpend[];
  recipientStats: RecipientAmazonSpend[];
  paymentStats: PaymentAmazonSpend[];
}

export interface AmazonOrderFilter {
  month?: string;
  recipient?: string;
  type?: "ALL" | "PHYSICAL" | "KINDLE" | "REFUNDED" | "CANCELLED";
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AmazonImportResult {
  totalRows: number;
  duplicatesInSource: number;
  duplicateOrderIds?: string[];
  importedOrders: number;
  updatedOrders: number;
  duplicatesExisting: number;
  kindleOrdersCount: number;
  primeOrdersCount?: number;
  totalSpend: number;
  message: string;
  truncatedFirst?: boolean;
}
