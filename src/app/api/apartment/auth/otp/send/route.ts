import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";
import { sendHomefyOtp } from "@/lib/apartment/client";
import { saveApartmentSession } from "@/lib/apartment/storage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse();
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const body = await request.json();
    const { mobile, countryCode = "+91" } = body;

    if (!mobile || !mobile.trim()) {
      return NextResponse.json(
        { success: false, error: "Mobile number is required." },
        { status: 400 },
      );
    }

    const cleanMobile = mobile.trim().replace(/\D/g, "");
    const formattedCode = countryCode.startsWith("+") ? countryCode : `+${countryCode}`;

    const res = await sendHomefyOtp(cleanMobile, formattedCode);

    if (!res.success || !res.token) {
      return NextResponse.json(
        { success: false, error: res.error || "Failed to send OTP." },
        { status: 400 },
      );
    }

    // Persist OTP token and phone number in session
    await saveApartmentSession({
      mobile: cleanMobile,
      countryCode: formattedCode,
      otpToken: res.token,
    }, verifiedUserId);

    return NextResponse.json({
      success: true,
      message: `OTP sent successfully to ${formattedCode} ${cleanMobile}. Valid for 5 minutes.`,
      otpToken: res.token,
    });
  } catch (err: any) {
    console.error("Error in /api/apartment/auth/otp/send:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to send OTP" },
      { status: 500 },
    );
  }
}
