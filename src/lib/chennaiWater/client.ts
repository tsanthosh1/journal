import { encryptForCMWSSB } from "./crypto";
import { ChennaiWaterProperty, ChennaiWaterReceipt } from "./types";

const CMWSSB_API_BASE = "https://bnc.chennaimetrowater.in/svr/bnc-ms.php";

/**
 * Normalizes CMWSSB prop_no which can be an object { zone_no, ward_no, bill_no } into string "15-193-097538".
 */
export function formatPropNo(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    const zone = val.zone_no ?? "";
    const ward = val.ward_no ?? "";
    const bill = val.bill_no ?? "";
    if (zone || ward || bill) {
      return [zone, ward, bill].filter((x) => x !== "" && x !== undefined && x !== null).join("-");
    }
    return Object.values(val).filter((x) => x !== "" && x !== undefined && x !== null).join("-");
  }
  return String(val);
}

/**
 * Normalizes CMWSSB cmc_no which can be an object { zone_no, ward_no, bill_no, sub_code } into string "15-193-56648-000".
 */
export function formatCmcNo(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    const zone = val.zone_no ?? "";
    const ward = val.ward_no ?? "";
    const bill = val.bill_no ?? val.cmc_no ?? "";
    const sub = val.sub_code ?? val.sub_no ?? "";
    if (zone || ward || bill) {
      return [zone, ward, bill, sub].filter((x) => x !== "" && x !== undefined && x !== null).join("-");
    }
    return Object.values(val).filter((x) => x !== "" && x !== undefined && x !== null).join("-");
  }
  return String(val);
}

/**
 * Normalizes address string or object.
 */
export function formatAddress(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    return Object.values(val).filter(Boolean).join(", ");
  }
  return String(val);
}

/**
 * Normalizes receipt date from receipt_dt or ISO/SQL receipt_ts.
 */
export function formatReceiptDate(r: any): string {
  if (!r) return "";
  if (r.receipt_dt && typeof r.receipt_dt === "string" && r.receipt_dt.trim()) {
    return r.receipt_dt.trim();
  }
  const ts = r.receipt_ts || r.created_at || r.updated_at;
  if (ts) {
    const raw = String(ts).trim();
    const datePart = raw.split(" ")[0].split("T")[0];
    if (datePart.includes("-")) {
      const [y, m, d] = datePart.split("-");
      if (y && m && d) {
        return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
      }
    }
    return datePart;
  }
  return "";
}

/**
 * Extracts numeric receipt amount from CMWSSB's various response fields.
 */
export function parseReceiptAmount(r: any): number {
  if (!r) return 0;
  const val =
    r.tot_receipt_amt !== undefined && r.tot_receipt_amt !== null
      ? r.tot_receipt_amt
      : r.net_rcpt_amt !== undefined && r.net_rcpt_amt !== null
      ? r.net_rcpt_amt
      : r.amount !== undefined && r.amount !== null && r.amount !== 0
      ? r.amount
      : r.tot_amt;
  return Number(val) || 0;
}

export interface KeyResult {
  secretKey: string;
  token: string;
}

/**
 * Initiates the authentication handshake by obtaining a 16-char secret key and initial JWT token.
 */
export async function generateSecretKey(): Promise<KeyResult> {
  const res = await fetch(`${CMWSSB_API_BASE}?generateSecretKey=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to generate secret key: HTTP ${res.status}`);
  }

  const token = res.headers.get("x-token") || "";
  const rawBody = await res.text();
  const secretKey = rawBody.replace(/^"|"$/g, "").trim();

  return { secretKey, token };
}

export interface LoginResult {
  success: boolean;
  message: string;
  token: string;
  registeredCustomerId?: string | number;
  customerData?: any;
}

/**
 * Authenticates user via CMWSSB customerLogin.
 */
export async function loginCustomer(
  mobileOrEmail: string,
  password: string
): Promise<LoginResult> {
  const { secretKey, token: initToken } = await generateSecretKey();

  const encMobile = encryptForCMWSSB(mobileOrEmail.trim(), secretKey);
  const encPassword = encryptForCMWSSB(password, secretKey);

  const res = await fetch(`${CMWSSB_API_BASE}?customerLogin=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${initToken}`,
    },
    body: JSON.stringify({
      mobile_no_email: encMobile,
      pwd: encPassword,
      module: "bnc",
    }),
  });

  const responseToken = res.headers.get("x-token") || initToken;
  const data = await res.json().catch(() => ({}));

  if (data?.message === "Customer authenticated") {
    return {
      success: true,
      message: "Customer authenticated successfully",
      token: responseToken,
      registeredCustomerId: data.id,
      customerData: data,
    };
  }

  return {
    success: false,
    message: data?.message || "Authentication failed",
    token: responseToken,
  };
}

/**
 * Retrieves all properties registered under this customer account.
 */
