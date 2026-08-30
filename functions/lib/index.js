"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerGmailSyncHttps = exports.scheduledGmailSubscriptionSync = void 0;
const admin = require("firebase-admin");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
if (!admin.apps.length) {
    admin.initializeApp();
}
/**
 * Scheduled Cloud Function running every 6 hours to poll Gmail for statements and payment receipts
 */
exports.scheduledGmailSubscriptionSync = (0, scheduler_1.onSchedule)({
    region: "asia-south1",
    schedule: "every 6 hours",
    timeZone: "Asia/Kolkata",
    memory: "512MiB",
    timeoutSeconds: 300,
}, async () => {
    console.log("Starting scheduled Gmail subscription sync job...");
    const db = admin.firestore();
    // Query all users with active tokens
    const tokensSnap = await db.collection("gmail_tokens").get();
    for (const tokenDoc of tokensSnap.docs) {
        const userId = tokenDoc.id;
        console.log(`Processing sync for user: ${userId}`);
        try {
            const subsSnap = await db
                .collection("subscriptions")
                .where("userId", "==", userId)
                .where("source", "==", "EMAIL_AUTOMATED")
                .get();
            console.log(`Found ${subsSnap.docs.length} automated subscriptions for user ${userId}`);
        }
        catch (err) {
            console.error(`Error during sync for user ${userId}:`, err);
        }
    }
});
/**
 * HTTPS trigger to manually kick off background worker
 */
exports.triggerGmailSyncHttps = (0, https_1.onRequest)({
    region: "asia-south1",
    cors: true,
}, async (req, res) => {
    const userId = req.query.userId || "default_user";
    console.log(`Manual trigger requested for userId: ${userId}`);
    res.json({ success: true, message: `Sync initiated for ${userId}` });
});
//# sourceMappingURL=index.js.map