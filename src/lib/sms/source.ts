import { SubscriptionSource, SubscriptionSourceSyncResult } from "../sources/types";
import { Subscription } from "../subscriptionTypes";
import { runSmsSyncEngine } from "./smsSyncEngine";

export class SmsSource implements SubscriptionSource {
  id = "sms";
  sourceType = "SMS_AUTOMATED" as const;
  name = "SMS (Bank Account & Loan Debits)";
  shortName = "SMS Alerts";
  description = "Monitors synced Android transaction SMS messages for loan repayments, EMI debits, and bill deductions";
  icon = "💬";
  defaultCategory = "Loans & EMIs";
  defaultBillingCycle = "MONTHLY" as const;
  defaultName = "Loan / EMI";
  supportsStatement = true;
  supportsPayment = true;

  configFields = [
    {
      key: "senderQuery",
      label: "SMS Sender ID / Header",
      type: "text" as const,
      placeholder: "e.g. HDFCBK, AXISBK, BAJAJ",
      description: "Sender ID substring to filter incoming transaction SMS",
    },
    {
      key: "filterKeywords",
      label: "Filter Keywords",
      type: "text" as const,
      placeholder: "loan, emi, recovery, debited",
      description: "Comma-separated words that must be present in the SMS text",
    },
    {
      key: "accountOrLoanDigits",
      label: "Account / Loan Number Digits",
      type: "text" as const,
      placeholder: "e.g. 4821",
      description: "Specific trailing digits to match against the debit notification",
    },
  ];

  createDefaultConfig() {
    return {
      enabled: true,
      senderQuery: "",
      filterKeywords: ["loan", "emi", "debited"],
      accountOrLoanDigits: "",
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
      onLog?.("info", `Scanning synced SMS messages for loan/EMI debits for "${subscription.name}"...`);
      const res = await runSmsSyncEngine(userId);
      onLog?.("success", `SMS engine processed ${res.totalSmsFound} SMS messages, updated ${res.updatedSubscriptions} subscription(s).`);

      return {
        success: res.success,
        cyclesUpdated: res.updatedSubscriptions,
        billsProcessed: res.matchedSmsCount,
        message: res.summaryText,
        details: res,
      };
    } catch (err: any) {
      onLog?.("error", `SMS sync error: ${err.message}`);
      return {
        success: false,
        cyclesUpdated: 0,
        error: err.message,
      };
    }
  }
}

export const smsSource = new SmsSource();
