import { getFirebaseAdmin } from "../firebaseAdmin";
import { createSyncLogger, SyncLogCallback, SyncLogEvent } from "../gmail/syncLogger";
import { getValidGmailToken } from "../gmail/oauth";
import { syncSubscriptionWithGmail } from "../gmail/currentCycleSync";
import { syncHistoricalSubscriptionWithGmail } from "../gmail/historicalSync";
import { syncAllSubscriptions } from "../gmail/syncOrchestrator";
import { runSmsSyncEngine, SmsSyncResult } from "../sms/smsSyncEngine";
import { getAllTnebAccounts, getTnebBillsForConsumer } from "../tneb/storage";
import { syncTnebToSubscriptions } from "../tneb/subscriptionBridge";
import { getApartmentSession, getCachedApartmentBills, saveCachedApartmentBills } from "../apartment/storage";
import { fetchHomefyBills } from "../apartment/client";
import { syncApartmentBillsToSubscriptions } from "../apartment/subscriptionBridge";
import { HomefyBillRecord } from "../apartment/types";
import { syncChennaiWaterToSubscriptions } from "../chennaiWater/subscriptionBridge";
import { ensureSubscriptionCurrentMonth, getSubscription } from "../serverSubscriptions";
import { saveSyncLogFile, SyncLogDetailEvent } from "./syncFileLogger";

export type UnifiedSyncSource = "GMAIL" | "SMS" | "TNEB" | "APARTMENT" | "CHENNAI_WATER";

export interface UnifiedSyncOptions {
  userId?: string;
  sources?: UnifiedSyncSource[];
  subscriptionId?: string;
  mode?: "current" | "historical";
  maxStatements?: number;
}

export interface UnifiedSyncResult {
  success: boolean;
  userId: string;
  sourcesRun: UnifiedSyncSource[];
  gmail?: {
    syncedCount: number;
    totalSubscriptions: number;
    newMessagesProcessed: number;
    results: any[];
  };
  sms?: SmsSyncResult;
  tneb?: {
    accountsProcessed: number;
    subscriptionsUpdated: number;
  };
  apartment?: {
    billsProcessed: number;
    subscriptionsUpdated: number;
  };
  chennaiWater?: {
    subscriptionsUpdated: number;
  };
  errors: string[];
  durationMs: number;
}

/**
 * Unified Sync Orchestrator
 * Coordinates synchronization across all active sources (Gmail, SMS, TNEB)
 * with unified live streaming logs and unified audit reporting.
 */
