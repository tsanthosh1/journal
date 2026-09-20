import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";
import { parseAmazonOrdersJson } from "@/lib/amazon/jsonParser";
import { storeAmazonOrders } from "@/lib/amazon/storage";

export const dynamic = "force-dynamic";

/**
 * Legacy endpoint maintained for compatibility.
 * Redirects payload to JSON parser.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthorizedUser(request))) {
    return unauthorizedResponse("Authentication required to import Amazon orders");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    const body = await request.json().catch(() => ({}));
    const { jsonContent, jsonContents, csvContent, csvContents, truncateFirst } = body;

    const payload = jsonContents || jsonContent || csvContents || csvContent;
    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Missing JSON payload. CSV format has been deprecated in favor of Amazon JSON exports." },
        { status: 400 },
      );
    }

    const contents = Array.isArray(payload) ? payload : [payload];
    const allParsedOrders = [];
    let duplicatesInSource = 0;
    const allDuplicateIds: string[] = [];

    for (const c of contents) {
      const parsed = parseAmazonOrdersJson(c);
      allParsedOrders.push(...parsed.orders);
      duplicatesInSource += parsed.duplicatesInSource;
      allDuplicateIds.push(...parsed.duplicateOrderIds);
    }

    const result = await storeAmazonOrders(userId, allParsedOrders, {
      duplicatesInSource,
      duplicateOrderIds: allDuplicateIds,
      truncateBeforeStore: Boolean(truncateFirst),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process Amazon order import" },
      { status: 500 },
    );
  }
}
