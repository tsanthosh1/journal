// Type definitions for Apartment Management (Homefy)

export interface HomefySession {
  mobile: string;
  countryCode: string;
  baseToken?: string;
  swappedToken?: string;
  activeRequestId?: string;
  apartmentId?: string;
  apartmentName?: string;
  flatNumber?: string;
  blockName?: string;
  role?: string;
  otpToken?: string;
  updatedAt: string;
}

export interface HomefyFlat {
  id: string;
  flatNumber: string;
  floorNo?: number | string;
  status?: string;
  block?: {
    id?: string;
    blockName?: string;
  };
}

export interface HomefyFlatRequest {
  id: string;
  accessType?: string;
  accessStatus: string; // e.g. "APPROVED", "PENDING"
  roleType?: string; // e.g. "USER", "OWNER", "TENANT"
  flat?: HomefyFlat;
}

export interface HomefyApartment {
  id: string;
  name: string;
  requests: HomefyFlatRequest[];
}

export interface HomefyPaidRequest {
  id: string;
  status: string; // "PENDING", "APPROVED", "REJECTED"
  paymentMode?: string; // "ACCOUNT", "UPI", "CASH", etc.
  transactionNo?: string;
  date?: string;
  image?: {
    id?: string;
    url: string;
    fileName?: string;
  };
}

export interface HomefyMaintenance {
  id?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
}

export interface HomefyBillRecord {
  id: string; // internal UUID e.g. cmti5cfhi0krmnyesnl1pikfg
  billId: string; // human-readable e.g. BI-STO-1333
  amount: number;
  fineAmount: number;
  actualAmount?: number;
  totalAmount: number;
  totalTransactionCharge?: number;
  status: "PAID" | "PENDING" | "APPROVAL_PENDING" | string;
  lastDate?: string; // Due date (ISO)
  overDueDate?: string | null;
  createdAt?: string;
  category?: {
    name: string;
  };
  flat?: {
    flatNumber?: string;
    block?: {
      blockName?: string;
    };
  };
  maintenance?: HomefyMaintenance | null;
  paidRequest?: HomefyPaidRequest[];
  notes?: string | null;
  cycleMonth?: string; // Derived YYYY-MM
  updatedAt?: string;
}

export interface HomefyUserProfile {
  id: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
  accessType?: string;
  roles?: string[];
}

export interface ApartmentSubscriptionConfig {
  apartmentId?: string;
  apartmentName?: string;
  flatNumber?: string;
  categoryFilter?: string; // e.g. "Maintenance Bill" | "Water Bill" | "Corpus Fund" | "ALL"
  autoSyncWithApartmentModule?: boolean;
}
