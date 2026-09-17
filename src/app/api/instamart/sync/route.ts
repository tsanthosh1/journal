import { NextRequest, NextResponse } from "next/server";
import {
  isAuthorizedUser,
  unauthorizedResponse,
  getVerifiedUser,
} from "@/lib/serverAuth";
import { syncInstamartOrders } from "@/lib/instamart/sync";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await isAuthorizedUser(request))) {
    return unauthorizedResponse(
      "Authentication required to sync Instamart orders"
    );
  }

  try {
    const verifiedUser = await getVerifiedUser(request);
    const userId = verifiedUser?.email || verifiedUser?.primaryUserId || "default_user";

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is allowed
    }

    const maxResults = typeof body.maxResults === "number" ? body.maxResults : 50;
    const fullSync = Boolean(body.fullSync);

    const result = await syncInstamartOrders(userId, {
      maxResults,
      fullSync,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error syncing Instamart orders:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to sync orders" },
      { status: 500 }
    );
  }
}
