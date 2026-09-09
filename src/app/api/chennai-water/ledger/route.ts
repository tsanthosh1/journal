import { NextRequest, NextResponse } from "next/server";
import { getStoredProperties, getChennaiWaterSession } from "@/lib/chennaiWater/storage";
import { fetchCustomerDetails, formatPropNo, formatCmcNo, formatAddress } from "@/lib/chennaiWater/client";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";

export async function GET(req: NextRequest) {
  if (!await isAuthorizedUser(req)) {
    return unauthorizedResponse("Authentication required to access water ledger", {
      property: null,
      dues: null,
    });
  }

  try {
    const verifiedUserId = await getVerifiedUserId(req);
    const session = await getChennaiWaterSession(verifiedUserId);
    const properties = await getStoredProperties(verifiedUserId);
    const activeId = session?.activePropertyId;

    let prop = (activeId ? properties.find((p) => String(p.id) === String(activeId)) : null) || properties[0];

    if (!prop) {
      return NextResponse.json({
        success: true,
        property: null,
        dues: null,
        message: "No registered property found.",
      });
    }

    // If live session token is available, query real-time details from CMWSSB
    if (session?.token && prop.id) {
      try {
        const liveRes = await fetchCustomerDetails(prop.id, session.token);
        if (liveRes.property) {
          prop = {
            ...prop,
            ...liveRes.property,
            prop_no: formatPropNo(liveRes.property.prop_no) || formatPropNo(prop.prop_no),
            cmc_no: formatCmcNo(liveRes.property.cmc_no) || formatCmcNo(prop.cmc_no),
            addr: formatAddress(liveRes.property.addr) || formatAddress(prop.addr),
          };
        }
      } catch (err: any) {
        console.warn("Could not fetch real-time customer ledger from CMWSSB:", err.message);
      }
    }

    const halfYearTaxNum =
      typeof prop.half_year_tax === "string"
        ? parseFloat(prop.half_year_tax.replace(/[^0-9.]/g, "")) || 419
        : Number(prop.half_year_tax || 419);

    const annualValNum =
      typeof prop.annual_value === "string"
        ? parseFloat(prop.annual_value.replace(/[^0-9.]/g, "")) || 11960
        : Number(prop.annual_value || 11960);

    const taxDue = Number(prop.tax_due || 0);
    const chargesDue = Number(prop.charges_due || 0);
    const advanceAmount = Number(prop.advance_amount || 0);
    const totalDue = Number(prop.total_dues || (taxDue + chargesDue));
    const creditBalance = Number(prop.credit_balance || 0);

    return NextResponse.json({
      success: true,
      property: prop,
      dues: {
        tax: {
          dueAmount: taxDue,
          advanceAmount: advanceAmount,
          totalAmount: taxDue,
          halfYearTax: halfYearTaxNum,
          annualValue: annualValNum,
          effFromTerm: prop.eff_from_term || "24-25/II (Oct-Mar)",
        },
        charges: {
          dueAmount: chargesDue,
          advanceAmount: 0,
          totalAmount: chargesDue,
          categoryDescription: prop.cat_desc || "201 - Domestic-F-UM@30",
          effTerm: prop.cat_eff_term || "2024/01",
        },
        totalDue,
        totalPayable: totalDue,
        creditBalance,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