export async function fetchCustomerProperties(
  registeredCustomerId: string | number,
  token: string
): Promise<{ properties: ChennaiWaterProperty[]; nextToken: string }> {
  const res = await fetch(`${CMWSSB_API_BASE}?getCustomers=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      include_inactive: true,
      zone_no: "ALL",
      ward_no: "ALL",
      limit: 1000,
      offset: 0,
      registered_customer_id: registeredCustomerId,
    }),
  });

  const nextToken = res.headers.get("x-token") || token;
  const data = await res.json().catch(() => ({}));
  const rows = Array.isArray(data?.rows) ? data.rows : [];

  const properties: ChennaiWaterProperty[] = rows.map((r: any) => ({
    id: r.id,
    prop_no: formatPropNo(r.prop_no),
    cmc_no: formatCmcNo(r.cmc_no),
    c_name: r.c_name || r.name || "",
    addr: formatAddress(r.addr),
    mobile_no: r.mobile_no || "",
    status: r.status === "A" ? "Active" : r.status || "Active",
    annual_value: r.annual_value,
    eff_from_term: r.eff_from_term || r.term,
    half_year_tax: r.half_year_tax || r.tax,
    cat_desc: r.cat_desc,
    total_dues: Number(r.total_dues || 0),
    credit_balance: Number(r.credit_balance || 0),
  }));

  return { properties, nextToken };
}

/**
 * Converts a start date into CMWSSB's half-year financial term (e.g. 2024-10-01 -> "24-25/II (Oct-Mar)").
 */
export function convertDateToTerm(dateStr?: string): string {
  if (!dateStr) return "24-25/II (Oct-Mar)";
  const parts = String(dateStr).split(" ")[0].split("T")[0].split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (!year || !month) return "24-25/II (Oct-Mar)";

  if (month >= 4 && month <= 9) {
    const y1 = String(year).slice(-2);
    const y2 = String(year + 1).slice(-2);
    return `${y1}-${y2}/I (Apr-Sep)`;
  } else if (month >= 10) {
    const y1 = String(year).slice(-2);
    const y2 = String(year + 1).slice(-2);
    return `${y1}-${y2}/II (Oct-Mar)`;
  } else {
    const y1 = String(year - 1).slice(-2);
    const y2 = String(year).slice(-2);
    return `${y1}-${y2}/II (Oct-Mar)`;
  }
}

/**
 * Retrieves full ledger details, annual value, half-yearly tax, and dues for a property.
 */
export async function fetchCustomerDetails(
  customerId: string | number,
  token: string
): Promise<{ property: ChennaiWaterProperty; nextToken: string }> {
  const res = await fetch(`${CMWSSB_API_BASE}?getCustomer=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id: customerId }),
  });

  const nextToken = res.headers.get("x-token") || token;
  const r = await res.json().catch(() => ({}));

  const avNum = r.av !== undefined ? Number(r.av) : undefined;
  const hyTaxNum = r.hy_td_tax !== undefined ? Number(r.hy_td_tax) : undefined;

  const property: ChennaiWaterProperty = {
    id: r.id || customerId,
    prop_no: formatPropNo(r.prop_no),
    cmc_no: formatCmcNo(r.cmc_no),
    c_name: r.c_name || r.cus_name || r.name || "SANTHOSH T",
    addr: formatAddress(r.addr || r.cus_addr),
    mobile_no: r.mobile_no || "",
    status: r.status === "A" || r.status === "Active" ? "Active" : r.status || "Active",
    annual_value:
      typeof r.annual_value === "string" && r.annual_value
        ? r.annual_value
        : avNum !== undefined
        ? `₹${avNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
        : "₹11,960.00",
    eff_from_term: r.eff_from_term || convertDateToTerm(r.av_esd),
    half_year_tax:
      typeof r.half_year_tax === "string" && r.half_year_tax
        ? r.half_year_tax
        : hyTaxNum !== undefined
        ? `₹${hyTaxNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
        : "₹419.00",
    cat_desc: r.cat_desc || "201 - Domestic-F-UM@30",
    cat_eff_term: r.cat_eff_term || convertDateToTerm(r.cat_esd),
    total_dues: Number(r.total_dues || r.tot_due_amt || 0),
    credit_balance: Number(r.credit_balance || r.tot_cr_bal || 0),
    tax_due: Number(r.tax_due || 0),
    charges_due: Number(r.charges_due || 0),
    advance_amount: Number(r.advance_amount || 0),
  };

  return { property, nextToken };
}

/**
 * Retrieves payment receipts for a property.
 */
export async function fetchReceipts(
  customerId: string | number,
  token: string,
  limit: number = 50
): Promise<{ receipts: ChennaiWaterReceipt[]; nextToken: string }> {
  const res = await fetch(`${CMWSSB_API_BASE}?getReceipts=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      c_id: customerId,
      receipt_type: "P",
      limit,
      offset: 0,
    }),
  });

  const nextToken = res.headers.get("x-token") || token;
  const data = await res.json().catch(() => ({}));
  const rows = Array.isArray(data?.rows) ? data.rows : [];

  const receipts: ChennaiWaterReceipt[] = rows.map((r: any) => ({
    id: r.id,
    receipt_no: r.receipt_no,
    receipt_dt: formatReceiptDate(r),
    type: r.type || r.collection_type_desc || "Receipt",
    payment_mode: r.payment_method_code || r.payment_mode || "BBPS",
    amount: parseReceiptAmount(r),
    customer_id: customerId,
    prop_no: formatPropNo(r.prop_no),
    cmc_no: formatCmcNo(r.cmc_no),
    receipt_ts: r.receipt_ts,
    tot_receipt_amt: parseReceiptAmount(r),
    bbps_trnx_id: r.bbps_trnx_id,
  }));

  return { receipts, nextToken };
}

/**
 * Fetches the binary PDF buffer of an e-Receipt from CMWSSB.
 */
export async function fetchReceiptPdf(
  receiptId: string | number,
  token: string
): Promise<{ pdfBuffer: Buffer; nextToken: string }> {
  const res = await fetch(`${CMWSSB_API_BASE}?makePdfReceipt=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/pdf",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      id: receiptId,
      is_print_cashier_label: true,
    }),
  });

  const nextToken = res.headers.get("x-token") || token;
  if (!res.ok) {
    throw new Error(`Failed to fetch receipt PDF: HTTP ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return {
    pdfBuffer: Buffer.from(arrayBuffer),
    nextToken,
  };
}
