import { NextRequest, NextResponse } from "next/server";
import { getApartmentSession } from "@/lib/apartment/storage";
import { fetchHomefyBillDetail } from "@/lib/apartment/client";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Bill ID is required." },
        { status: 400 },
      );
    }

    const session = await getApartmentSession();
    const token = session?.swappedToken || session?.baseToken;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Not authenticated." },
        { status: 401 },
      );
    }

    const bill = await fetchHomefyBillDetail(token, id);
    if (!bill) {
      return NextResponse.json(
        { success: false, error: `Bill '${id}' not found.` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      bill,
    });
  } catch (err: any) {
    console.error("Error in GET /api/apartment/bills/[id]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch bill detail" },
      { status: 500 },
    );
  }
}
