import {
  BillingCycle,
  SourceType,
  Subscription,
  SubscriptionCategory,
} from "../subscriptionTypes";

export interface SourceConfigField {
  key: string;
  label: string;
  type: "text" | "select" | "number";
  placeholder?: string;
  description?: string;
  options?: { label: string; value: string }[];
  defaultValue?: string | number;
  required?: boolean;
}

export interface SubscriptionSourceSyncResult {
  success: boolean;
  cyclesUpdated: number;
  message?: string;
  error?: string;
  billsProcessed?: number;
  details?: Record<string, any>;
}

export interface SubscriptionSource<TConfig = Record<string, any>> {
  id: string; // e.g. "apartment_maintenance", "apartment_water", "tneb", "chennai_water", "gmail", "sms", "fixed", "manual"
  sourceType: SourceType; // "APARTMENT_MODULE" | "TNEB_MODULE" | "CHENNAI_WATER_MODULE" | "EMAIL_AUTOMATED" | "SMS_AUTOMATED" | "MANUAL"
  name: string;
  shortName: string;
  description: string;
  icon: string;
  defaultCategory: SubscriptionCategory | string;
  defaultBillingCycle: BillingCycle;
  defaultName: string;
  supportsStatement: boolean;
  supportsPayment: boolean;
  configFields?: SourceConfigField[];

  // Sync execution hook
  sync(
    subscription: Subscription,
    options?: { userId?: string; onLog?: (level: string, message: string, details?: any) => void },
  ): Promise<SubscriptionSourceSyncResult>;

  // Helper to generate default configuration for a new subscription
  createDefaultConfig?(): TConfig;
}
