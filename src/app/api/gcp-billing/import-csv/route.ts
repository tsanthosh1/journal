import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";
import { parseGcpCostTableCsv } from "@/lib/gcpBilling/csvParser";
import {
  saveGcpHistoricalInvoice,
  getGcpHistoricalInvoices,
  deleteGcpHistoricalInvoice,
} from "@/lib/gcpBilling/historicalStorage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse("Authentication required to access imported GCP invoices");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    const invoices = await getGcpHistoricalInvoices(userId);
    return NextResponse.json({ success: true, invoices });
  } catch (error: any) {
    console.error("GET /api/gcp-billing/import-csv error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch imported invoices" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse("Authentication required to import GCP billing CSV");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    const body = await request.json().catch(() => ({}));
    const { csvContent, csvContents } = body;

    // Handle batch of multiple CSV contents
    const contents: string[] = Array.isArray(csvContents)
      ? csvContents
      : csvContent && typeof csvContent === "string"
      ? [csvContent]
      : [];

    if (contents.length === 0) {
      return NextResponse.json(
        { success: false, error: "Missing csvContent or csvContents in request body" },
        { status: 400 }
      );
    }

    const imported = [];
    const errors = [];

    for (let i = 0; i < contents.length; i++) {
      const raw = contents[i];
      try {
        const parsed = parseGcpCostTableCsv(raw);
        if (!parsed.invoiceMonth) {
          errors.push(`File #${i + 1}: Could not identify invoice month from CSV.`);
          continue;
        }
        const saved = await saveGcpHistoricalInvoice(userId, parsed);
        imported.push(saved);
      } catch (err: any) {
        errors.push(`File #${i + 1}: ${err.message || "Parse error"}`);
      }
    }

    if (imported.length === 0 && errors.length > 0) {
      return NextResponse.json(
        { success: false, error: errors.join(" ") },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      count: imported.length,
      invoices: imported,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully imported ${imported.length} invoice${imported.length > 1 ? "s" : ""}: ${imported
        .map((inv) => `${inv.formattedMonth} (${inv.currency} ${inv.netCost.toFixed(2)})`)
        .join(", ")}`,
    });
  } catch (error: any) {
    console.error("POST /api/gcp-billing/import-csv error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to import GCP billing CSV" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse("Authentication required to delete imported GCP invoice");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    const { searchParams } = new URL(request.url);
    const invoiceMonth = searchParams.get("invoiceMonth");

    if (!invoiceMonth) {
      return NextResponse.json(
        { success: false, error: "Missing invoiceMonth parameter" },
        { status: 400 }
      );
    }

    await deleteGcpHistoricalInvoice(userId, invoiceMonth);
    return NextResponse.json({
      success: true,
      message: `Deleted invoice for ${invoiceMonth}`,
    });
  } catch (error: any) {
    console.error("DELETE /api/gcp-billing/import-csv error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete imported invoice" },
      { status: 500 }
    );
  }
}
