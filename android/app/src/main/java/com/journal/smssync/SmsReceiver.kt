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
        const val PREFS_NAME = "finance_sms_prefs"
        const val KEY_USER_ID = "sync_user_id"
        const val KEY_SYNC_ENABLED = "sync_enabled"
        const val KEY_LAST_SMS_LOG = "last_sms_log"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val isSyncEnabled = prefs.getBoolean(KEY_SYNC_ENABLED, true)
        val userId = prefs.getString(KEY_USER_ID, "tsanthosh.online@gmail.com") ?: "tsanthosh.online@gmail.com"

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

            if (SmsScanner.isRelevantBankSms(sender, body)) {
                Log.d(TAG, "Relevant loan/bank debit SMS detected! Forwarding to API...")

                // Save to local recent log
                val currentLogs = prefs.getString(KEY_LAST_SMS_LOG, "") ?: ""
                val newLog = "[$sender] ${body.take(60)}..."
                prefs.edit().putString(KEY_LAST_SMS_LOG, "$newLog\n$currentLogs".take(2000)).apply()

                val payload = SmsPayload(
                    sender = sender,
                    body = body,
                    timestamp = timestamp,
                    userId = userId
                )

                // Dispatch to API in background IO thread
                val pendingResult = goAsync()
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        val result = ApiService.syncSingleSms(payload)
                        if (result.isSuccess) {
                            Log.d(TAG, "Successfully synced incoming SMS to backend!")
                        } else {
                            Log.e(TAG, "Failed to sync incoming SMS: ${result.exceptionOrNull()?.message}")
                        }
                    } finally {
                        pendingResult.finish()
                    }
                }
            }
        }
    }
}
