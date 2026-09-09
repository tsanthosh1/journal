import { NextRequest, NextResponse } from "next/server";
import { getTnebAccount, getTnebBillsForConsumer } from "@/lib/tneb/storage";
import { isAuthorizedUser, unauthorizedResponse } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ consumerNumber: string }> },
) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse("Authentication required to view electricity bills", {
      count: 0,
      bills: [],
    });
  }

  try {
    const { consumerNumber } = await params;
    if (!consumerNumber) {
      return NextResponse.json({ success: false, error: "Missing consumerNumber" }, { status: 400 });
    }

    const [account, bills] = await Promise.all([
      getTnebAccount(consumerNumber),
      getTnebBillsForConsumer(consumerNumber),
    ]);

    return NextResponse.json({
      success: true,
      consumerNumber,
      account,
      count: bills.length,
      bills,
    });
  } catch (error: any) {
    console.error("Error fetching TNEB bills:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch bills" },
      { status: 500 },
    );
  }
}
