import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";
import { parseAmazonOrdersJson } from "@/lib/amazon/jsonParser";
import { storeAmazonOrders } from "@/lib/amazon/storage";
import { syncKindleUnlimitedSubscription } from "@/lib/amazon/subscriptionBridge";
import { AmazonOrder } from "@/lib/amazon/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await isAuthorizedUser(request))) {
    return unauthorizedResponse("Authentication required to import Amazon order history");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    const body = await request.json().catch(() => ({}));
    const { jsonContent, jsonContents, truncateFirst } = body;

    const contents: any[] = Array.isArray(jsonContents)
      ? jsonContents
      : jsonContent != null
      ? [jsonContent]
      : [];

    if (contents.length === 0) {
      return NextResponse.json(
        { success: false, error: "Missing jsonContent or jsonContents in request body" },
        { status: 400 },
      );
    }

    const allParsedOrders: AmazonOrder[] = [];
    const allDuplicateIds: string[] = [];
    let totalDuplicatesInSource = 0;
    let totalRows = 0;
    const parseErrors: string[] = [];

    for (let i = 0; i < contents.length; i++) {
      try {
        const parseResult = parseAmazonOrdersJson(contents[i]);
        allParsedOrders.push(...parseResult.orders);
        totalRows += parseResult.totalRows;
        totalDuplicatesInSource += parseResult.duplicatesInSource;
        allDuplicateIds.push(...parseResult.duplicateOrderIds);
      } catch (err: any) {
        parseErrors.push(`File #${i + 1}: ${err.message || "Parse error"}`);
      }
    }

    if (allParsedOrders.length === 0 && parseErrors.length > 0) {
      return NextResponse.json(
        { success: false, error: parseErrors.join("; ") },
        { status: 400 },
      );
    }

    // Upsert into Firestore with duplicate detection and optional truncation
    const importResult = await storeAmazonOrders(userId, allParsedOrders, {
      duplicatesInSource: totalDuplicatesInSource,
      duplicateOrderIds: allDuplicateIds,
      truncateBeforeStore: Boolean(truncateFirst),
    });

    // Auto-sync Kindle Unlimited subscription if Kindle orders were present
    let kindleSyncResult = null;
    if (importResult.kindleOrdersCount > 0) {
      try {
        kindleSyncResult = await syncKindleUnlimitedSubscription(userId);
      } catch (subErr) {
        console.warn("Could not auto-sync Kindle subscription:", subErr);
      }
    }

    return NextResponse.json({
      success: true,
      ...importResult,
      totalRows,
      kindleSubscriptionSynced: Boolean(kindleSyncResult),
      warnings: parseErrors.length > 0 ? parseErrors : undefined,
    });
  } catch (error: any) {
    console.error("POST /api/amazon/import error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to import Amazon orders JSON" },
      { status: 500 },
    );
  }
}
