import { NextRequest, NextResponse } from "next/server";
import { getApartmentSession, getCachedApartmentBills, saveCachedApartmentBills } from "@/lib/apartment/storage";
import { fetchHomefyBills } from "@/lib/apartment/client";
import { syncApartmentBillsToSubscriptions } from "@/lib/apartment/subscriptionBridge";
import { isAuthorizedUser, unauthorizedResponse } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse("Authentication required to access apartment bills", {
      total: 0,
      bills: [],
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get("status") || "ALL").toUpperCase() as "ALL" | "PENDING" | "PAID";
    const forceRealtime = searchParams.get("realtime") !== "false";

    const session = await getApartmentSession();
    const token = session?.swappedToken || session?.baseToken;

    if (!token) {
      // If no token, check if we have any cached bills
      const cached = await getCachedApartmentBills();
      if (cached.length > 0) {
        return NextResponse.json({
          success: true,
          source: "CACHED",
          bills: cached,
          message: "Showing cached bills (no active session).",
        });
      }

      return NextResponse.json(
        { success: false, error: "No active Apartment session. Please configure credentials." },
        { status: 401 },
      );
    }

    let bills = [];
    let source = "REALTIME";

    if (forceRealtime) {
      try {
        bills = await fetchHomefyBills(token, status);
        // Cache to Firestore in the background
        if (bills.length > 0) {
          saveCachedApartmentBills(bills).catch((e) => console.warn("Background cache error:", e));
          syncApartmentBillsToSubscriptions(bills).catch((e) => console.warn("Background bridge sync error:", e));
        }
      } catch (apiErr: any) {
        console.warn("Homefy live API failed, falling back to cache:", apiErr);
        bills = await getCachedApartmentBills();
        source = "CACHED_FALLBACK";
      }
    } else {
      bills = await getCachedApartmentBills();
      source = "CACHED";
    }

    // Filter by status if needed
    if (status === "PENDING") {
      bills = bills.filter((b) => b.status === "PENDING" || b.status === "APPROVAL_PENDING");
    } else if (status === "PAID") {
      bills = bills.filter((b) => b.status === "PAID");
    }

    return NextResponse.json({
      success: true,
      source,
      total: bills.length,
      apartmentName: session?.apartmentName,
      flatNumber: session?.flatNumber,
      bills,
    });
  } catch (err: any) {
    console.error("Error in GET /api/apartment/bills:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch apartment bills" },
      { status: 500 },
    );
  }
}
