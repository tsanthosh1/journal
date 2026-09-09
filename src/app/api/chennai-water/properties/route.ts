import { NextRequest, NextResponse } from "next/server";
import { getStoredProperties, getChennaiWaterSession, saveChennaiWaterSession, saveProperties } from "@/lib/chennaiWater/storage";
import {
  fetchCustomerProperties,
  fetchCustomerDetails,
  formatPropNo,
  formatCmcNo,
  formatAddress,
} from "@/lib/chennaiWater/client";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";

export async function GET(req: NextRequest) {
  if (!await isAuthorizedUser(req)) {
    return unauthorizedResponse("Authentication required to access water properties", {
      properties: [],
      activePropertyId: null,
      activeBillNo: null,
    });
  }

  try {
    const verifiedUserId = await getVerifiedUserId(req);
    const session = await getChennaiWaterSession(verifiedUserId);
    let properties = await getStoredProperties(verifiedUserId);

    // If live token is available, refresh from server
    if (session?.token && session?.registeredCustomerId) {
      try {
        const res = await fetchCustomerProperties(session.registeredCustomerId, session.token);
        if (res.properties.length > 0) {
          properties = res.properties;
          await saveProperties(properties, verifiedUserId);
        }
      } catch (err) {
        console.warn("Could not refresh live properties from CMWSSB:", err);
      }
    }

    return NextResponse.json({
      success: true,
      properties,
      activePropertyId: session?.activePropertyId,
      activeBillNo: session?.activeBillNo,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await isAuthorizedUser(req)) {
    return unauthorizedResponse("Authentication required to switch property");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(req);
    const body = await req.json();
    const { propertyId } = body;

    if (!propertyId) {
      return NextResponse.json({ success: false, error: "propertyId is required." }, { status: 400 });
    }

    const properties = await getStoredProperties(verifiedUserId);
    const targetProp = properties.find((p) => String(p.id) === String(propertyId));

    if (!targetProp) {
      return NextResponse.json({ success: false, error: "Property not found." }, { status: 404 });
    }

    const session = await getChennaiWaterSession(verifiedUserId);
    await saveChennaiWaterSession({
      activePropertyId: String(targetProp.id),
      activeBillNo: targetProp.prop_no ? formatPropNo(targetProp.prop_no) : (session?.activeBillNo || ""),
      activeCmcNo: targetProp.cmc_no ? formatCmcNo(targetProp.cmc_no) : (session?.activeCmcNo || ""),
      customerName: targetProp.c_name || session?.customerName || "",
      address: formatAddress(targetProp.addr || session?.address || ""),
    }, verifiedUserId);

    return NextResponse.json({
      success: true,
      message: `Active property switched to ${formatPropNo(targetProp.prop_no)}`,
      activeProperty: targetProp,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
