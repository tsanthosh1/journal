export interface TnebSlabRate {
  fromUnit: number;
  toUnit: string | number;
  rateRs: number;
  maxUnit: string | number;
}

export interface TnebBillRecord {
  id: string; // e.g. "09299011890_2026-08-20"
  consumerNumber: string;
  assessmentDate: string; // ISO "YYYY-MM-DD"
  rawAssessmentDate: string; // "20/08/2026"
  entryDate?: string;
  status: string; // "NORMAL"
  kwh?: number;
  kvah?: number;
  recordedDemand?: number;
  powerFactor?: string;
  unitsConsumed: number;
  ccCharges: number;
  electricityTax: number;
  weldingCharges?: number;
  excessDemand?: number;
  pfPenalty?: number;
  fixedCharges: number;
  totalCharges: number;
  advanceAmountPaid: number;
  adjustment: number;
  amountToBePaid: number;
  dueDate?: string; // ISO "YYYY-MM-DD"
  rawDueDate?: string; // "09/09/2026"
  amountPaid: number;
  receiptNo?: string;
  paymentDate?: string; // ISO "YYYY-MM-DD"
  rawPaymentDate?: string;
  isPaid: boolean;
  rawUrl?: string; // bill calculation link
  cycleMonth: string; // "2026-08"
  createdAt?: string;
  updatedAt?: string;
}

export interface TnebConsumerAccount {
  consumerNumber: string; // "09299011890"
  consumerName: string; // "MR.SANTHOSH.T"
  region: string; // "09-KANCHEEPURAM"
  phase: string; // "3"
  circle: string; // "401-South2"
  sanctionedLoad: string; // "9 KW"
  section: string; // "299-MCN Nagar"
  sectionAddress?: string;
  distribution: string; // "011-ring road"
  meterNumber: string; // "7143639"
  serviceNumber: string; // "890"
  accdAsOnDate: string; // "9694 / NIL"
  address: string; // ",60 ,9TH CROSS STREET,OKKIYAM THORAIPAKKAM,SHOLINGANALLUR"
  mcdAsOnDate: string; // "2000 / 0"
  serviceStatus: string; // "LIVE"
  serviceCategory: string; // "OTHERS"
  tariffCode: string; // "LA1A / DOMESTIC"
  panNumber?: string;
  aadharLinked?: boolean;
  duesToBePaid: string | number; // "NIL" or number
  hasDue: boolean;
  latestBill?: TnebBillRecord;
  billsCount?: number;
  totalUnitsConsumed?: number;
  slabRates?: TnebSlabRate[];
  lastSyncedAt: string;
  updatedAt: string;
  createdAt: string;
}

export interface TnebScrapeOptions {
  username?: string;
  password?: string;
  targetConsumerNumbers?: string[]; // e.g. ["09299011890", "024310032538"]
  syncAllFound?: boolean;
  headless?: boolean;
  maxPages?: number;
}

export interface TnebTrackedConsumer {
  consumerNumber: string;
  nickname?: string;
  addressSnippet?: string;
  enabled: boolean;
  notes?: string;
  addedAt?: string;
}

export interface TnebConfig {
  trackedConsumers: TnebTrackedConsumer[];
  syncAllFound: boolean;
  defaultUsername?: string;
  autoSyncEnabled?: boolean;
  updatedAt?: string;
}

export interface TnebSyncResult {
  success: boolean;
  accountsProcessed: number;
  billsProcessed: number;
  accounts: TnebConsumerAccount[];
  errors: string[];
  logs: string[];
}
