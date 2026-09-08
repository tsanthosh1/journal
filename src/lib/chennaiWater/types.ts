// Type definitions for Chennai Metropolitan Water Supply & Sewerage Board (CMWSSB)

export interface ChennaiWaterSession {
  mobileOrEmail: string;
  registeredCustomerId?: string | number;
  token?: string; // Latest JWT Bearer token
  activePropertyId?: string | number;
  activeBillNo?: string; // e.g. "15-193-097538"
  activeCmcNo?: string; // e.g. "15-193-56648-000"
  customerName?: string;
  address?: string;
  updatedAt: string;
}

export interface ChennaiWaterProperty {
  id: string | number; // internal customer ID e.g. 193097538
  prop_no?: string; // New Bill Number e.g. "15-193-097538"
  cmc_no?: string; // Existing Bill Number e.g. "15-193-56648-000"
  c_name?: string; // Customer Name e.g. "SANTHOSH T"
  addr?: string; // Address
  mobile_no?: string;
  status?: string; // "Active" | "Inactive"
  annual_value?: number | string; // e.g. "₹11,960.00"
  eff_from_term?: string; // e.g. "24-25/II (Oct-Mar)"
  half_year_tax?: number | string; // e.g. "₹419.00"
  cat_desc?: string; // e.g. "201 - Domestic-F-UM@30"
  cat_eff_term?: string; // e.g. "2024/01"
  total_dues?: number;
  credit_balance?: number;
  tax_due?: number;
  charges_due?: number;
  advance_amount?: number;
}

export interface ChennaiWaterReceipt {
  id: string | number;
  receipt_no: string; // e.g. "26-27/BBP/123821"
  receipt_dt: string; // e.g. "17/05/2026" or ISO
  type: string; // e.g. "Receipt"
  payment_mode: string; // "BBPS" | "OLP" | "CHQ" | "CASH" | string
  amount: number; // e.g. 1028.00
  customer_id?: string | number;
  prop_no?: string;
  cmc_no?: string;
  receipt_ts?: string;
  tot_receipt_amt?: number;
  bbps_trnx_id?: string;
}

export interface ChennaiWaterDuesDetail {
  property: ChennaiWaterProperty;
  tax: {
    dueAmount: number;
    advanceAmount: number;
    totalAmount: number;
    halfYearTax: number;
    annualValue: number;
  };
  charges: {
    dueAmount: number;
    advanceAmount: number;
    totalAmount: number;
    categoryDescription?: string;
  };
  totalDue: number;
  totalPayable: number;
  creditBalance: number;
  receipts: ChennaiWaterReceipt[];
}

export interface ChennaiWaterSubscriptionConfig {
  billNumber?: string; // New Bill Number e.g. "15-193-097538"
  existingBillNumber?: string; // e.g. "15-193-56648-000"
  componentType?: "TAX_AND_CHARGES" | "TAX_ONLY" | "CHARGES_ONLY";
  autoSyncWithMetroWaterModule?: boolean;
}
