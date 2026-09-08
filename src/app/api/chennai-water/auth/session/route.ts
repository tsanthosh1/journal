import { NextResponse } from "next/server";
import { getChennaiWaterSession, clearChennaiWaterSession } from "@/lib/chennaiWater/storage";

export async function GET() {
  try {
    const session = await getChennaiWaterSession();
    return NextResponse.json({
      success: true,
      session,
      isAuthenticated: Boolean(session?.token),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearChennaiWaterSession();
    return NextResponse.json({ success: true, message: "Disconnected CMWSSB session." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
