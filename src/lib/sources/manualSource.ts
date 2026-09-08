import { SubscriptionSource, SubscriptionSourceSyncResult } from "./types";
import { Subscription } from "../subscriptionTypes";

export class ManualSource implements SubscriptionSource {
  id = "manual";
  sourceType = "MANUAL" as const;
  name = "Manual (No External Statement)";
  shortName = "Manual";
  description = "Self-managed subscription with manual cycle tracking and 'Mark Paid' overrides";
  icon = "✋";
  defaultCategory = "Housing & Rent";
  defaultBillingCycle = "MONTHLY" as const;
  defaultName = "Manual Subscription";
  supportsStatement = false;
  supportsPayment = false;

  createDefaultConfig() {
    return {};
  }

  async sync(
    subscription: Subscription,
    options?: { userId?: string; onLog?: (level: string, message: string, details?: any) => void },
  ): Promise<SubscriptionSourceSyncResult> {
    options?.onLog?.("info", `Manual source "${subscription.name}" is updated manually by the user.`);
    return {
      success: true,
      cyclesUpdated: 0,
      message: "Manual subscription does not require automated background sync.",
    };
  }
}

export const manualSource = new ManualSource();
