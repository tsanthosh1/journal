import {
  InstamartCategory,
  InstamartItem,
  InstamartOrder,
} from "./types";

/**
 * Intelligent categorization for grocery items based on common keywords
 */
export function categorizeInstamartItem(itemName: string): InstamartCategory {
  const lower = itemName.toLowerCase();

  // Baby & Child Care
  if (
    /pampers|diaper|wipes|baby|mamy poko|huggies|cerelac|lactogen|johnson/i.test(
      lower
    )
  ) {
    return "Baby & Child Care";
  }

  // Dairy, Bread & Eggs
  if (
    /curd|dahi|milk|paneer|butter|cheese|ghee|yogurt|lassi|egg|bread|pav|bun|chaas/i.test(
      lower
    )
  ) {
    return "Dairy, Bread & Eggs";
  }

  // Instant Food & Noodles
  if (
    /slurrp|millet noodles|noodle|maggi|pasta|ramen|soup|instant|ready to eat|oats|muesli|corn flakes/i.test(
      lower
    )
  ) {
    return "Instant Food & Noodles";
  }

  // Vegetables & Fruits
  if (
    /tomato|thakkali|onion|vengayam|potato|urulaikizhangu|carrot|cabbage|kosu|brinjal|katrikkai|capsicum|chilli|ginger|garlic|coriander|pudhina|mint|spinach|keerai|banana|apple|mango|coconut|flower|chow chow|beans|gourd|cucumber|lemon|peas|bhendi|lady'?s finger|avocado|beetroot|papaya|orange|grape|pomegranate|corn|cholam/i.test(
      lower
    )
  ) {
    return "Vegetables & Fruits";
  }

  // Beverages & Drinks
  if (
    /tea|chai|coffee|juice|water|soda|coke|pepsi|sprite|bournvita|horlicks|squash|syrup|energy drink|coconut water/i.test(
      lower
    )
  ) {
    return "Beverages & Drinks";
  }

  // Snacks & Munchies
  if (
    /snack|chips|mixture|murukku|namkeen|biscuit|cookie|chocolate|candy|wafer|nachos|popcorn|roasted|nuts|peanut|almond|cashew|raisin/i.test(
      lower
    )
  ) {
    return "Snacks & Munchies";
  }

  // Pantry & Cooking Essentials
  if (
    /oil|atta|flour|rice|dal|sugar|salt|masala|spice|powder|mustard|jeera|cumin|fenugreek|turmeric|tamarind|pulses|rava|sooji|besan|maida|sauce|ketchup|vinegar|honey/i.test(
      lower
    )
  ) {
    return "Pantry & Cooking Essentials";
  }

  // Personal Care & Grooming
  if (
    /soap|shampoo|conditioner|face wash|toothpaste|brush|lotion|cream|deodorant|perfume|shaving|razor|cotton/i.test(
      lower
    )
  ) {
    return "Personal Care & Grooming";
  }

  // Household & Cleaning
  if (
    /detergent|dishwash|vim|surf|ariel|comfort|harpic|lizol|floor cleaner|scrubber|garbage bag|foil|wrap|mosquito|repellent|broom|tissue|toilet paper/i.test(
      lower
    )
  ) {
    return "Household & Cleaning";
  }

  return "Other";
}

