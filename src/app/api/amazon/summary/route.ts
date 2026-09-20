import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";
import { getAmazonSummary } from "@/lib/amazon/storage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedUser(request))) {
    return unauthorizedResponse("Authentication required to access Amazon order summary");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    const summary = await getAmazonSummary(userId);
    return NextResponse.json({ success: true, summary });
  } catch (error: any) {
    console.error("GET /api/amazon/summary error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch Amazon summary" },
      { status: 500 },
    );
  }
}
