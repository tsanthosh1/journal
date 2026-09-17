import { NextRequest, NextResponse } from "next/server";
import {
  isAuthorizedUser,
  unauthorizedResponse,
  getVerifiedUser,
} from "@/lib/serverAuth";
import {
  getInstamartOrders,
  deleteInstamartOrder,
} from "@/lib/instamart/storage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedUser(request))) {
    return unauthorizedResponse("Authentication required to access Instamart orders");
  }

  try {
    const verifiedUser = await getVerifiedUser(request);
    const userId = verifiedUser?.email || verifiedUser?.primaryUserId || "default_user";

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") || undefined;
    const search = searchParams.get("search") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const result = await getInstamartOrders(userId, {
      month,
      search,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error fetching Instamart orders:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAuthorizedUser(request))) {
    return unauthorizedResponse("Authentication required to delete Instamart order");
  }

  try {
    const verifiedUser = await getVerifiedUser(request);
    const userId = verifiedUser?.email || verifiedUser?.primaryUserId || "default_user";

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId");

    if (!orderId) {
      return NextResponse.json(
        { error: "orderId is required" },
        { status: 400 }
      );
    }

    await deleteInstamartOrder(userId, orderId);
    return NextResponse.json({ success: true, deletedOrderId: orderId });
  } catch (error: any) {
    console.error("Error deleting Instamart order:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to delete order" },
      { status: 500 }
    );
  }
}
