import { NextRequest, NextResponse } from "next/server";
import { parseTnebServiceDetailsHtml } from "@/lib/tneb/parser";
import { saveTnebAccountAndBills } from "@/lib/tneb/storage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let rawHtml = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (file) {
        rawHtml = await file.text();
      } else {
        rawHtml = (formData.get("html") as string) || "";
      }
    } else {
      const body = await request.json();
      rawHtml = body.html || "";
    }

    if (!rawHtml || !rawHtml.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing HTML content or file" },
        { status: 400 },
      );
    }

    const { account, bills } = parseTnebServiceDetailsHtml(rawHtml);

    if (!account.consumerNumber || account.consumerNumber === "UNKNOWN") {
      return NextResponse.json(
        { success: false, error: "Could not detect TNEB Consumer Number from provided HTML" },
        { status: 422 },
      );
    }

    const saved = await saveTnebAccountAndBills(account, bills);

    return NextResponse.json({
      success: true,
      message: `Successfully imported TNEB Account #${account.consumerNumber} with ${saved.billsSavedCount} billing records`,
      account,
      billsCount: saved.billsSavedCount,
      bills,
    });
  } catch (error: any) {
    console.error("Error importing TNEB HTML:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to import TNEB HTML" },
      { status: 500 },
    );
  }
}
