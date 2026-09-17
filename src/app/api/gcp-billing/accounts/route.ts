import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";
import {
  getGcpBillingConfigs,
  saveGcpBillingConfig,
  deleteGcpBillingConfig,
} from "@/lib/gcpBilling/storage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse("Authentication required to access cloud billing configurations");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    const configs = await getGcpBillingConfigs(userId);
    return NextResponse.json({ success: true, configs });
  } catch (error: any) {
    console.error("GET /api/gcp-billing/accounts error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch cloud billing configurations" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse("Authentication required to save cloud billing configuration");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    const body = await request.json().catch(() => ({}));
    const { name, projectId, datasetId, tableId, location, currency, billingAccountId, isDefault, id } = body;

    if (!name || !projectId || !datasetId || !tableId) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: name, projectId, datasetId, tableId" },
        { status: 400 },
      );
    }

    const saved = await saveGcpBillingConfig(userId, {
      id,
      name,
      projectId,
      datasetId,
      tableId,
      location: location || "asia-south1",
      currency: currency || "INR",
      billingAccountId,
      isDefault: Boolean(isDefault),
    });

    return NextResponse.json({ success: true, config: saved });
  } catch (error: any) {
    console.error("POST /api/gcp-billing/accounts error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save cloud billing configuration" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse("Authentication required to delete cloud billing configuration");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    const { searchParams } = new URL(request.url);
    const configId = searchParams.get("id");

    if (!configId) {
      return NextResponse.json(
        { success: false, error: "Missing config ID query parameter (?id=...)" },
        { status: 400 },
      );
    }

    await deleteGcpBillingConfig(userId, configId);
    return NextResponse.json({ success: true, deletedId: configId });
  } catch (error: any) {
    console.error("DELETE /api/gcp-billing/accounts error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete cloud billing configuration" },
      { status: 500 },
    );
  }
}
