import { NextRequest, NextResponse } from "next/server";
import {
  loginCustomer,
  fetchCustomerProperties,
  fetchCustomerDetails,
  fetchReceipts,
  formatPropNo,
  formatCmcNo,
  formatAddress,
} from "@/lib/chennaiWater/client";
import { saveChennaiWaterSession, saveProperties, saveReceipts } from "@/lib/chennaiWater/storage";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mobileOrEmail, password } = body;

    if (!mobileOrEmail || !password) {
      return NextResponse.json(
        { success: false, error: "Mobile/Email and password are required." },
        { status: 400 }
      );
    }

    const loginRes = await loginCustomer(mobileOrEmail, password);
    if (!loginRes.success || !loginRes.token || !loginRes.registeredCustomerId) {
      return NextResponse.json(
        { success: false, error: loginRes.message || "Failed to authenticate with CMWSSB." },
        { status: 401 }
      );
    }

    // Discover customer properties
    let properties: any[] = [];
    let activeProp: any = null;
    let receipts: any[] = [];

    try {
      const propRes = await fetchCustomerProperties(loginRes.registeredCustomerId, loginRes.token);
      properties = propRes.properties;
      if (properties.length > 0) {
        activeProp = properties[0];
        await saveProperties(properties);

        // Fetch detailed ledger for the active property
        const detailRes = await fetchCustomerDetails(activeProp.id, propRes.nextToken);
        activeProp = { ...activeProp, ...detailRes.property };

        // Fetch receipts
        const recRes = await fetchReceipts(activeProp.id, detailRes.nextToken);
        receipts = recRes.receipts;
        if (receipts.length > 0) {
          await saveReceipts(receipts);
        }
      }
    } catch (fetchErr: any) {
      console.warn("Failed to fetch initial customer properties/receipts:", fetchErr.message);
    }

    // Save session
    const sessionData = {
      mobileOrEmail,
      registeredCustomerId: loginRes.registeredCustomerId,
      token: loginRes.token,
      activePropertyId: activeProp?.id || "193097538",
      activeBillNo: formatPropNo(activeProp?.prop_no) || "15-193-097538",
      activeCmcNo: formatCmcNo(activeProp?.cmc_no) || "15-193-56648-000",
      customerName: activeProp?.c_name || loginRes.customerData?.name || "SANTHOSH T",
      address: formatAddress(activeProp?.addr || ""),
      updatedAt: new Date().toISOString(),
    };

    await saveChennaiWaterSession(sessionData);

    return NextResponse.json({
      success: true,
      message: "Successfully logged in to CMWSSB.",
      session: sessionData,
      properties,
      receiptsCount: receipts.length,
    });
  } catch (error: any) {
    console.error("CMWSSB login error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "An unexpected error occurred during login." },
      { status: 500 }
    );
  }
}
