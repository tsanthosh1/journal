import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse } from "@/lib/serverAuth";
import { getApartmentSession } from "@/lib/apartment/storage";
import { fetchReceiptPdfResponse } from "@/lib/apartment/client";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const receiptType = (searchParams.get("type") || "invoice").toLowerCase() as "invoice" | "receipt";

    const session = await getApartmentSession();
    const token = session?.swappedToken || session?.baseToken;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Not authenticated." },
        { status: 401 },
      );
    }

    const upstream = await fetchReceiptPdfResponse(token, id, receiptType);

    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, error: `Document unavailable (HTTP ${upstream.status})` },
        { status: upstream.status },
      );
    }

    const pdfBuffer = await upstream.arrayBuffer();
    const filename = `${receiptType.toUpperCase()}_${id}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": pdfBuffer.byteLength.toString(),
      },
    });
  } catch (err: any) {
    console.error("Error in GET /api/apartment/receipts/[id]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to download receipt PDF" },
      { status: 500 },
    );
  }
}
