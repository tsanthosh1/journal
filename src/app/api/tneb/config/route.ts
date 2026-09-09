import { NextRequest, NextResponse } from "next/server";
import { getTnebConfig, saveTnebConfig } from "@/lib/tneb/storage";
import { TnebConfig } from "@/lib/tneb/types";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse("Authentication required to view TNEB config");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const config = await getTnebConfig(verifiedUserId || undefined);
    return NextResponse.json({
      success: true,
      config,
    });
  } catch (error: any) {
    console.error("Error fetching TNEB config:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch TNEB config" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse("Authentication required to update TNEB config");
  }

  try {
    const body = (await request.json()) as Partial<TnebConfig>;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid configuration payload" },
        { status: 400 },
      );
    }

    const verifiedUserId = await getVerifiedUserId(request);
    const updated = await saveTnebConfig(body, verifiedUserId || undefined);
    return NextResponse.json({
      success: true,
      message: "TNEB Configuration updated successfully",
      config: updated,
    });
  } catch (error: any) {
    console.error("Error saving TNEB config:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save TNEB config" },
      { status: 500 },
    );
  }
}
