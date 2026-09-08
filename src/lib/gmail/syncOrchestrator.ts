import { getFirebaseAdmin } from "../firebaseAdmin";
import {
  Subscription,
  SyncAuditLog,
} from "../subscriptionTypes";
import { getValidGmailToken } from "./oauth";
import { createSyncLogger, SyncLogCallback } from "./syncLogger";
import { syncSubscriptionWithGmail, SyncSubscriptionResult } from "./currentCycleSync";

/**
 * Runs a full synchronization for all automated subscriptions of a user
 */
export async function syncAllSubscriptions(
  userId = "default_user",
  onLog?: SyncLogCallback,
): Promise<{
  success: boolean;
  totalSubscriptions: number;
  syncedCount: number;
  totalNewMessages: number;
  results: SyncSubscriptionResult[];
  errors: string[];
}> {
  const log = createSyncLogger(onLog);
  log("info", `Initiating global Gmail sync for user: ${userId}`);

  const startTime = Date.now();
  const tokenRecord = await getValidGmailToken(userId);

  if (!tokenRecord) {
    const errText = "Gmail integration is not connected or token has expired. Please connect your Gmail account via OAuth.";
    log("error", errText);
    throw new Error(errText);
  }

  log("info", `OAuth token verified for ${tokenRecord.email || userId}`);

  const { db } = getFirebaseAdmin();

  // Support flexible user ID candidates (e.g. email, normalized email, token email, default_user)
  const candidateUserIds = Array.from(
    new Set([
      userId,
      userId.replace(/[^a-zA-Z0-9_-]/g, "_"),
      tokenRecord.email,
      "default_user",
    ]),
  ).filter(Boolean) as string[];

  const subsSnap = await db
    .collection("subscriptions")
    .where("userId", "in", candidateUserIds.slice(0, 10))
    .get();

  // No insecure fallback — return empty if no subscriptions found
  if (subsSnap.empty) {
    log("warn", `No subscriptions found for user candidates: ${candidateUserIds.join(", ")}`);
    return {
      success: true,
      totalSubscriptions: 0,
      syncedCount: 0,
      totalNewMessages: 0,
      results: [],
      errors: [],
    };
  }

  const subscriptions: Subscription[] = [];
  subsSnap.forEach((doc) => {
    const data = doc.data() as Subscription;
    const hasEmailConfig =
      data.emailConfig?.enabled ||
      Boolean(data.emailConfig?.statementQuery?.trim()) ||
      Boolean(data.emailConfig?.paymentQuery?.trim()) ||
      data.source === "EMAIL_AUTOMATED";

    if (hasEmailConfig) {
      subscriptions.push({ ...data, id: doc.id });
    }
  });

  log("info", `Found ${subscriptions.length} active email-configured subscription(s) to synchronize`);

  const results: SyncSubscriptionResult[] = [];
  const errors: string[] = [];
  let totalNewMessages = 0;

  let currentAccessToken = tokenRecord.accessToken;

  for (let idx = 0; idx < subscriptions.length; idx++) {
    const sub = subscriptions[idx];
    log("info", `[${idx + 1}/${subscriptions.length}] Processing ${sub.name}...`, { subscriptionId: sub.id, subscriptionName: sub.name });

    if (sub.currentCycle.status === "PAUSED" || sub.currentCycle.status === "ARCHIVED") {
      log("info", `Skipping ${sub.name} (Status is ${sub.currentCycle.status})`, { subscriptionId: sub.id, subscriptionName: sub.name });
      continue;
    }

    try {
      const res = await syncSubscriptionWithGmail(sub, currentAccessToken, onLog);
      results.push(res);
      totalNewMessages += res.newMessagesProcessed;
      if (res.warnings) {
        errors.push(...res.warnings.map((w) => `[${sub.name}] ${w}`));
      }
    } catch (err: any) {
      if (err.message && err.message.includes("401")) {
        log("warn", `Access token expired during ${sub.name}. Refreshing token...`, { subscriptionId: sub.id, subscriptionName: sub.name });
        const refreshed = await getValidGmailToken(userId, true);
        if (refreshed) {
          currentAccessToken = refreshed.accessToken;
          log("info", `Successfully refreshed access token. Retrying sync for ${sub.name}...`, { subscriptionId: sub.id, subscriptionName: sub.name });
          try {
            const retryRes = await syncSubscriptionWithGmail(sub, currentAccessToken, onLog);
            results.push(retryRes);
            totalNewMessages += retryRes.newMessagesProcessed;
            if (retryRes.warnings) {
              errors.push(...retryRes.warnings.map((w) => `[${sub.name}] ${w}`));
            }
            continue;
          } catch {
            // fall through to error
          }
        }
      }

      const msg = `[${sub.name}] Sync failed: ${err.message || "Unknown error"}`;
      errors.push(msg);
      log("error", msg, { subscriptionId: sub.id, subscriptionName: sub.name });
      results.push({
        subscriptionId: sub.id,
        subscriptionName: sub.name,
        success: false,
        status: sub.currentCycle.status,
        newMessagesProcessed: 0,
        error: msg,
      });
    }
  }

  // Update lastSyncAt on gmail_tokens
  try {
    await db.collection("gmail_tokens").doc(userId).update({
      lastSyncAt: new Date().toISOString(),
    });
  } catch {
    // optional update
  }

  const auditLog: SyncAuditLog = {
    id: `sync_${Date.now()}`,
    userId,
    timestamp: new Date().toISOString(),
    subscriptionsProcessed: subscriptions.length,
    statementsFound: results.filter((r) => r.statementTotal !== undefined).length,
    paymentsFound: results.filter((r) => r.paidAmount && r.paidAmount > 0).length,
    errorsCount: errors.length,
    durationMs: Date.now() - startTime,
    details: results.map((r) => ({
      subscriptionId: r.subscriptionId,
      subscriptionName: r.subscriptionName,
      status: r.status,
      message: r.error || (r.warnings ? r.warnings.join("; ") : undefined),
      messagesProcessed: r.newMessagesProcessed,
    })),
  };

  await db.collection("sync_audit_logs").doc(auditLog.id).set(auditLog);

  log("success", `Global sync complete! Processed ${subscriptions.length} subscriptions in ${((Date.now() - startTime) / 1000).toFixed(1)}s (${totalNewMessages} new emails parsed)`, {
    details: {
      totalSubscriptions: subscriptions.length,
      syncedCount: results.filter((r) => r.success).length,
      totalNewMessages,
      durationMs: Date.now() - startTime,
    },
  });

  return {
    success: true,
    totalSubscriptions: subscriptions.length,
    syncedCount: results.filter((r) => r.success).length,
    totalNewMessages,
    results,
    errors,
  };
}
