/**
 * Re-export module for Gmail sync operations.
 * Functionality has been modularized into:
 * - currentCycleSync.ts: Current cycle synchronization
 * - historicalSync.ts: Multi-month deep historical scan
 * - syncOrchestrator.ts: Global multi-subscription synchronization
 */

export {
  syncSubscriptionWithGmail,
  type SyncSubscriptionResult,
} from "./currentCycleSync";

export {
  syncHistoricalSubscriptionWithGmail,
} from "./historicalSync";

export {
  syncAllSubscriptions,
} from "./syncOrchestrator";
