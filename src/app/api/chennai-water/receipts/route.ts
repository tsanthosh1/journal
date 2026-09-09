import { NextRequest, NextResponse } from "next/server";
import { getStoredReceipts, getChennaiWaterSession, saveReceipts } from "@/lib/chennaiWater/storage";
import { fetchReceipts } from "@/lib/chennaiWater/client";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";

export async function GET(req: NextRequest) {
  if (!await isAuthorizedUser(req)) {
    return unauthorizedResponse("Authentication required to access water receipts", {
      receipts: [],
      count: 0,
    });
  }

  try {
    const verifiedUserId = await getVerifiedUserId(req);
    const session = await getChennaiWaterSession(verifiedUserId);
    const activePropertyId = session?.activePropertyId;

    let receipts = activePropertyId
      ? await getStoredReceipts(activePropertyId, verifiedUserId)
      : await getStoredReceipts(undefined, verifiedUserId);

    // If live session token is available, attempt real-time sync
    if (session?.token && activePropertyId) {
      try {
        const liveRes = await fetchReceipts(activePropertyId, session.token);
        if (liveRes.receipts.length > 0) {
          receipts = liveRes.receipts;
          await saveReceipts(receipts, verifiedUserId);
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