function cleanHtmlText(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses Swiggy Instamart order delivery confirmation emails across all generations
 */
export function parseInstamartEmail(params: {
  userId: string;
  messageId: string;
  subject: string;
  from: string;
  emailDate: string;
  internalDate?: string;
  bodyHtml: string;
  bodyText?: string;
}): InstamartOrder | null {
  const {
    userId,
    messageId,
    subject,
    emailDate,
    internalDate,
    bodyHtml,
    bodyText = "",
  } = params;

  // 1. Extract Order ID
  let orderId = "";
  const orderIdMatch =
    bodyHtml.match(/order id:\s*(?:<[^>]+>)*\s*(\d{10,25})/i) ||
    bodyText.match(/order id\s*[:#-]?\s*(\d{10,25})/i) ||
    subject.match(/#(\d{10,25})/);

  if (orderIdMatch) {
    orderId = orderIdMatch[1];
  } else {
    // Fallback: search for any standalone 15-digit order id
    const standaloneMatch = bodyHtml.match(/\b(24\d{13}|18\d{13}|17\d{13}|16\d{13}|20\d{13})\b/);
    if (standaloneMatch) {
      orderId = standaloneMatch[1];
    }
  }

  if (!orderId) {
    return null; // Not a recognized valid Instamart order
  }

  // 2. Parse Date and Time
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

  // 3. Extract Delivery Address
  let deliveryAddress = "";
  const addressMatch =
    bodyHtml.match(/Deliver To:\s*<\/td>[\s\S]*?<td[^>]*style=[^>]*font-weight:\s*normal[^>]*>([\s\S]*?)<\/td>/i) ||
    bodyHtml.match(/Deliver To:[\s\S]*?<tr>\s*<td[^>]*height=['"]5['"][^>]*>[\s\S]*?<\/tr>\s*<tr>\s*<td[^>]*>([\s\S]*?)<\/td>/i) ||
    bodyHtml.match(/Deliver To:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i);
  if (addressMatch) {
    const rawAddr = cleanHtmlText(addressMatch[1].replace(/<[^>]+>/g, " "));
    if (rawAddr && rawAddr.length > 5 && !rawAddr.toLowerCase().includes("order items")) {
      deliveryAddress = rawAddr;
    }
  }

  // 4. Extract Line Items
  const items: InstamartItem[] = [];
  // Standard Instamart row: <td ...>(\d+)\s*x\s*([^<]+)</td> ... ₹([\d,.]+)
  const itemRowRegex =
    /<td[^>]*>\s*(\d+)\s*x\s*([^<]+)<\/td>\s*<td[^>]*>(?:<[^>]+>)*\s*[₹Rs.]*\s*([\d,.]+)/gi;

  let match: RegExpExecArray | null;
  while ((match = itemRowRegex.exec(bodyHtml)) !== null) {
    const quantity = parseInt(match[1], 10) || 1;
    const rawName = cleanHtmlText(match[2]);
    const priceStr = match[3].replace(/,/g, "");
    const price = parseFloat(priceStr) || 0;

    if (rawName && !rawName.toLowerCase().includes("item bill")) {
      items.push({
        name: rawName,
        quantity,
        price,
        unitPrice: Math.round((price / quantity) * 100) / 100,
        category: categorizeInstamartItem(rawName),
      });
    }
  }

  // 5. Extract Fees & Totals
  const parseAmount = (regex: RegExp): number => {
    const m = bodyHtml.match(regex);
    if (!m) return 0;
    const num = parseFloat(m[1].replace(/,/g, ""));
    return isNaN(num) ? 0 : num;
  };

  const itemBill = parseAmount(
    /Item Bill\s*<\/td>\s*<td[^>]*>(?:<[^>]+>)*\s*[₹Rs.]*\s*([\d,.]+)/i
  );
  const handlingFee = parseAmount(
    /Handling Fee\s*<\/td>\s*<td[^>]*>(?:<[^>]+>)*\s*[₹Rs.]*\s*([\d,.]+)/i
  );
  const deliveryFee = parseAmount(
    /(?:Delivery Partner Fee|Delivery Fee)\s*<\/td>\s*<td[^>]*>(?:<[^>]+>)*\s*[₹Rs.]*\s*([\d,.]+)/i
  );
  const discount = parseAmount(
    /(?:Discount|Coupon Discount)\s*<\/td>\s*<td[^>]*>(?:<[^>]+>)*\s*[₹Rs.-]*\s*([\d,.]+)/i
  );
  const tip = parseAmount(
    /(?:Delivery Tip|Tip)\s*<\/td>\s*<td[^>]*>(?:<[^>]+>)*\s*[₹Rs.]*\s*([\d,.]+)/i
  );

  let grandTotal = parseAmount(
    /Grand Total\s*<\/td>\s*<td[^>]*>(?:<[^>]+>)*\s*[₹Rs.]*\s*([\d,.]+)/i
  );

  if (grandTotal === 0) {
    grandTotal = parseAmount(
      /Total (?:Paid|Amount)\s*<\/td>\s*<td[^>]*>(?:<[^>]+>)*\s*[₹Rs.]*\s*([\d,.]+)/i
    );
  }

  // If grand total is still 0, sum items + fees
  if (grandTotal === 0) {
    const sumItems = items.reduce((acc, it) => acc + it.price, 0);
    grandTotal = sumItems + handlingFee + deliveryFee + tip - discount;
  }

  const itemCount = items.reduce((acc, it) => acc + it.quantity, 0);

  return {
    id: orderId,
    orderId,
    userId,
    messageId,
    orderDate,
    orderTime,
    orderDateTime: isoDateTime,
    orderMonth,
    dayOfWeek,
    hourOfDay,
    deliveryAddress,
    items,
    itemCount: itemCount > 0 ? itemCount : 1,
    uniqueItemCount: items.length,
    itemBill: itemBill > 0 ? itemBill : grandTotal - handlingFee - deliveryFee,
    handlingFee,
    deliveryFee,
    discount,
    tip,
    grandTotal,
    currency: "INR",
    emailSubject: subject,
    emailDate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
