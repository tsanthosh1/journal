import {
  HomefyApartment,
  HomefyBillRecord,
  HomefyUserProfile,
} from "./types";

export const BASE_URL = "https://api.homefy.co.in";
export const GRAPHQL_URL = `${BASE_URL}/graphql`;

/**
 * Sends SMS OTP to the provided mobile number
 */
export async function sendHomefyOtp(
  mobile: string,
  countryCode: string = "+91",
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const formattedCode = countryCode.startsWith("+") ? countryCode : `+${countryCode}`;
    const cleanMobile = mobile.trim().replace(/\D/g, "");

    const resp = await fetch(`${BASE_URL}/otp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countryCode: formattedCode, mobile: cleanMobile }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return {
        success: false,
        error: data.message || `Failed to send OTP (HTTP ${resp.status})`,
      };
    }

    const token = data.result?.token;
    if (!token) {
      return {
        success: false,
        error: "Server did not return an OTP session token.",
      };
    }

    return { success: true, token };
  } catch (err: any) {
    return { success: false, error: err.message || "Network error while sending OTP" };
  }
}

/**
 * Verifies SMS OTP and retrieves the base JWT access token
 */
export async function verifyHomefyOtp(
  otpToken: string,
  otpCode: string,
  mobile: string,
): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  try {
    const resp = await fetch(`${BASE_URL}/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: otpToken,
        code: otpCode.trim(),
        deviceId: `web-${mobile.trim()}`,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        deviceName: "Web Dashboard",
        deviceType: "mobile",
        osVersion: "14",
        appVersion: "1.19",
        platform: "android",
        fcmToken: "",
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return {
        success: false,
        error: data.message || `Verification failed (HTTP ${resp.status})`,
      };
    }

    const accessToken = data.result?.access_token;
    if (!accessToken) {
      return {
        success: false,
        error: "Could not extract access_token from response.",
      };
    }

    return { success: true, accessToken };
  } catch (err: any) {
    return { success: false, error: err.message || "Error verifying OTP" };
  }
}

/**
 * Sends a GraphQL request to Homefy GraphQL endpoint
 */
export async function makeHomefyGraphQLRequest<T = any>(
  query: string,
  variables?: Record<string, any>,
  token?: string,
): Promise<{ data?: T; errors?: any[] }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const json = await res.json();
  return json;
}

/**
 * Discovers apartments and flat requests linked to the user
 */
export async function fetchApartments(baseToken: string): Promise<HomefyApartment[]> {
  const query = `
    query FlatRequestList {
      myApartments {
        id
        name
        requests {
          id
          accessType
          accessStatus
          roleType
          flat {
            id
            flatNumber
            floorNo
            status
            block { id blockName }
          }
        }
      }
    }
  `;

  const resp = await makeHomefyGraphQLRequest<{ myApartments: HomefyApartment[] }>(query, undefined, baseToken);
  return resp.data?.myApartments || [];
}

/**
 * Swaps a base token for a flat-scoped access token
 */
export async function swapFlatToken(
  requestId: string,
  baseToken: string,
): Promise<{ swappedToken?: string; error?: string }> {
  const query = `
    query TokenSwap($data: AccessTokenInput!) {
      accessToken(data: $data) {
        token
      }
    }
  `;

  const resp = await makeHomefyGraphQLRequest<{ accessToken: { token: string } }>(
    query,
    { data: { requestId } },
    baseToken,
  );

  const token = resp.data?.accessToken?.token;
  if (!token) {
    const errMsg = resp.errors?.[0]?.message || "Failed to swap flat access token";
    return { error: errMsg };
  }

  return { swappedToken: token };
}

/**
 * Retrieves bills list from Homefy API
 */
export async function fetchHomefyBills(
  token: string,
  statusFilter: "ALL" | "PENDING" | "PAID" = "ALL",
): Promise<HomefyBillRecord[]> {
  const filterVar: Record<string, any> = {};
  if (statusFilter.toUpperCase() === "PENDING" || statusFilter.toUpperCase() === "PAID") {
    filterVar["status"] = statusFilter.toUpperCase();
  }

  const query = `
    query MyBills($filter: MybillFilterInput!) {
      myBills(filter: $filter) {
        data {
          id
          billId
          amount
          fineAmount
          totalAmount
          status
          lastDate
          category { name }
          maintenance {
            description
            startDate
            endDate
          }
          paidRequest {
            id
            status
            paymentMode
            date
            image {
              id
              url
              fileName
            }
          }
        }
      }
    }
  `;

  const resp = await makeHomefyGraphQLRequest<{ myBills: { data: HomefyBillRecord[] } }>(
    query,
    { filter: filterVar },
    token,
  );

  const rawBills = resp.data?.myBills?.data || [];

  return rawBills.map((b) => {
    let cycleMonth = "";
    if (b.maintenance?.startDate) {
      cycleMonth = b.maintenance.startDate.slice(0, 7);
    } else if (b.lastDate) {
      cycleMonth = b.lastDate.slice(0, 7);
    }

    return {
      ...b,
      cycleMonth,
    };
  });
}

/**
 * Retrieves full details of a specific bill
 */
export async function fetchHomefyBillDetail(
  token: string,
  billIdOrInternalId: string,
): Promise<HomefyBillRecord | null> {
  const query = `
    query Bill($billId: ID!) {
      bill(id: $billId) {
        id
        billId
        amount
        fineAmount
        actualAmount
        totalAmount
        totalTransactionCharge
        status
        lastDate
        overDueDate
        createdAt
        category { name }
        flat {
          flatNumber
          block { blockName }
        }
        maintenance {
          id
          description
          startDate
          endDate
        }
        paidRequest {
          id
          status
          paymentMode
          transactionNo
          date
          image { url }
        }
        notes
      }
    }
  `;

  const resp = await makeHomefyGraphQLRequest<{ bill: HomefyBillRecord }>(
    query,
    { billId: billIdOrInternalId },
    token,
  );

  return resp.data?.bill || null;
}

/**
 * Retrieves the logged-in user profile from Homefy
 */
export async function fetchHomefyProfile(token: string): Promise<HomefyUserProfile | null> {
  const query = `
    query GetUserProfile {
      me {
        id
        firstName
        lastName
        phoneNumber
        email
        accessType
        roles
      }
    }
  `;

  const resp = await makeHomefyGraphQLRequest<{ me: HomefyUserProfile }>(query, undefined, token);
  return resp.data?.me || null;
}

/**
 * Downloads invoice or receipt PDF as a Response stream
 */
export async function fetchReceiptPdfResponse(
  token: string,
  internalBillId: string,
  receiptType: "invoice" | "receipt" = "invoice",
): Promise<Response> {
  const url = `${BASE_URL}/receipts/bills/${internalBillId}?receiptType=${receiptType}`;
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}
