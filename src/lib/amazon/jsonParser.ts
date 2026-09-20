import { AmazonOrder, AmazonOrderItem, AmazonPromotion } from "./types";

export interface ParseAmazonOrdersResult {
  orders: AmazonOrder[];
  totalRows: number;
  duplicatesInSource: number;
  duplicateOrderIds: string[];
}

/**
 * Parses raw JSON string or array of raw objects into typed AmazonOrder records.
 * Performs duplicate detection within the input dataset.
 */
export function parseAmazonOrdersJson(rawInput: string | any[]): ParseAmazonOrdersResult {
  let parsedData: any[];

  if (typeof rawInput === "string") {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      return {
        orders: [],
        totalRows: 0,
        duplicatesInSource: 0,
        duplicateOrderIds: [],
      };
    }
    try {
      parsedData = JSON.parse(trimmed);
    } catch (err: any) {
      throw new Error(`Failed to parse Amazon orders JSON: ${err.message || "Invalid JSON syntax"}`);
    }
  } else if (Array.isArray(rawInput)) {
    parsedData = rawInput;
  } else if (rawInput && typeof rawInput === "object") {
    // If wrapped in an object like { orders: [...] } or { data: [...] }
    if (Array.isArray((rawInput as any).orders)) {
      parsedData = (rawInput as any).orders;
    } else if (Array.isArray((rawInput as any).data)) {
      parsedData = (rawInput as any).data;
    } else {
      parsedData = [rawInput];
    }
  } else {
    throw new Error("Invalid input: Expected JSON string or array of orders.");
  }

  if (!Array.isArray(parsedData)) {
    throw new Error("Invalid JSON structure: Expected an array of Amazon order objects.");
  }

  const now = new Date().toISOString();
  const orderMap = new Map<string, AmazonOrder>();
  const duplicateOrderIds: string[] = [];
  let duplicatesInSource = 0;

  for (let i = 0; i < parsedData.length; i++) {
    const raw = parsedData[i];
    if (!raw || typeof raw !== "object") continue;

    // Validate order ID
    const rawOrderId = raw.orderId || raw.orderID || raw.id;
    if (!rawOrderId || typeof rawOrderId !== "string") {
      continue;
    }
    const orderId = rawOrderId.trim();
    if (
      !orderId ||
      orderId.startsWith("=") ||
      orderId.startsWith("+") ||
      /^(subtotal|total|grand\s*total|count|sum|average)\b/i.test(orderId)
    ) {
      continue;
    }

    // Validate order date
    const rawDate = raw.orderDate || raw.date || "";
    let orderDate = "";
    if (typeof rawDate === "string") {
      const dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        orderDate = dateMatch[0];
      }
    }
    if (!orderDate) {
      // Try parsing date string
      const parsedD = new Date(rawDate);
      if (!isNaN(parsedD.getTime())) {
        orderDate = parsedD.toISOString().split("T")[0];
      }
    }
    if (!orderDate) {
      continue;
    }

    const year = parseInt(orderDate.slice(0, 4), 10);
    const month = orderDate.slice(0, 7);

    // Extract item details
    const orderItems: AmazonOrderItem[] = [];
    const itemTitles: string[] = [];

    if (Array.isArray(raw.items)) {
      for (const it of raw.items) {
        if (!it) continue;
        if (typeof it === "string") {
          const t = it.trim();
          if (t) {
            itemTitles.push(t);
            orderItems.push({
              title: t,
              quantity: 1,
              price: 0,
            });
          }
        } else if (typeof it === "object") {
          const title = (it.title || it.name || "").trim();
          if (!title) continue;
          itemTitles.push(title);
          orderItems.push({
            title,
            asin: it.asin ? String(it.asin).trim() : undefined,
            quantity: typeof it.quantity === "number" ? it.quantity : parseInt(it.quantity, 10) || 1,
            price: typeof it.price === "number" ? it.price : parseFloat(it.price) || 0,
            discount: typeof it.discount === "number" ? it.discount : parseFloat(it.discount) || 0,
            itemUrl: it.itemUrl ? String(it.itemUrl).trim() : undefined,
            imageUrl: it.imageUrl ? String(it.imageUrl).trim() : undefined,
          });
        }
      }
    }

    if (itemTitles.length === 0) {
      continue;
    }

    // Total Amount
    let totalAmount = 0;
    if (typeof raw.totalAmount === "number") {
      totalAmount = raw.totalAmount;
    } else if (raw.totalAmount != null) {
      const parsedNum = parseFloat(String(raw.totalAmount).replace(/[^0-9.]/g, ""));
      totalAmount = isNaN(parsedNum) ? 0 : parsedNum;
    } else if (typeof raw.total === "number") {
      totalAmount = raw.total;
    } else if (raw.total != null) {
      const parsedNum = parseFloat(String(raw.total).replace(/[^0-9.]/g, ""));
      totalAmount = isNaN(parsedNum) ? 0 : parsedNum;
    }

    // Currency
    const currency = (raw.currency || "INR").trim().toUpperCase();

    // Recipient details
    const rawRecipient = (raw.recipientName || raw.recipient || raw.to || "").trim();
    const recipientName =
      !rawRecipient || rawRecipient.toLowerCase() === "you"
        ? "Amazon Pay / Bill Payments"
        : rawRecipient;
    const recipientStreet = raw.recipientStreet ? String(raw.recipientStreet).trim() : undefined;
    const recipientCityPostal = raw.recipientCityPostal ? String(raw.recipientCityPostal).trim() : undefined;
    const recipientCountry = raw.recipientCountry ? String(raw.recipientCountry).trim() : undefined;

    // Status
    const orderStatus = raw.orderStatus ? String(raw.orderStatus).trim() : undefined;

    // Promotions
    const promotions: AmazonPromotion[] = [];
    if (Array.isArray(raw.promotions)) {
      for (const p of raw.promotions) {
        if (p && typeof p === "object") {
          promotions.push({
            description: String(p.description || "Promotion").trim(),
            amount: typeof p.amount === "number" ? p.amount : parseFloat(p.amount) || 0,
          });
        }
      }
    }
    const totalSavings =
      typeof raw.totalSavings === "number"
        ? raw.totalSavings
        : parseFloat(raw.totalSavings) || (promotions.reduce((sum, p) => sum + p.amount, 0));

    // URLs
    const orderUrl =
      raw.detailsUrl ||
      raw.orderUrl ||
      `https://www.amazon.in/your-orders/order-details?orderID=${orderId}`;

    // Detect Subscriptions
    const isKindleUnlimited =
      itemTitles.some((t) => /kindle\s+unlimited/i.test(t));

    const isAmazonPrime =
      itemTitles.some((t) => /amazon\s+prime/i.test(t));

    // Detect if order is cancelled or refunded
    let refundAmount = 0;
    if (typeof raw.refundAmount === "number") {
      refundAmount = raw.refundAmount;
    } else if (orderStatus && /refund|returned/i.test(orderStatus)) {
      refundAmount = totalAmount;
    }

    // Payment method fallback
    let paymentMethod = raw.paymentMethod ? String(raw.paymentMethod).trim() : undefined;
    if (!paymentMethod) {
      paymentMethod = isKindleUnlimited
        ? "Amazon 1-Click / Auto-Debit"
        : isAmazonPrime
        ? "Amazon Prime Auto-Debit"
        : "Amazon Pay";
    }

    const orderRecord: AmazonOrder = {
      orderId,
      orderUrl,
      items: itemTitles,
      orderItems,
      itemsRaw: itemTitles.join("; "),
      recipient: recipientName,
      recipientName,
      recipientStreet,
      recipientCityPostal,
      recipientCountry,
      orderDate,
      year,
      month,
      totalAmount: Math.round((totalAmount + Number.EPSILON) * 100) / 100,
      currency,
      orderStatus,
      detailsUrl: orderUrl,
      promotions,
      totalSavings: Math.round((totalSavings + Number.EPSILON) * 100) / 100,
      shippingAmount: typeof raw.shippingAmount === "number" ? raw.shippingAmount : 0,
      shippingRefund: typeof raw.shippingRefund === "number" ? raw.shippingRefund : 0,
      giftAmount: typeof raw.giftAmount === "number" ? raw.giftAmount : 0,
      vatAmount: typeof raw.vatAmount === "number" ? raw.vatAmount : 0,
      refundAmount,
      paymentsRaw: raw.paymentsRaw || "",
      paymentMethod,
      isKindleUnlimited,
      isAmazonPrime,
      invoiceUrl: raw.invoiceUrl || "",
      importedAt: now,
      updatedAt: now,
    };

    // Duplicate detection within the file/payload
    if (orderMap.has(orderId)) {
      duplicatesInSource++;
      duplicateOrderIds.push(orderId);
      // Merge items if duplicate record has more items
      const existing = orderMap.get(orderId)!;
      if (orderRecord.orderItems && (!existing.orderItems || orderRecord.orderItems.length > existing.orderItems.length)) {
        orderMap.set(orderId, orderRecord);
      }
    } else {
      orderMap.set(orderId, orderRecord);
    }
  }

  const finalOrders = Array.from(orderMap.values());

  return {
    orders: finalOrders,
    totalRows: parsedData.length,
    duplicatesInSource,
    duplicateOrderIds,
  };
}
