import { NextResponse } from "next/server";
import { getAllTnebAccounts } from "@/lib/tneb/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const accounts = await getAllTnebAccounts();
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
