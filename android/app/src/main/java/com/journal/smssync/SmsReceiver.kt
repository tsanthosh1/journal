package com.journal.smssync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "SmsReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val isSyncEnabled = SyncConfig.isSyncEnabled(context)
        val userId = SyncConfig.getUserId(context)
        val senders = SyncConfig.getBankSenders(context)
        val keywords = SyncConfig.getFilterKeywords(context)
        val baseUrl = SyncConfig.getBaseUrl(context)

        if (!isSyncEnabled) {
            Log.d(TAG, "SMS sync is currently paused by user.")
            return
        }

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) return

        for (sms in messages) {
            val sender = sms.displayOriginatingAddress ?: sms.originatingAddress ?: "UNKNOWN"
            val body = sms.displayMessageBody ?: sms.messageBody ?: ""
            val timestamp = sms.timestampMillis

            Log.d(TAG, "Incoming SMS from $sender: $body")

            if (SmsScanner.isRelevantBankSms(sender, body, senders, keywords)) {
                Log.d(TAG, "Relevant loan/bank debit SMS detected! Forwarding to API...")

                val payload = SmsPayload(
                    sender = sender,
                    body = body,
                    timestamp = timestamp,
                    userId = userId
                )

                // Save full message to persistent SmsStorage
                SmsStorage.addSingleSms(context, payload)

                // Also maintain legacy prefs log
                val prefs = SyncConfig.getPrefs(context)
                val currentLogs = prefs.getString(SyncConfig.KEY_LAST_SMS_LOG, "") ?: ""
                val newLog = "[$sender] $body"
                prefs.edit().putString(SyncConfig.KEY_LAST_SMS_LOG, "$newLog\n$currentLogs".take(5000)).apply()

                val logSession = SyncLogSession(context, "Real-time SMS Sync")
                logSession.log("Incoming SMS detected from: $sender")
                logSession.log("Body: $body")
                logSession.log("Matched configured bank or loan signatures. Saved to local storage.")

                // Dispatch to API in background IO thread
                val pendingResult = goAsync()
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        logSession.log("Dispatching payload to $baseUrl/api/sync/sms")
                        val result = ApiService.syncSingleSms(payload, baseUrl)
                        if (result.isSuccess) {
                            val summary = result.getOrNull()?.syncSummary ?: "Ingested 1 SMS"
                            logSession.finishSuccess("Synced SMS from $sender. Server: $summary")
                            Log.d(TAG, "Successfully synced incoming SMS to backend!")
                        } else {
                            val err = result.exceptionOrNull()?.message ?: "Unknown error"
                            logSession.finishError("HTTP error: $err")
                            Log.e(TAG, "Failed to sync incoming SMS: $err")
                        }
                    } catch (e: Exception) {
                        logSession.finishError("Exception: ${e.message}")
                    } finally {
                        pendingResult.finish()
                    }
                }
            }
        }
    }
}
