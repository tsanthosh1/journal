import { NextRequest, NextResponse } from "next/server";
import {
  isAuthorizedUser,
  unauthorizedResponse,
  getVerifiedUser,
} from "@/lib/serverAuth";
import { getSwiggySummary } from "@/lib/swiggy/storage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedUser(request))) {
    return unauthorizedResponse(
      "Authentication required to access Swiggy summary"
    );
  }

  try {
    const verifiedUser = await getVerifiedUser(request);
    const userId = verifiedUser?.email || verifiedUser?.primaryUserId || "default_user";

    const summary = await getSwiggySummary(userId);
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error("Error fetching Swiggy summary:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to compute summary" },
      { status: 500 }
    );
  }
}
