import os from "os";
import path from "path";
import fs from "fs";
import { GoogleAuth } from "google-auth-library";
import {
  GcpBillingDatasetConfig,
  GcpBillingSummary,
  GcpDailySpend,
  GcpServiceSpend,
  GcpProjectSpend,
  GcpSkuSpend,
} from "./types";

const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(
  os.homedir(),
  ".firebase/track-everything-ai-firebase-adminsdk-fbsvc-778b38f3e1.json",
);

/**
 * Resolves a valid Google OAuth access token with BigQuery scopes
 */
async function getBigQueryAccessToken(): Promise<string> {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
  const explicitPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  let auth: GoogleAuth;

  if (serviceAccountJson) {
    let credentials = {};
    const trimmed = serviceAccountJson.trim();
    if (trimmed.startsWith("{")) {
      credentials = JSON.parse(trimmed);
    } else {
      credentials = JSON.parse(Buffer.from(trimmed, "base64").toString("utf8"));
    }
    auth = new GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/bigquery", "https://www.googleapis.com/auth/cloud-platform"],
    });
  } else if (explicitPath && fs.existsSync(explicitPath)) {
    auth = new GoogleAuth({
      keyFile: explicitPath,
      scopes: ["https://www.googleapis.com/auth/bigquery", "https://www.googleapis.com/auth/cloud-platform"],
    });
  } else if (fs.existsSync(DEFAULT_SERVICE_ACCOUNT_PATH)) {
    auth = new GoogleAuth({
      keyFile: DEFAULT_SERVICE_ACCOUNT_PATH,
      scopes: ["https://www.googleapis.com/auth/bigquery", "https://www.googleapis.com/auth/cloud-platform"],
    });
  } else {
    // Default application credentials fallback
    auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/bigquery", "https://www.googleapis.com/auth/cloud-platform"],
    });
  }

  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error("Failed to obtain BigQuery access token.");
  }
  return token.token;
}

/**
 * Executes a SQL query against Google Cloud BigQuery REST API
 */
