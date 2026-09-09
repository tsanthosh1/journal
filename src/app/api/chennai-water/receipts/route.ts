import { NextRequest, NextResponse } from "next/server";
import { getStoredReceipts, getChennaiWaterSession, saveReceipts, INITIAL_PROPERTY_SEED } from "@/lib/chennaiWater/storage";
import { fetchReceipts } from "@/lib/chennaiWater/client";
import { isAuthorizedUser, unauthorizedResponse } from "@/lib/serverAuth";

export async function GET(req: NextRequest) {
  if (!isAuthorizedUser(req)) {
    return unauthorizedResponse("Authentication required to access water receipts", {
      receipts: [],
      count: 0,
    });
  }

  try {
    const session = await getChennaiWaterSession();
    const activePropertyId = session?.activePropertyId || INITIAL_PROPERTY_SEED.id;

    let receipts = await getStoredReceipts(activePropertyId);

    // If live session token is available, attempt real-time sync
    if (session?.token && activePropertyId) {
      try {
        const liveRes = await fetchReceipts(activePropertyId, session.token);
        if (liveRes.receipts.length > 0) {
          receipts = liveRes.receipts;
          await saveReceipts(receipts);
        }
      } catch (err: any) {
        console.warn("Could not fetch real-time receipts from CMWSSB:", err.message);
      }
    }

    return NextResponse.json({
      success: true,
      receipts,
      count: receipts.length,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
