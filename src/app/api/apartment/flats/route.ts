import { NextRequest, NextResponse } from "next/server";
import { getApartmentSession, saveApartmentSession } from "@/lib/apartment/storage";
import { fetchApartments, swapFlatToken } from "@/lib/apartment/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getApartmentSession();
    const token = session?.baseToken || session?.swappedToken;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Not authenticated. Please configure Apartment credentials first." },
        { status: 401 },
      );
    }

    const apartments = await fetchApartments(token);

    return NextResponse.json({
      success: true,
      apartments,
      activeRequestId: session?.activeRequestId,
    });
  } catch (err: any) {
    console.error("Error in GET /api/apartment/flats:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch flats" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId } = body;

    if (!requestId) {
      return NextResponse.json(
        { success: false, error: "requestId is required" },
        { status: 400 },
      );
    }

    const session = await getApartmentSession();
    const baseToken = session?.baseToken || session?.swappedToken;

    if (!baseToken) {
      return NextResponse.json(
        { success: false, error: "Not authenticated." },
        { status: 401 },
      );
    }

    // Discover apartments to get metadata for this request
    const apartments = await fetchApartments(baseToken);
    let meta: Record<string, string | undefined> = {};

    for (const apt of apartments) {
      for (const req of apt.requests || []) {
        if (req.id === requestId) {
          const flat = req.flat;
          const block = flat?.block?.blockName || "";
          const flatNo = flat?.flatNumber || "";
          meta = {
            apartmentId: apt.id,
            apartmentName: apt.name,
            flatNumber: block ? `${block}-${flatNo}` : flatNo,
            blockName: block,
            role: req.roleType,
          };
          break;
        }
      }
    }

    const swapRes = await swapFlatToken(requestId, baseToken);
    if (!swapRes.swappedToken) {
      return NextResponse.json(
        { success: false, error: swapRes.error || "Failed to activate flat context" },
        { status: 400 },
      );
    }

    const updated = await saveApartmentSession({
      swappedToken: swapRes.swappedToken,
      activeRequestId: requestId,
      apartmentId: meta.apartmentId,
      apartmentName: meta.apartmentName,
      flatNumber: meta.flatNumber,
      blockName: meta.blockName,
      role: meta.role,
    });

    return NextResponse.json({
      success: true,
      message: `Switched active flat to: ${updated.apartmentName} - ${updated.flatNumber}`,
      session: {
        apartmentName: updated.apartmentName,
        flatNumber: updated.flatNumber,
        activeRequestId: updated.activeRequestId,
      },
    });
  } catch (err: any) {
    console.error("Error in POST /api/apartment/flats:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to switch flat" },
      { status: 500 },
    );
  }
}