async function runBigQuerySql(projectId: string, location: string, query: string): Promise<any> {
  const token = await getBigQueryAccessToken();
  const endpoint = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      useLegacySql: false,
      location,
      timeoutMs: 30000,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.error?.message || `BigQuery query failed with HTTP status ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

/**
 * Resolves date range bounds and SQL partition filter for the requested period
 */
function resolvePeriodDates(period: "mtd" | "last_month" | "30d" | "90d" = "mtd"): {
  startDate: string;
  endDate: string;
  partitionCondition: string;
  daysInPeriod: number;
} {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  if (period === "last_month") {
    const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();
    const lastDayPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();

    const startStr = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-01`;
    const endStr = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(lastDayPrevMonth).padStart(2, "0")}`;

    return {
      startDate: startStr,
      endDate: endStr,
      partitionCondition: `_PARTITIONTIME >= TIMESTAMP('${startStr}') AND _PARTITIONTIME <= TIMESTAMP('${endStr} 23:59:59')`,
      daysInPeriod: lastDayPrevMonth,
    };
  }

  if (period === "30d") {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const startStr = d.toISOString().slice(0, 10);
    const endStr = now.toISOString().slice(0, 10);

    return {
      startDate: startStr,
      endDate: endStr,
      partitionCondition: `_PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)`,
      daysInPeriod: 30,
    };
  }

  if (period === "90d") {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    const startStr = d.toISOString().slice(0, 10);
    const endStr = now.toISOString().slice(0, 10);

    return {
      startDate: startStr,
      endDate: endStr,
      partitionCondition: `_PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)`,
      daysInPeriod: 90,
    };
  }

  // Default: Month-To-Date (MTD)
  const startStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
  const endStr = now.toISOString().slice(0, 10);
  const currentDay = now.getDate();

  return {
    startDate: startStr,
    endDate: endStr,
    partitionCondition: `_PARTITIONTIME >= TIMESTAMP('${startStr}')`,
    daysInPeriod: currentDay,
  };
}

/**
 * Fetches comprehensive billing metrics from the user's BigQuery billing export table
 */
export async function queryGcpBillingSummary(
  config: GcpBillingDatasetConfig,
  period: "mtd" | "last_month" | "30d" | "90d" = "mtd",
  filterProjectId?: string,
): Promise<GcpBillingSummary> {
  const { startDate, endDate, partitionCondition, daysInPeriod } = resolvePeriodDates(period);

  const fullTableRef = `\`${config.projectId}.${config.datasetId}.${config.tableId}\``;
  const projectCondition = filterProjectId && filterProjectId !== "ALL"
    ? `AND project.id = '${filterProjectId.replace(/'/g, "\\'")}'`
    : "";

  // 1. Query Totals & Currency
  const totalsSql = `
    SELECT
      IFNULL(currency, 'INR') as currency,
      ROUND(IFNULL(SUM(cost), 0), 2) as total_cost,
      ROUND(IFNULL(SUM((SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 0), 2) as total_credits,
      ROUND(IFNULL(SUM(cost + (SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 0), 2) as net_cost
    FROM ${fullTableRef}
    WHERE ${partitionCondition}
      ${projectCondition}
    GROUP BY 1
    ORDER BY total_cost DESC
    LIMIT 1
  `;

  // 2. Query Daily Trends
  const dailySql = `
    SELECT
      FORMAT_TIMESTAMP('%Y-%m-%d', usage_start_time) as date,
      ROUND(IFNULL(SUM(cost), 0), 2) as cost,
      ROUND(IFNULL(SUM((SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 0), 2) as credits,
      ROUND(IFNULL(SUM(cost + (SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 0), 2) as net_cost
    FROM ${fullTableRef}
    WHERE ${partitionCondition}
      ${projectCondition}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  // 3. Query Service Breakdown
  const serviceSql = `
    SELECT
      IFNULL(service.description, 'Unknown Service') as service_name,
      ROUND(IFNULL(SUM(cost), 0), 2) as cost,
      ROUND(IFNULL(SUM((SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 0), 2) as credits,
      ROUND(IFNULL(SUM(cost + (SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 0), 2) as net_cost
    FROM ${fullTableRef}
    WHERE ${partitionCondition}
      ${projectCondition}
    GROUP BY 1
    ORDER BY cost DESC
    LIMIT 12
  `;

  // 4. Query Project Breakdown
  const projectSql = `
    SELECT
      IFNULL(project.id, 'Unallocated') as project_id,
      IFNULL(project.name, project.id) as project_name,
      ROUND(IFNULL(SUM(cost), 0), 2) as cost,
      ROUND(IFNULL(SUM((SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 0), 2) as credits,
      ROUND(IFNULL(SUM(cost + (SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 0), 2) as net_cost
    FROM ${fullTableRef}
    WHERE ${partitionCondition}
    GROUP BY 1, 2
    ORDER BY cost DESC
    LIMIT 10
  `;

  // 5. Query Top Cost Driving SKUs
  const topSkusSql = `
    SELECT
      IFNULL(sku.id, '') as sku_id,
      IFNULL(sku.description, 'Unknown Resource') as description,
      IFNULL(service.description, '') as service_name,
      IFNULL(project.id, 'Shared') as project_id,
      ROUND(IFNULL(SUM(usage.amount_in_pricing_units), 0), 2) as usage_amount,
      IFNULL(usage.pricing_unit, '') as usage_unit,
      ROUND(IFNULL(SUM(cost), 0), 2) as cost,
      ROUND(IFNULL(SUM((SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 0), 2) as credits,
      ROUND(IFNULL(SUM(cost + (SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 0), 2) as net_cost
    FROM ${fullTableRef}
    WHERE ${partitionCondition}
      ${projectCondition}
    GROUP BY 1, 2, 3, 4, 6
    ORDER BY cost DESC
    LIMIT 12
  `;

  // 6. Query Monthly Bill Invoices / Payments
  const monthlySql = `
    SELECT
      COALESCE(invoice.month, FORMAT_TIMESTAMP('%Y%m', usage_start_time)) AS invoice_month,
      ROUND(IFNULL(SUM(cost), 0), 2) AS cost,
      ROUND(IFNULL(SUM((SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 0), 2) AS credits,
      ROUND(IFNULL(SUM(cost + (SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)), 0), 2) AS net_cost,
      COUNT(DISTINCT service.description) AS service_count,
      COUNT(DISTINCT project.id) AS project_count
    FROM ${fullTableRef}
    WHERE _PARTITIONTIME >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY))
      ${projectCondition}
    GROUP BY invoice_month
    ORDER BY invoice_month ASC
  `;

  // Run queries in parallel for fast dashboard load
  const [totalsRes, dailyRes, serviceRes, projectRes, topSkusRes, monthlyRes] = await Promise.all([
    runBigQuerySql(config.projectId, config.location, totalsSql),
    runBigQuerySql(config.projectId, config.location, dailySql),
    runBigQuerySql(config.projectId, config.location, serviceSql),
    runBigQuerySql(config.projectId, config.location, projectSql),
    runBigQuerySql(config.projectId, config.location, topSkusSql),
    runBigQuerySql(config.projectId, config.location, monthlySql),
  ]);

  // Extract Totals
  const firstTotalRow = totalsRes.rows?.[0]?.f;
  const currency = firstTotalRow?.[0]?.v || "INR";
  const totalCost = parseFloat(firstTotalRow?.[1]?.v || "0") || 0;
  const totalCredits = parseFloat(firstTotalRow?.[2]?.v || "0") || 0;
  const netCost = parseFloat(firstTotalRow?.[3]?.v || "0") || 0;

  // Compute Run-Rate & Daily Average
  const dailyAverage = daysInPeriod > 0 ? totalCost / daysInPeriod : 0;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedMonthEnd = period === "mtd" ? dailyAverage * daysInMonth : totalCost;

  // Extract Daily Trends
  const dailyTrends: GcpDailySpend[] = (dailyRes.rows || []).map((r: any) => ({
    date: r.f[0].v,
    cost: parseFloat(r.f[1].v) || 0,
    credits: parseFloat(r.f[2].v) || 0,
    netCost: parseFloat(r.f[3].v) || 0,
  }));

  // Extract Service Breakdown
  const serviceBreakdown: GcpServiceSpend[] = (serviceRes.rows || []).map((r: any) => {
    const cost = parseFloat(r.f[1].v) || 0;
    const percentage = totalCost > 0 ? (cost / totalCost) * 100 : 0;
    return {
      serviceId: r.f[0].v,
      serviceName: r.f[0].v,
      cost,
      credits: parseFloat(r.f[2].v) || 0,
      netCost: parseFloat(r.f[3].v) || 0,
      percentage: Math.round(percentage * 10) / 10,
    };
  });

  // Extract Project Breakdown & Unique Project List
  const projectBreakdown: GcpProjectSpend[] = (projectRes.rows || []).map((r: any) => ({
    projectId: r.f[0].v,
    projectName: r.f[1].v,
    cost: parseFloat(r.f[2].v) || 0,
    credits: parseFloat(r.f[3].v) || 0,
    netCost: parseFloat(r.f[4].v) || 0,
  }));

  const availableProjects = projectBreakdown.map((p) => ({
    id: p.projectId,
    name: p.projectName,
  }));

  // Extract Top SKUs
  const topSkus: GcpSkuSpend[] = (topSkusRes.rows || []).map((r: any) => ({
    skuId: r.f[0].v,
    description: r.f[1].v,
    serviceName: r.f[2].v,
    projectId: r.f[3].v,
    usageAmount: parseFloat(r.f[4].v) || 0,
    usageUnit: r.f[5].v,
    cost: parseFloat(r.f[6].v) || 0,
    credits: parseFloat(r.f[7].v) || 0,
    netCost: parseFloat(r.f[8].v) || 0,
  }));

  // Extract Monthly Trends
  const currentMonthKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthlyTrends = (monthlyRes.rows || []).map((r: any) => {
    const invMonth = r.f[0].v || "";
    let formattedMonth = invMonth;
    if (invMonth.length === 6) {
      const year = invMonth.slice(0, 4);
      const monthNum = parseInt(invMonth.slice(4, 6), 10) - 1;
      const date = new Date(parseInt(year, 10), monthNum, 1);
      formattedMonth = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    }
    return {
      invoiceMonth: invMonth,
      formattedMonth,
      cost: parseFloat(r.f[1].v) || 0,
      credits: parseFloat(r.f[2].v) || 0,
      netCost: parseFloat(r.f[3].v) || 0,
      serviceCount: parseInt(r.f[4].v, 10) || 0,
      projectCount: parseInt(r.f[5].v, 10) || 0,
      status: (invMonth === currentMonthKey ? "CURRENT" : "BILLED") as "CURRENT" | "BILLED",
    };
  });

  return {
    configId: config.id,
    configName: config.name,
    currency,
    period,
    startDate,
    endDate,
    totalCost,
    totalCredits,
    netCost,
    projectedMonthEnd: Math.round(projectedMonthEnd * 100) / 100,
    dailyAverage: Math.round(dailyAverage * 100) / 100,
    daysInPeriod,
    dailyTrends,
    monthlyTrends,
    serviceBreakdown,
    projectBreakdown,
    topSkus,
    availableProjects,
  };
}
