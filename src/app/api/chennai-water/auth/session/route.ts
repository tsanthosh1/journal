import { NextRequest, NextResponse } from "next/server";
import { getChennaiWaterSession, clearChennaiWaterSession } from "@/lib/chennaiWater/storage";
import { isAuthorizedUser, unauthorizedResponse } from "@/lib/serverAuth";

export async function GET(req: NextRequest) {
  if (!await isAuthorizedUser(req)) {
    return unauthorizedResponse("Authentication required", {
      success: true,
      session: null,
      isAuthenticated: false,
    });
  }

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

export async function DELETE(req: NextRequest) {
  if (!await isAuthorizedUser(req)) {
    return unauthorizedResponse("Authentication required to disconnect session");
  }
  try {
    await clearChennaiWaterSession();
    return NextResponse.json({ success: true, message: "Disconnected CMWSSB session." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
