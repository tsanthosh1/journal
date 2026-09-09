import { NextRequest, NextResponse } from "next/server";
import { getAllTnebAccounts } from "@/lib/tneb/storage";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse("Authentication required to access electricity accounts", {
      count: 0,
      accounts: [],
    });
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const accounts = await getAllTnebAccounts(verifiedUserId || undefined);
    return NextResponse.json({
      success: true,
      count: accounts.length,
      accounts,
    });
  } catch (error: any) {
    console.error("Error fetching TNEB accounts:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch accounts" },
      { status: 500 },
    );
  }
}
