import { SubscriptionSource, SubscriptionSourceSyncResult } from "../sources/types";
import { Subscription } from "../subscriptionTypes";
import { createOrLinkSubscriptionForGcp } from "./subscriptionBridge";

export class GcpBillingSource implements SubscriptionSource {
  id = "gcp_billing";
  sourceType = "GCP_BILLING_MODULE" as const;
  name = "Google Cloud Platform (BigQuery & CSVs)";
  shortName = "Google Cloud";
  description = "Syncs monthly cloud infrastructure bills, credits, and invoice payments exported from BigQuery and CSVs";
  icon = "☁️";
  defaultCategory = "Software & Tools";
  defaultBillingCycle = "MONTHLY" as const;
  defaultName = "Google Cloud Platform";
  supportsStatement = true;
  supportsPayment = true;

  createDefaultConfig() {
    return {
      autoSyncWithGcpBilling: true,
    };
  }

  async sync(
    subscription: Subscription,
    options?: { userId?: string; onLog?: (level: string, message: string, details?: any) => void },
  ): Promise<SubscriptionSourceSyncResult> {
    const onLog = options?.onLog;
    const userId = options?.userId || subscription.userId;

    try {
      onLog?.("info", `Syncing Google Cloud Billing for: ${subscription.name}`);
      await createOrLinkSubscriptionForGcp(userId, subscription.name);
      onLog?.("success", `Google Cloud Billing synchronized successfully.`);
      return {
        success: true,
        cyclesUpdated: 1,
        message: "Google Cloud Billing synchronized successfully.",
      };
    } catch (err: any) {
      const msg = `GCP Billing sync error: ${err.message}`;
      onLog?.("error", msg);
      return { success: false, cyclesUpdated: 0, error: msg };
    }
  }
}

export const gcpBillingSource = new GcpBillingSource();
