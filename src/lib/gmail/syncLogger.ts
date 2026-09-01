export type SyncLogLevel =
  | "info"
  | "query"
  | "fetch"
  | "parse"
  | "match"
  | "save"
  | "warn"
  | "error"
  | "success";

export interface SyncLogEvent {
  id: string;
  timestamp: string;
  level: SyncLogLevel;
  subscriptionId?: string;
  subscriptionName?: string;
  message: string;
  details?: Record<string, any>;
}

export type SyncLogCallback = (event: SyncLogEvent) => void;

export function createSyncLogger(onLog?: SyncLogCallback) {
  let counter = 0;
  return (
    level: SyncLogLevel,
    message: string,
    context?: {
      subscriptionId?: string;
      subscriptionName?: string;
      details?: Record<string, any>;
    },
  ) => {
    counter++;
    const event: SyncLogEvent = {
      id: `log_${Date.now()}_${counter}`,
      timestamp: new Date().toISOString(),
      level,
      subscriptionId: context?.subscriptionId,
      subscriptionName: context?.subscriptionName,
      message,
      details: context?.details,
    };

    if (onLog) {
      try {
        onLog(event);
      } catch (err) {
        console.error("Error in sync log callback:", err);
      }
    }
  };
}
