import { SubscriptionSource, SubscriptionSourceSyncResult } from "../sources/types";
import { Subscription } from "../subscriptionTypes";
import { getAllTnebAccounts, getTnebBillsForConsumer } from "./storage";
import { syncTnebToSubscriptions } from "./subscriptionBridge";

export class TnebSource implements SubscriptionSource {
  id = "tneb";
  sourceType = "TNEB_MODULE" as const;
  name = "Tamil Nadu Electricity Board (TNEB)";
  shortName = "TNEB Portal";
  description = "Syncs bi-monthly electricity bills, meter readings, and official payment receipts from TANGEDCO";
  icon = "⚡";
  defaultCategory = "Utilities";
  defaultBillingCycle = "CUSTOM" as const;
  defaultName = "Tamil Nadu Electricity Board (TNEB)";
  supportsStatement = true;
  supportsPayment = true;

  configFields = [
    {
      key: "consumerNumber",
      label: "Consumer Number",
      type: "text" as const,
      placeholder: "e.g. 09259005123",
      description: "Your 11 or 12 digit TNEB/TANGEDCO consumer number",
      required: true,
    },
  ];

  createDefaultConfig() {
    return {
      consumerNumber: "",
      autoSyncWithEbModule: true,
    };
  }

  async sync(
    subscription: Subscription,
    options?: { userId?: string; onLog?: (level: string, message: string, details?: any) => void },
  ): Promise<SubscriptionSourceSyncResult> {
    const onLog = options?.onLog;
    const consumerNo = subscription.tnebConfig?.consumerNumber;

    if (!consumerNo) {
      const err = "No consumer number configured on TNEB subscription";
      onLog?.("warn", err);
      return { success: false, cyclesUpdated: 0, error: err };
    }

    try {
      onLog?.("info", `Syncing TNEB bills for consumer: ${consumerNo}`);
      const accounts = await getAllTnebAccounts(subscription.userId);
      const targetAccount = accounts.find((a) => a.consumerNumber === consumerNo);

      if (!targetAccount) {
        const msg = `No cached TNEB account found for consumer ${consumerNo}. Please sync via TNEB portal tab.`;
        onLog?.("warn", msg);
        return { success: false, cyclesUpdated: 0, message: msg };
      }

      const bills = await getTnebBillsForConsumer(consumerNo, subscription.userId);
      const updatedCount = await syncTnebToSubscriptions(targetAccount, bills, subscription.userId);
      onLog?.("success", `TNEB subscription synchronized (${bills.length} bills processed).`);

      return {
        success: true,
        cyclesUpdated: updatedCount,
        billsProcessed: bills.length,
        message: `Successfully synchronized ${bills.length} TNEB bills`,
      };
    } catch (err: any) {
      onLog?.("error", `TNEB sync error: ${err.message}`);
      return {
        success: false,
        cyclesUpdated: 0,
        error: err.message,
      };
    }
  }
}

export const tnebSource = new TnebSource();
