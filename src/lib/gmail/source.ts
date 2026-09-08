import { SubscriptionSource, SubscriptionSourceSyncResult } from "../sources/types";
import { Subscription } from "../subscriptionTypes";
import { getValidGmailToken } from "./oauth";
import { syncSubscriptionWithGmail } from "./currentCycleSync";

export class GmailSource implements SubscriptionSource {
  id = "gmail";
  sourceType = "EMAIL_AUTOMATED" as const;
  name = "Gmail (E-Statements & Receipts)";
  shortName = "Gmail";
  description = "Extracts bills, statements, and debit transaction alerts directly from your connected Gmail inbox";
  icon = "✉️";
  defaultCategory = "Credit Cards";
  defaultBillingCycle = "MONTHLY" as const;
  defaultName = "Email Subscription";
  supportsStatement = true;
  supportsPayment = true;

  configFields = [
    {
      key: "statementQuery",
      label: "Statement Search Query",
      type: "text" as const,
      placeholder: 'from:statements@bank.com subject:"e-statement"',
      description: "Gmail search syntax used to find monthly statements or invoices",
    },
    {
      key: "paymentQuery",
      label: "Payment Confirmation Query",
      type: "text" as const,
      placeholder: 'from:alerts@bank.com "payment received"',
      description: "Gmail search syntax used to match debit alerts or payment receipts",
    },
  ];

  createDefaultConfig() {
    return {
      enabled: true,
      statementQuery: "",
      paymentQuery: "",
      dedupStrategy: "SAME_DAY_SAME_AMOUNT",
    };
  }

  async sync(
    subscription: Subscription,
    options?: { userId?: string; onLog?: (level: string, message: string, details?: any) => void },
  ): Promise<SubscriptionSourceSyncResult> {
    const userId = options?.userId || subscription.userId || "default-user";
    const onLog = options?.onLog;

    try {
      const tokenRecord = await getValidGmailToken(userId);
      if (!tokenRecord) {
        const err = "Gmail is not connected. Please authenticate your account in Settings.";
        onLog?.("error", err);
        return { success: false, cyclesUpdated: 0, error: err };
      }

      onLog?.("info", `Searching Gmail for "${subscription.name}" statements and payments...`);
      const res = await syncSubscriptionWithGmail(
        subscription,
        tokenRecord.accessToken,
        (event) => onLog?.(event.level, event.message, event.details),
      );

      return {
        success: res.success,
        cyclesUpdated: res.historicalCyclesProcessed || (res.success ? 1 : 0),
        billsProcessed: res.newMessagesProcessed || 0,
        message: res.success ? `Processed ${res.newMessagesProcessed} messages` : res.error,
        error: res.error,
        details: res,
      };
    } catch (err: any) {
      onLog?.("error", `Gmail sync failed: ${err.message}`);
      return {
        success: false,
        cyclesUpdated: 0,
        error: err.message,
      };
    }
  }
}

export const gmailSource = new GmailSource();
