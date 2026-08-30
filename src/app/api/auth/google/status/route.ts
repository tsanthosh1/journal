import { NextRequest, NextResponse } from "next/server";
import { disconnectGmail, getValidGmailToken } from "@/lib/gmail/oauth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "default_user";

    const token = await getValidGmailToken(userId);

    return NextResponse.json({
      connected: !!token,
      email: token?.email,
      lastSyncAt: token?.lastSyncAt,
    });
  } catch (error) {
    console.error("GET /api/auth/google/status error:", error);
    return NextResponse.json(
      { connected: false, error: (error as Error).message },
      { status: 200 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "default_user";

    await disconnectGmail(userId);
    return NextResponse.json({ success: true, disconnected: true });
  } catch (error) {
    console.error("DELETE /api/auth/google/status error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