export async function runUnifiedSync(
  options: UnifiedSyncOptions = {},
  onLog?: SyncLogCallback,
): Promise<UnifiedSyncResult> {
  const startTime = Date.now();
  const collectedEvents: SyncLogDetailEvent[] = [];
  const logWrapper: SyncLogCallback = (event: SyncLogEvent) => {
    collectedEvents.push({
      timestamp: event.timestamp || new Date().toISOString(),
      level: event.level,
      message: event.message,
      details: event.details,
    });
    if (onLog) {
      onLog(event);
    }
  };
  const log = createSyncLogger(logWrapper);
  const userId = options.userId || "default_user";
  const requestedSources = options.sources && options.sources.length > 0
    ? options.sources
    : (["GMAIL", "SMS", "TNEB"] as UnifiedSyncSource[]);

  log("info", `Unified Sync Orchestrator initiated for user "${userId}" [Sources: ${requestedSources.join(", ")}]`);

  const { db } = getFirebaseAdmin();
  const errors: string[] = [];
  const sourcesRun: UnifiedSyncSource[] = [];

  let gmailResultSummary: UnifiedSyncResult["gmail"] = undefined;
  let smsResultSummary: SmsSyncResult | undefined = undefined;
  let tnebResultSummary: UnifiedSyncResult["tneb"] = undefined;
  let apartmentResultSummary: UnifiedSyncResult["apartment"] = undefined;
  let chennaiWaterResultSummary: UnifiedSyncResult["chennaiWater"] = undefined;

  // If a specific subscription is requested
  if (options.subscriptionId) {
    const sub = await getSubscription(options.subscriptionId);
    if (!sub) {
      const err = `Subscription with ID "${options.subscriptionId}" not found.`;
      log("error", err);
      return {
        success: false,
        userId,
        sourcesRun: [],
        errors: [err],
        durationMs: Date.now() - startTime,
      };
    }

    // Rollover check before sync
    await ensureSubscriptionCurrentMonth(sub, db);

    if (sub.source === "TNEB_MODULE" && requestedSources.includes("TNEB")) {
      sourcesRun.push("TNEB");
      log("info", `Synchronizing TNEB subscription: ${sub.name}`, { subscriptionId: sub.id });
      try {
        if (sub.tnebConfig?.consumerNumber) {
          const accounts = await getAllTnebAccounts();
          const targetAccount = accounts.find((a) => a.consumerNumber === sub.tnebConfig?.consumerNumber);
          if (targetAccount) {
            const bills = await getTnebBillsForConsumer(targetAccount.consumerNumber);
            const count = await syncTnebToSubscriptions(targetAccount, bills);
            tnebResultSummary = { accountsProcessed: 1, subscriptionsUpdated: count };
            log("success", `TNEB subscription synchronized with ${bills.length} stored bills.`);
          } else {
            log("warn", `No cached TNEB bills found for consumer ${sub.tnebConfig.consumerNumber}. Trigger TNEB portal sync to refresh.`);
          }
        }
      } catch (err: any) {
        const msg = `TNEB sync error: ${err.message}`;
        errors.push(msg);
        log("error", msg);
      }
    } else if (sub.source === "SMS_AUTOMATED" && requestedSources.includes("SMS")) {
      sourcesRun.push("SMS");
      log("info", `Running SMS sync for loan/EMI subscription: ${sub.name}`);
      try {
        const smsRes = await runSmsSyncEngine(userId, sub.id);
        smsResultSummary = smsRes;
      } catch (err: any) {
        const msg = `SMS sync error: ${err.message}`;
        errors.push(msg);
        log("error", msg);
      }
    } else if (sub.source === "APARTMENT_MODULE" && requestedSources.includes("APARTMENT")) {
      sourcesRun.push("APARTMENT");
      log("info", `Synchronizing Apartment bill subscription: ${sub.name}`);
      try {
        const session = await getApartmentSession(userId);
        let bills: HomefyBillRecord[] = [];
        if (session?.swappedToken) {
          try {
            bills = await fetchHomefyBills(session.swappedToken, "ALL");
            await saveCachedApartmentBills(bills, userId);
          } catch (e) {
            bills = await getCachedApartmentBills(userId);
          }
        } else {
          bills = await getCachedApartmentBills(userId);
        }
        const count = await syncApartmentBillsToSubscriptions(bills, userId, sub.id);
        log("success", `Apartment sync updated subscription with ${bills.length} community bills.`);
      } catch (err: any) {
        const msg = `Apartment sync error: ${err.message}`;
        errors.push(msg);
        log("error", msg);
      }
    } else if (sub.source === "CHENNAI_WATER_MODULE" && requestedSources.includes("CHENNAI_WATER")) {
      sourcesRun.push("CHENNAI_WATER");
      log("info", `Synchronizing Chennai Metro Water subscription: ${sub.name}`);
      try {
        const count = await syncChennaiWaterToSubscriptions(userId);
        chennaiWaterResultSummary = { subscriptionsUpdated: count };
        log("success", `Chennai Metro Water sync reconciled ${count} subscription(s).`);
      } catch (err: any) {
        const msg = `Chennai Metro Water sync error: ${err.message}`;
        errors.push(msg);
        log("error", msg);
      }
    } else if (requestedSources.includes("GMAIL")) {
      // Default to Gmail sync for EMAIL_AUTOMATED or manual with emailConfig
      sourcesRun.push("GMAIL");
      const tokenRecord = await getValidGmailToken(userId);
      if (!tokenRecord) {
        const err = "Gmail is not connected. Please connect your Gmail account via OAuth.";
        errors.push(err);
        log("error", err);
      } else {
        if (options.mode === "historical") {
          const res = await syncHistoricalSubscriptionWithGmail(
            sub,
            tokenRecord.accessToken,
            options.maxStatements || 24,
            logWrapper,
          );
          gmailResultSummary = {
            syncedCount: 1,
            totalSubscriptions: 1,
            newMessagesProcessed: res.messagesScanned,
            results: [res],
          };
        } else {
          const res = await syncSubscriptionWithGmail(sub, tokenRecord.accessToken, logWrapper);
          gmailResultSummary = {
            syncedCount: res.success ? 1 : 0,
            totalSubscriptions: 1,
            newMessagesProcessed: res.newMessagesProcessed,
            results: [res],
          };
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const hasErrors = errors.length > 0;
    saveSyncLogFile({
      actionName: `Unified Sync [${sourcesRun.join(", ") || "SERVICE"}] - ${sub.name}`,
      logName: `${sub.name} Sync`,
      userId,
      status: hasErrors ? "FAILED" : "SUCCESS",
      summary: hasErrors
        ? `Sync failed with ${errors.length} error(s): ${errors.join("; ")}`
        : `Synchronized ${sub.name} successfully`,
      durationMs,
      events: collectedEvents,
      stats: {
        subscriptionId: sub.id,
        subscriptionName: sub.name,
        sourcesRun,
        tneb: tnebResultSummary,
        sms: smsResultSummary,
        apartment: apartmentResultSummary,
        chennaiWater: chennaiWaterResultSummary,
        gmail: gmailResultSummary,
      },
    });

    return {
      success: !hasErrors,
      userId,
      sourcesRun,
      gmail: gmailResultSummary,
      sms: smsResultSummary,
      tneb: tnebResultSummary,
      apartment: apartmentResultSummary,
      chennaiWater: chennaiWaterResultSummary,
      errors,
      durationMs,
    };
  }

  // Global Sync across all requested sources

  // 1. Gmail Sync
  if (requestedSources.includes("GMAIL")) {
    sourcesRun.push("GMAIL");
    log("info", "─── Phase 1: Gmail Recurring Statements & Payments ───");
    try {
      const gmailSummary = await syncAllSubscriptions(userId, logWrapper);
      gmailResultSummary = {
        syncedCount: gmailSummary.syncedCount,
        totalSubscriptions: gmailSummary.totalSubscriptions,
        newMessagesProcessed: gmailSummary.totalNewMessages,
        results: gmailSummary.results,
      };
      if (gmailSummary.errors.length > 0) {
        errors.push(...gmailSummary.errors);
      }
    } catch (err: any) {
      const msg = `Gmail Sync failed: ${err.message}`;
      errors.push(msg);
      log("error", msg);
    }
  }

  // 2. SMS Sync
  if (requestedSources.includes("SMS")) {
    sourcesRun.push("SMS");
    log("info", "─── Phase 2: SMS Bank & Loan Deductions ───");
    try {
      const smsRes = await runSmsSyncEngine(userId);
      smsResultSummary = smsRes;
      log("success", smsRes.summaryText);
    } catch (err: any) {
      const msg = `SMS Sync failed: ${err.message}`;
      errors.push(msg);
      log("error", msg);
    }
  }

  // 3. TNEB Bridge Sync
  if (requestedSources.includes("TNEB")) {
    sourcesRun.push("TNEB");
    log("info", "─── Phase 3: Electricity Board (TNEB) Billing Reconciliation ───");
    try {
      const accounts = await getAllTnebAccounts();
      let updatedSubsTotal = 0;
      for (const account of accounts) {
        const bills = await getTnebBillsForConsumer(account.consumerNumber);
        const count = await syncTnebToSubscriptions(account, bills);
        updatedSubsTotal += count;
      }
      tnebResultSummary = {
        accountsProcessed: accounts.length,
        subscriptionsUpdated: updatedSubsTotal,
      };
      log("success", `TNEB bridge checked ${accounts.length} EB account(s), reconciled ${updatedSubsTotal} subscription(s).`);
    } catch (err: any) {
      const msg = `TNEB Sync failed: ${err.message}`;
      errors.push(msg);
      log("error", msg);
    }
  }

  // 4. Apartment (Homefy) Sync
  if (requestedSources.includes("APARTMENT")) {
    sourcesRun.push("APARTMENT");
    log("info", "─── Phase 4: Apartment Management (Homefy) Bills ───");
    try {
      const session = await getApartmentSession(userId);
      let bills: HomefyBillRecord[] = [];
      if (session?.swappedToken) {
        try {
          bills = await fetchHomefyBills(session.swappedToken, "ALL");
          await saveCachedApartmentBills(bills, userId);
          log("info", `Retrieved ${bills.length} real-time bills from Homefy API.`);
        } catch (e: any) {
          log("warn", `Live Homefy API unavailable, using cached bills: ${e.message}`);
          bills = await getCachedApartmentBills(userId);
        }
      } else {
        bills = await getCachedApartmentBills(userId);
      }
      const count = await syncApartmentBillsToSubscriptions(bills, userId);
      apartmentResultSummary = {
        billsProcessed: bills.length,
        subscriptionsUpdated: count,
      };
      log("success", `Apartment module reconciled ${count} subscription(s) across ${bills.length} bill(s).`);
    } catch (err: any) {
      const msg = `Apartment sync failed: ${err.message}`;
      errors.push(msg);
      log("error", msg);
    }
  }

  // 5. Chennai Metro Water (CMWSSB) Sync
  if (requestedSources.includes("CHENNAI_WATER")) {
    sourcesRun.push("CHENNAI_WATER");
    log("info", "─── Phase 5: Chennai Metro Water (CMWSSB) Taxes & Charges ───");
    try {
      const count = await syncChennaiWaterToSubscriptions(userId);
      chennaiWaterResultSummary = {
        subscriptionsUpdated: count,
      };
      log("success", `Chennai Metro Water reconciled ${count} subscription(s).`);
    } catch (err: any) {
      const msg = `Chennai Metro Water sync failed: ${err.message}`;
      errors.push(msg);
      log("error", msg);
    }
  }

  const durationMs = Date.now() - startTime;
  log("success", `Unified synchronization completed in ${(durationMs / 1000).toFixed(1)}s across [${sourcesRun.join(", ")}]`);

  saveSyncLogFile({
    actionName: `Unified Sync [${sourcesRun.join(", ")}]`,
    logName: `Unified Sync (${sourcesRun.join(", ")})`,
    userId,
    status: errors.length > 0 ? (sourcesRun.length > errors.length ? "WARNING" : "FAILED") : "SUCCESS",
    summary: errors.length > 0
      ? `Completed with ${errors.length} error(s): ${errors.slice(0, 2).join("; ")}`
      : `Successfully synchronized across ${sourcesRun.length} service(s)`,
    durationMs,
    events: collectedEvents,
    stats: {
      sourcesRun,
      gmail: gmailResultSummary,
      sms: smsResultSummary,
      tneb: tnebResultSummary,
      apartment: apartmentResultSummary,
      chennaiWater: chennaiWaterResultSummary,
    },
  });

  return {
    success: errors.length === 0,
    userId,
    sourcesRun,
    gmail: gmailResultSummary,
    sms: smsResultSummary,
    tneb: tnebResultSummary,
    apartment: apartmentResultSummary,
    chennaiWater: chennaiWaterResultSummary,
    errors,
    durationMs,
  };
}
