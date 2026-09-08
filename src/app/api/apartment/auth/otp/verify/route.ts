import { NextRequest, NextResponse } from "next/server";
import {
  verifyHomefyOtp,
  fetchApartments,
  swapFlatToken,
} from "@/lib/apartment/client";
import { getApartmentSession, saveApartmentSession } from "@/lib/apartment/storage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, otpToken, mobile } = body;

    const session = await getApartmentSession();
    const tokenToUse = otpToken || session?.otpToken;
    const mobileToUse = mobile || session?.mobile;

    if (!code || !code.trim()) {
      return NextResponse.json(
        { success: false, error: "OTP code is required." },
        { status: 400 },
      );
    }

    if (!tokenToUse) {
      return NextResponse.json(
        { success: false, error: "OTP session token not found. Please request an OTP first." },
        { status: 400 },
      );
    }

    const verifyRes = await verifyHomefyOtp(tokenToUse, code, mobileToUse || "user");
    if (!verifyRes.success || !verifyRes.accessToken) {
      return NextResponse.json(
        { success: false, error: verifyRes.error || "OTP verification failed. Please check the code." },
        { status: 400 },
      );
    }

    const baseToken = verifyRes.accessToken;

    // Discover apartments & flats
    const apartments = await fetchApartments(baseToken);

    let chosenRequestId: string | undefined;
    let chosenMeta: Record<string, string | undefined> = {};

    for (const apt of apartments) {
      for (const req of apt.requests || []) {
        const flat = req.flat;
        const block = flat?.block?.blockName || "";
        const flatNo = flat?.flatNumber || "";
        const flatStr = block ? `${block}-${flatNo}` : flatNo;

        if (!chosenRequestId && req.accessStatus === "APPROVED") {
          chosenRequestId = req.id;
          chosenMeta = {
            apartmentId: apt.id,
            apartmentName: apt.name,
            flatNumber: flatStr,
            blockName: block,
            role: req.roleType,
          };
        }
      }
    }

    // Fallback to first available request
    if (!chosenRequestId && apartments.length > 0 && apartments[0].requests?.length > 0) {
      const firstReq = apartments[0].requests[0];
      chosenRequestId = firstReq.id;
      const flat = firstReq.flat;
      const block = flat?.block?.blockName || "";
      const flatNo = flat?.flatNumber || "";
      chosenMeta = {
        apartmentId: apartments[0].id,
        apartmentName: apartments[0].name,
        flatNumber: block ? `${block}-${flatNo}` : flatNo,
        blockName: block,
        role: firstReq.roleType,
      };
    }

    let swappedToken: string | undefined;
    if (chosenRequestId) {
      const swapRes = await swapFlatToken(chosenRequestId, baseToken);
      if (swapRes.swappedToken) {
        swappedToken = swapRes.swappedToken;
      }
    }

    const saved = await saveApartmentSession({
      mobile: mobileToUse || "",
      baseToken,
      swappedToken,
      activeRequestId: chosenRequestId,
      apartmentId: chosenMeta.apartmentId,
      apartmentName: chosenMeta.apartmentName,
      flatNumber: chosenMeta.flatNumber,
      blockName: chosenMeta.blockName,
      role: chosenMeta.role,
    });

    return NextResponse.json({
      success: true,
      message: "Authentication successful! Flat context activated.",
      session: {
        mobile: saved.mobile,
        apartmentName: saved.apartmentName,
        flatNumber: saved.flatNumber,
        role: saved.role,
        hasToken: Boolean(saved.swappedToken || saved.baseToken),
      },
      apartments,
    });
  } catch (err: any) {
    console.error("Error in /api/apartment/auth/otp/verify:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to verify OTP" },
      { status: 500 },
    );
  }
}
