import {
  SwiggyCuisine,
  SwiggyItem,
  SwiggyOrder,
} from "./types";

/**
 * Intelligent categorization for food items into popular Indian dining cuisines
 */
export function categorizeSwiggyItem(itemName: string): SwiggyCuisine {
  const lower = itemName.toLowerCase();

  // Biryani & Rice
  if (
    /biryani|briyani|pulao|pulav|fried rice|khichdi|ghee rice|jeera rice|curd rice|mandi|kushka/i.test(
      lower
    )
  ) {
    return "Biryani & Rice";
  }

  // South Indian
  if (
    /dosa|dosai|idli|idly|vada|vadai|sambar|pongal|uthappam|oothappam|poori|puri|parotta|porotta|kothu|chettinad|rasam|appam|idiyappam|bhavan|tiffin|meals|upma|chapati|chapathi/i.test(
      lower
    )
  ) {
    return "South Indian";
  }

  // Pizza & Italian
  if (/pizza|pasta|spaghetti|lasagna|garlic bread|calzone|mac and cheese/i.test(lower)) {
    return "Pizza & Italian";
  }

  // Fast Food & Burgers
  if (
    /burger|sandwich|wrap|fries|finger|nugget|sub |roll|frankie|hot dog|slider|taco/i.test(
      lower
    )
  ) {
    return "Fast Food & Burgers";
  }

  // Chinese & Asian
  if (
    /momo|noodle|chowmein|manchurian|schezwan|chilli chicken|dimsum|spring roll|bao|thai|ramen|wonton|teriyaki|sushi/i.test(
      lower
    )
  ) {
    return "Chinese & Asian";
  }

  // Arabian & BBQ
  if (
    /shawarma|grill|alfaham|al faham|kebab|kabab|tandoor|tikka|bbq|barbeque|sheekh|kuboos/i.test(
      lower
    )
  ) {
    return "Arabian & BBQ";
  }

  // Desserts & Bakery
  if (
    /waffle|cake|brownie|ice cream|sundae|dessert|gulab jamun|halwa|kheer|pastry|donut|doughnut|cookie|pudding|cheesecake|sweet/i.test(
      lower
    )
  ) {
    return "Desserts & Bakery";
  }

  // Beverages & Juices
  if (
    /shake|smoothie|juice|chai|tea|coffee|frappe|latte|boba|bubble tea|mojito|beverage|drink|crush|falooda|lassi|lemonade/i.test(
      lower
    )
  ) {
    return "Beverages & Juices";
  }

  // Snacks & Chaat
  if (
    /samosa|pani puri|golgappa|chaat|bhel|sev|kachori|cutlet|pakora|pakoda|bajji|puff|bhaji|pav bhaji/i.test(
      lower
    )
  ) {
    return "Snacks & Chaat";
  }

  // North Indian
  if (
    /paneer|roti|naan|dal|butter chicken|kulcha|chole|bhature|kofta|paratha|gravy|masala|kadai|korma|bhurji|rajma/i.test(
      lower
    )
  ) {
    return "North Indian";
  }

  return "Other";
}

/**
 * Normalizes HTML content to clean line-separated text
 */
function cleanHtmlLines(raw: string): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Parses a Swiggy food delivery email
 */
