import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedUser, unauthorizedResponse, getVerifiedUserId } from "@/lib/serverAuth";
import { getGcpBillingConfigs } from "@/lib/gcpBilling/storage";
import { queryGcpBillingSummary } from "@/lib/gcpBilling/client";
import { getGcpHistoricalInvoices } from "@/lib/gcpBilling/historicalStorage";
import { BillingPeriod, GcpMonthlySpend } from "@/lib/gcpBilling/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await isAuthorizedUser(request)) {
    return unauthorizedResponse("Authentication required to access GCP billing summary");
  }

  try {
    const verifiedUserId = await getVerifiedUserId(request);
    const userId = verifiedUserId || "default_user";

    const { searchParams } = new URL(request.url);
    const configId = searchParams.get("configId");
    const period = (searchParams.get("period") || "mtd") as "mtd" | "last_month" | "30d" | "90d";
    const projectId = searchParams.get("projectId") || undefined;

    const configs = await getGcpBillingConfigs(userId);
    if (configs.length === 0) {
      return NextResponse.json(
        { error: "No GCP billing datasets configured" },
        { status: 404 }
      );
    }

    const selectedConfig =
      (configId ? configs.find((c) => c.id === configId) : null) ||
      configs.find((c) => c.isDefault) ||
      configs[0];

    const summary = await queryGcpBillingSummary(
      selectedConfig,
      period,
      projectId
    );

    // Merge any imported historical invoices (e.g. from uploaded CSVs)
    const historicalInvoices = await getGcpHistoricalInvoices(userId);

    if (historicalInvoices.length > 0) {
      const existingMonths = new Set(summary.monthlyTrends.map((m) => m.invoiceMonth));

      for (const inv of historicalInvoices) {
        if (!existingMonths.has(inv.invoiceMonth)) {
          const monthlyEntry: GcpMonthlySpend = {
            invoiceMonth: inv.invoiceMonth,
            formattedMonth: inv.formattedMonth,
            cost: inv.cost,
            credits: inv.credits,
            netCost: inv.netCost,
            serviceCount: inv.serviceCount,
            projectCount: inv.projectCount,
            status: "BILLED",
          };
          summary.monthlyTrends.push(monthlyEntry);
        }
      }

      // Sort monthly trends chronologically
      summary.monthlyTrends.sort((a, b) => a.invoiceMonth.localeCompare(b.invoiceMonth));

      // If user selected "last_month" and BigQuery had 0 spend (e.g. export wasn't active yet),
      // populate from the historical invoice if available
      if (period === "last_month" && summary.totalCost === 0) {
        const lastMonthDate = new Date();
        lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
        const lastMonthKey = `${lastMonthDate.getFullYear()}${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
        const match = historicalInvoices.find((inv) => inv.invoiceMonth === lastMonthKey);

        if (match) {
          summary.totalCost = match.cost;
          summary.totalCredits = match.credits;
          summary.netCost = match.netCost;
          summary.serviceBreakdown = match.services.map((s) => ({
            serviceId: s.serviceName,
            serviceName: s.serviceName,
            cost: s.cost,
            credits: s.credits,
            netCost: s.netCost,
            percentage: match.cost > 0 ? Math.round((s.cost / match.cost) * 1000) / 10 : 0,
          }));
          summary.topSkus = match.topSkus;
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary,
      config: selectedConfig,
      configs,
    });
  } catch (error: any) {
    console.error("[GCP Billing Summary API Error]:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch GCP billing summary",
      },
      { status: 500 }
    );
  }
}
