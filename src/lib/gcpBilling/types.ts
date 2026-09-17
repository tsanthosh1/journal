export interface GcpBillingDatasetConfig {
  id: string;
  name: string; // e.g. "Primary GCP Account", "Work Account"
  billingAccountId?: string;
  projectId: string; // e.g. "track-everything-ai"
  datasetId: string; // e.g. "cloud_billing"
  tableId: string; // e.g. "gcp_billing_export_resource_v1_01DCE1_5840F5_4851D4"
  location: string; // e.g. "asia-south1", "US"
  currency?: string; // e.g. "INR", "USD"
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BillingPeriod = "mtd" | "last_month" | "30d" | "90d" | "custom";

export interface GcpDailySpend {
  date: string; // YYYY-MM-DD
  cost: number;
  credits: number;
  netCost: number;
}

export interface GcpServiceSpend {
  serviceId?: string;
  serviceName: string;
  cost: number;
  credits: number;
  netCost: number;
  percentage: number;
}

export interface GcpProjectSpend {
  projectId: string;
  projectName: string;
  cost: number;
  credits: number;
  netCost: number;
}

export interface GcpSkuSpend {
  skuId: string;
  description: string;
  serviceName: string;
  projectId: string;
  usageAmount: number;
  usageUnit: string;
  cost: number;
  credits: number;
  netCost: number;
}

export interface GcpMonthlySpend {
  invoiceMonth: string; // e.g. "202609"
  formattedMonth: string; // e.g. "Sep 2026"
  cost: number;
  credits: number;
  netCost: number;
  serviceCount: number;
  projectCount: number;
  status: "CURRENT" | "BILLED";
}

export interface GcpBillingSummary {
  configId: string;
  configName: string;
  currency: string;
  period: "mtd" | "last_month" | "30d" | "90d" | "custom";
  startDate: string;
  endDate: string;
  totalCost: number;
  totalCredits: number;
  netCost: number;
  projectedMonthEnd: number;
  dailyAverage: number;
  daysInPeriod: number;
  dailyTrends: GcpDailySpend[];
  monthlyTrends: GcpMonthlySpend[];
  serviceBreakdown: GcpServiceSpend[];
  projectBreakdown: GcpProjectSpend[];
  topSkus: GcpSkuSpend[];
  availableProjects: Array<{ id: string; name: string }>;
}

export const DEFAULT_GCP_BILLING_CONFIG: GcpBillingDatasetConfig = {
  id: "primary",
  name: "Primary Google Cloud Account",
  billingAccountId: "01DCE1-5840F5-4851D4",
  projectId: "track-everything-ai",
  datasetId: "cloud_billing",
  tableId: "gcp_billing_export_resource_v1_01DCE1_5840F5_4851D4",
  location: "asia-south1",
  isDefault: true,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
};