export function parseSwiggyEmail(params: {
  userId: string;
  messageId: string;
  subject: string;
  emailDate: string;
  internalDate?: string;
  bodyHtml: string;
  bodyText?: string;
}): SwiggyOrder | null {
  const {
    userId,
    messageId,
    subject,
    emailDate,
    internalDate,
    bodyHtml,
    bodyText = "",
  } = params;

  // 1. Exclude Instamart (handled by dedicated groceries tracker)
  if (/instamart/i.test(subject) || /instamart/i.test(bodyHtml.slice(0, 500))) {
    return null;
  }

  // 2. Exclude cancelled orders
  if (/cancelled|canceled/i.test(subject) || /order is cancelled|order has been cancelled/i.test(bodyText || bodyHtml)) {
    return null;
  }

  const cleanText = cleanHtmlLines(bodyHtml || bodyText);

  // 3. Extract Order ID
  let orderId = "";
  const orderIdMatch =
    cleanText.match(/Order (?:ID|No|#)\s*[:#-]?\s*(\d{10,25})/i) ||
    bodyHtml.match(/Order (?:ID|No|#)\s*[:#-]?\s*(?:<[^>]+>)*\s*(\d{10,25})/i) ||
    subject.match(/#(\d{10,25})/);

  if (orderIdMatch) {
    orderId = orderIdMatch[1];
  } else {
    // Fallback: search for standalone 11-15 digit order numbers
    const standaloneMatch = cleanText.match(/\b(24\d{13}|23\d{13}|22\d{13}|21\d{13}|20\d{13}|19\d{13}|18\d{13}|17\d{13}|16\d{13}|15\d{10}|14\d{10}|13\d{10})\b/);
    if (standaloneMatch) {
      orderId = standaloneMatch[1];
    }
  }

  if (!orderId) {
    return null;
  }

  // 4. Parse Date and Time
  let dateObj = new Date(emailDate);
  if (isNaN(dateObj.getTime()) && internalDate) {
    const ms = parseInt(internalDate, 10);
    if (!isNaN(ms)) dateObj = new Date(ms);
  }
  if (isNaN(dateObj.getTime())) {
    dateObj = new Date();
  }

  const isoDateTime = dateObj.toISOString();
  const orderDate = isoDateTime.slice(0, 10); // "YYYY-MM-DD"
  const orderMonth = orderDate.slice(0, 7); // "YYYY-MM"
  const orderTime = isoDateTime.slice(11, 19); // "HH:mm:ss"
  const DAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dayOfWeek = DAYS[dateObj.getDay()];
  const hourOfDay = dateObj.getHours();

  // 5. Extract Delivery Duration (minutes)
  let deliveryDurationMinutes: number | null = null;
  const durMatch =
    cleanText.match(/Delivery in\s*(\d+)\s*mins/i) ||
    cleanText.match(/delivered in\s*(\d+)\s*minutes/i) ||
    subject.match(/in\s*(\d+)\s*mins/i);
  if (durMatch) {
    deliveryDurationMinutes = parseInt(durMatch[1], 10);
  }

  // 6. Extract Restaurant Name and Address
  let restaurantName = "";
  let restaurantAddress = "";

  // Template A: Modern (ORDER JOURNEY)
  const journeyIndex = cleanText.indexOf("ORDER JOURNEY");
  if (journeyIndex !== -1) {
    const afterJourney = cleanText.slice(journeyIndex).split("\n");
    if (afterJourney.length > 1) {
      restaurantName = afterJourney[1].trim();
      if (afterJourney.length > 2 && afterJourney[2].length > 5 && !afterJourney[2].startsWith("Order ID")) {
        restaurantAddress = afterJourney[2].trim();
      }
    }
  }

  // Template B: Classic
  if (!restaurantName) {
    const classicOrderedFrom = cleanText.match(/Ordered from:\s*\n*([^\n]+)/i);
    const classicRest = cleanText.match(/Restaurant\s+([^\n]+)/i);
    if (classicOrderedFrom) {
      restaurantName = classicOrderedFrom[1].trim();
    } else if (classicRest) {
      restaurantName = classicRest[1].trim();
    }
  }

  // Cleanup restaurant name if needed
  restaurantName = restaurantName
    .replace(/^Ordered from:\s*/i, "")
    .replace(/^Restaurant\s*[:#-]?\s*/i, "")
    .replace(/\b(Order Summary|Your Order|Delivery To)\b.*$/i, "")
    .trim();

  if (!restaurantName) {
    restaurantName = "Swiggy Restaurant";
  }

  // 7. Extract Delivery Address
  let deliveryAddress = "";
  const delivMatch =
    cleanText.match(/Delivery To:\s*\n*([^\n]+(?:\n+[^\n]+)?)/i) ||
    cleanText.match(/Deliver To:\s*\n*([^\n]+(?:\n+[^\n]+)?)/i);
  if (delivMatch) {
    deliveryAddress = delivMatch[1].replace(/\n+/g, ", ").trim();
  }

  // 8. Extract Line Items
  const items: SwiggyItem[] = [];

  // Pattern A: Modern "<Name> x<Qty>\n₹<Price>" or "<Name> x<Qty> ₹<Price>"
  const modernItemRegex = /([^\n\r]+?)\s*x(\d+)\s*\n*₹\s*([\d,.]+)/gi;
  let mItem: RegExpExecArray | null;
  while ((mItem = modernItemRegex.exec(cleanText)) !== null) {
    const rawName = mItem[1]
      .trim()
      .replace(/^BILL DETAILS\s*/i, "")
      .replace(/^Order Items\s*/i, "")
      .trim();
    const qty = parseInt(mItem[2], 10) || 1;
    const price = parseFloat(mItem[3].replace(/,/g, "")) || 0;

    if (
      rawName &&
      !rawName.toLowerCase().includes("order id") &&
      !rawName.toLowerCase().includes("packaging") &&
      !rawName.toLowerCase().includes("platform fee")
    ) {
      items.push({
        name: rawName,
        quantity: qty,
        price,
        unitPrice: Math.round((price / qty) * 100) / 100,
        cuisine: categorizeSwiggyItem(rawName),
      });
    }
  }

  // Pattern B: Classic Table Format
  if (items.length === 0) {
    const classicSection = cleanText.match(
      /Item Name\s+Quantity\s+Price\s*\n([\s\S]*?)(?:Item Total|Order Packing|Platform fee|Total)/i
    );
    if (classicSection) {
      const lines = classicSection[1]
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        if (
          lines[i + 2] &&
          (lines[i + 2].startsWith("₹") || lines[i + 2].startsWith("Rs."))
        ) {
          const rawName = lines[i];
          const qty = parseInt(lines[i + 1], 10) || 1;
          const price =
            parseFloat(lines[i + 2].replace(/[^\d.]/g, "")) || 0;
          items.push({
            name: rawName,
            quantity: qty,
            price,
            unitPrice: Math.round((price / qty) * 100) / 100,
            cuisine: categorizeSwiggyItem(rawName),
          });
          i += 2;
        }
      }
    }
  }

  // Fallback item if no line items parsed
  if (items.length === 0) {
    items.push({
      name: "Food Delivery Item(s)",
      quantity: 1,
      price: 0,
      unitPrice: 0,
      cuisine: categorizeSwiggyItem(restaurantName),
    });
  }

  const itemCount = items.reduce((sum, it) => sum + it.quantity, 0);
  const uniqueItemCount = items.length;
  const itemBill = items.reduce((sum, it) => sum + it.price, 0);

  // 9. Extract Fees, Discounts & Grand Total
  let packagingFee = 0;
  const packMatch =
    cleanText.match(/(?:Restaurant Packaging|Order Packing Charges)[^\d\n]*\n*₹\s*([\d,.]+)/i) ||
    cleanText.match(/(?:Restaurant Packaging|Order Packing Charges)[^\d\n]*₹\s*([\d,.]+)/i);
  if (packMatch) packagingFee = parseFloat(packMatch[1].replace(/,/g, "")) || 0;

  let platformFee = 0;
  const platMatch =
    cleanText.match(/Platform fee[^\d\n]*\n*₹\s*([\d,.]+)/i) ||
    cleanText.match(/Platform fee[^\d\n]*₹\s*([\d,.]+)/i);
  if (platMatch) platformFee = parseFloat(platMatch[1].replace(/,/g, "")) || 0;

  let deliveryFee = 0;
  const delivFeeMatch =
    cleanText.match(/(?:Delivery Fee|Delivery partner fee)[^\d\nFREE]*\n*₹\s*([\d,.]+)/i) ||
    cleanText.match(/(?:Delivery Fee|Delivery partner fee)[^\d\nFREE]*₹\s*([\d,.]+)/i);
  if (delivFeeMatch) deliveryFee = parseFloat(delivFeeMatch[1].replace(/,/g, "")) || 0;

  let taxes = 0;
  const taxesMatch =
    cleanText.match(/Taxes[^\d\n]*\n*₹\s*([\d,.]+)/i) ||
    cleanText.match(/Taxes[^\d\n]*₹\s*([\d,.]+)/i);
  if (taxesMatch) taxes = parseFloat(taxesMatch[1].replace(/,/g, "")) || 0;

  let discount = 0;
  let couponCode: string | null = null;
  const couponMatch =
    cleanText.match(/Discount Applied\s*\(([^)]+)\)/i) ||
    cleanText.match(/saved with\s*([A-Z0-9_-]+)\s*coupon/i);
  if (couponMatch) {
    couponCode = couponMatch[1].trim();
  }

  const discMatch =
    cleanText.match(/Discount Applied[^\d\n]*\n*[-–]?\s*₹?\s*([\d,.]+)/i) ||
    cleanText.match(/Discount Applied[^\d\n]*[-–]?\s*₹?\s*([\d,.]+)/i) ||
    cleanText.match(/₹([\d,.]+)\s*saved on this order/i);
  if (discMatch) discount = parseFloat(discMatch[1].replace(/,/g, "")) || 0;

  let tip = 0;
  const tipMatch =
    cleanText.match(/Delivery Partner Tip[^\d\n]*\n*₹\s*([\d,.]+)/i) ||
    cleanText.match(/Delivery Partner Tip[^\d\n]*₹\s*([\d,.]+)/i);
  if (tipMatch) tip = parseFloat(tipMatch[1].replace(/,/g, "")) || 0;

  // Grand Total
  let grandTotal = 0;
  const totalMatch =
    cleanText.match(/Paid Via[^\n]*\n+₹\s*([\d,.]+)/i) ||
    cleanText.match(/(?:Order Total|Grand Total|Total Paid|Total Amount)\s*[:]?\s*\n*₹?\s*([\d,.]+)/i) ||
    cleanText.match(/Total\s*[:]?\s*\n*₹?\s*([\d,.]+)/i);

  if (totalMatch) {
    grandTotal = parseFloat(totalMatch[1].replace(/,/g, "")) || 0;
  }

  // Fallback if grand total regex missed
  if (grandTotal <= 0) {
    grandTotal = Math.max(
      0,
      itemBill + packagingFee + platformFee + deliveryFee + taxes + tip - discount
    );
  }

  // In case items price was 0 but grandTotal was extracted
  if (items.length === 1 && items[0].price === 0 && grandTotal > 0) {
    items[0].price = grandTotal;
    items[0].unitPrice = grandTotal;
  }

  return {
    id: orderId,
    orderId,
    userId,
    messageId,
    restaurantName,
    restaurantAddress,
    deliveryAddress,
    orderDate,
    orderTime,
    orderDateTime: isoDateTime,
    orderMonth,
    dayOfWeek,
    hourOfDay,
    deliveryDurationMinutes,
    deliveryStatus: "Delivered",
    items,
    itemCount,
    uniqueItemCount,
    itemBill: Math.round(itemBill * 100) / 100,
    packagingFee: Math.round(packagingFee * 100) / 100,
    deliveryFee: Math.round(deliveryFee * 100) / 100,
    platformFee: Math.round(platformFee * 100) / 100,
    taxes: Math.round(taxes * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    couponCode,
    tip: Math.round(tip * 100) / 100,
    grandTotal: Math.round(grandTotal * 100) / 100,
    currency: "INR",
    emailSubject: subject,
    emailDate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
