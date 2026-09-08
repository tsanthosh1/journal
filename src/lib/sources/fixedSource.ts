import { SubscriptionSource, SubscriptionSourceSyncResult } from "./types";
import { Subscription } from "../subscriptionTypes";

export class FixedAmountSource implements SubscriptionSource {
  id = "fixed";
  sourceType = "MANUAL" as const;
  name = "Fixed Amount (Loans & Predictable Recurring)";
  shortName = "Fixed Amount";
  description = "Fixed recurring payment without an external statement invoice (e.g. loan EMI or flat rate subscription)";
  icon = "🔒";
  defaultCategory = "Loans & EMIs";
  defaultBillingCycle = "MONTHLY" as const;
  defaultName = "Fixed Recurring Payment";
  supportsStatement = false;
  supportsPayment = true;

  configFields = [
    {
      key: "defaultAmount",
      label: "Fixed Monthly Amount (₹)",
      type: "number" as const,
      placeholder: "e.g. 15000",
      description: "Standard installment amount expected every cycle",
      required: true,
    },
  ];

  createDefaultConfig() {
    return {};
  }

  async sync(
    subscription: Subscription,
    options?: { userId?: string; onLog?: (level: string, message: string, details?: any) => void },
  ): Promise<SubscriptionSourceSyncResult> {
    options?.onLog?.("info", `Fixed amount source "${subscription.name}" has no external statement to fetch.`);
    return {
      success: true,
      cyclesUpdated: 0,
      message: "Fixed amount source requires no external statement synchronization.",
    };
  }
}

export const fixedAmountSource = new FixedAmountSource();
