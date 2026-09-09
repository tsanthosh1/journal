/**
 * Next.js Instrumentation hook
 * Runs once when the Next.js server instance starts up.
 * Used here to boot the background sync worker in Node.js runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackgroundSyncWorker } = await import("./lib/sync/backgroundSyncWorker");
    startBackgroundSyncWorker();
  }
}
