import { NextRequest, NextResponse } from "next/server";
import { getChennaiWaterSession, clearChennaiWaterSession } from "@/lib/chennaiWater/storage";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";

export async function GET(req: NextRequest) {
  if (!await isAuthorizedUser(req)) {
    return unauthorizedResponse("Authentication required", {
      success: true,
      session: null,
      isAuthenticated: false,
    });
  }

  try {
    const verifiedUserId = await getVerifiedUserId(req);
    const session = await getChennaiWaterSession(verifiedUserId);
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
    const verifiedUserId = await getVerifiedUserId(req);
    await clearChennaiWaterSession(verifiedUserId);
    return NextResponse.json({ success: true, message: "Disconnected CMWSSB session." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
