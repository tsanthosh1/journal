import { NextRequest, NextResponse } from "next/server";
import {
  getApartmentSession,
  saveApartmentSession,
  clearApartmentSession,
} from "@/lib/apartment/storage";
import {
  fetchApartments,
  swapFlatToken,
  fetchHomefyProfile,
} from "@/lib/apartment/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getApartmentSession();

    if (!session || (!session.swappedToken && !session.baseToken)) {
      return NextResponse.json({
        success: true,
        authenticated: false,
        session: null,
      });
    }

    // Attempt profile fetch to verify token validity
    let profile = null;
    const token = session.swappedToken || session.baseToken;
    if (token) {
      try {
        profile = await fetchHomefyProfile(token);
      } catch (e) {
        console.warn("Could not fetch profile with current token:", e);
      }
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      session: {
        mobile: session.mobile,
        countryCode: session.countryCode,
        apartmentId: session.apartmentId,
        apartmentName: session.apartmentName,
        flatNumber: session.flatNumber,
        blockName: session.blockName,
        role: session.role,
        activeRequestId: session.activeRequestId,
        updatedAt: session.updatedAt,
        hasToken: true,
      },
      profile,
    });
  } catch (err: any) {
    console.error("Error in GET /api/apartment/auth/session:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to retrieve session" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, mobile } = body;

    if (!token || !token.trim()) {
      return NextResponse.json(
        { success: false, error: "JWT token is required." },
        { status: 400 },
      );
    }

    const cleanToken = token.trim();

    // Discover apartments using this token
    const apartments = await fetchApartments(cleanToken);

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

    let swappedToken = cleanToken;
    if (chosenRequestId) {
      const swapRes = await swapFlatToken(chosenRequestId, cleanToken);
      if (swapRes.swappedToken) {
        swappedToken = swapRes.swappedToken;
      }
    }

    const saved = await saveApartmentSession({
      mobile: mobile || "",
      baseToken: cleanToken,
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
      message: "JWT token saved and flat context activated.",
      session: {
        apartmentName: saved.apartmentName,
        flatNumber: saved.flatNumber,
        role: saved.role,
      },
    });
  } catch (err: any) {
    console.error("Error in POST /api/apartment/auth/session:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to save token" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    await clearApartmentSession();
    return NextResponse.json({
      success: true,
      message: "Apartment session cleared successfully.",
    });
  } catch (err: any) {
    console.error("Error in DELETE /api/apartment/auth/session:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to clear session" },
      { status: 500 },
    );
  }
}
