import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";
import {
  getAmazonOrders,
  deleteAmazonOrder,
  clearAllAmazonOrders,
} from "@/lib/amazon/storage";
import { AmazonOrderFilter } from "@/lib/amazon/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedUser(request))) {
    return unauthorizedResponse("Authentication required to access Amazon orders");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") || undefined;
    const recipient = searchParams.get("recipient") || undefined;
    const type = (searchParams.get("type") as AmazonOrderFilter["type"]) || undefined;
    const search = searchParams.get("search") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const { orders, total } = await getAmazonOrders(userId, {
      month,
      recipient,
      type,
      search,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      orders,
      total,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("GET /api/amazon/orders error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch orders" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAuthorizedUser(request))) {
    return unauthorizedResponse("Authentication required to delete Amazon orders");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    const { searchParams } = new URL(request.url);
    const clearAll = searchParams.get("all") === "true";
    const orderId = searchParams.get("orderId");

    if (clearAll) {
      const deletedCount = await clearAllAmazonOrders(userId);
      return NextResponse.json({
        success: true,
        message: `Cleared ${deletedCount} Amazon orders.`,
      });
    }

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "Missing orderId query parameter" },
        { status: 400 },
      );
    }

    await deleteAmazonOrder(userId, orderId);
    return NextResponse.json({
      success: true,
      message: `Deleted Amazon order ${orderId}.`,
    });
  } catch (error: any) {
    console.error("DELETE /api/amazon/orders error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete order" },
      { status: 500 },
    );
  }
}
