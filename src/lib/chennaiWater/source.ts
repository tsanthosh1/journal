import { SubscriptionSource, SubscriptionSourceSyncResult } from "../sources/types";
import { Subscription } from "../subscriptionTypes";
import { syncChennaiWaterToSubscriptions } from "./subscriptionBridge";

export class ChennaiWaterSource implements SubscriptionSource {
  id = "chennai_water";
  sourceType = "CHENNAI_WATER_MODULE" as const;
  name = "Chennai Metro Water (CMWSSB)";
  shortName = "Metro Water";
  description = "Syncs half-yearly water & sewerage tax assessments and official payment receipts from CMWSSB";
  icon = "💧";
  defaultCategory = "Utilities";
  defaultBillingCycle = "HALF_YEARLY" as const;
  defaultName = "Chennai Metro Water (CMWSSB)";
  supportsStatement = true;
  supportsPayment = true;

  configFields = [
    {
      key: "billNumber",
      label: "New Bill Number (Area-Division-Bill)",
      type: "text" as const,
      placeholder: "e.g. 15-193-097538",
      description: "Format: Area-Division-BillNumber (found on your Metro Water card/receipt)",
      required: true,
    },
  ];

  createDefaultConfig() {
    return {
      billNumber: "15-193-097538",
      existingBillNumber: "15-193-56648-000",
      componentType: "TAX_AND_CHARGES" as const,
      autoSyncWithMetroWaterModule: true,
    };
  }

  async sync(
    subscription: Subscription,
    options?: { userId?: string; onLog?: (level: string, message: string, details?: any) => void },
  ): Promise<SubscriptionSourceSyncResult> {
    const userId = options?.userId || subscription.userId || "default-user";
    const onLog = options?.onLog;

    try {
      onLog?.("info", `Syncing Chennai Metro Water for "${subscription.name}"`);
      const count = await syncChennaiWaterToSubscriptions(userId);
      onLog?.("success", `Chennai Metro Water reconciled ${count} subscription(s).`);

      return {
        success: true,
        cyclesUpdated: count,
        message: `Successfully synchronized Chennai Metro Water records (${count} updated)`,
      };
    } catch (err: any) {
      onLog?.("error", `Chennai Metro Water sync error: ${err.message}`);
      return {
        success: false,
        cyclesUpdated: 0,
        error: err.message,
      };
    }
  }
}

export const chennaiWaterSource = new ChennaiWaterSource();
