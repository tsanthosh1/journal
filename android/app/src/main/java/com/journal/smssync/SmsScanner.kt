package com.journal.smssync

import android.content.Context
import android.net.Uri
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Calendar

object SmsScanner {
    private const val TAG = "SmsScanner"

    // Default Bank Sender Keywords
    val BANK_SENDER_PATTERNS = listOf(
        "HDFC", "SBI", "ICICI", "AXIS", "KOTAK", "CANBNK", "CANARA",
        "BARODA", "BOB", "PNB", "BAJAJ", "TATACAP", "LICHFL"
    )

    // Keywords indicating loan/EMI/debit transactions
    val TRANSACTION_KEYWORDS = listOf(
        "loan", "emi", "recovery", "debited", "nach", "ecs",
        "auto-debit", "auto debit", "deducted"
    )

    suspend fun scanHistoricalSms(
        context: Context,
        userId: String,
        monthsBack: Int = 12,
        onProgress: ((current: Int, totalFound: Int) -> Unit)? = null
    ): List<SmsPayload> = withContext(Dispatchers.IO) {
        val results = mutableListOf<SmsPayload>()

        try {
            val calendar = Calendar.getInstance()
            calendar.add(Calendar.MONTH, -monthsBack)
            val minTimestamp = calendar.timeInMillis

            val uri = Uri.parse("content://sms/inbox")
            val projection = arrayOf("_id", "address", "body", "date")
            val selection = "date >= ?"
            val selectionArgs = arrayOf(minTimestamp.toString())
            val sortOrder = "date DESC"

            val cursor = context.contentResolver.query(
                uri,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )

            cursor?.use {
                val addressIdx = it.getColumnIndexOrThrow("address")
                val bodyIdx = it.getColumnIndexOrThrow("body")
                val dateIdx = it.getColumnIndexOrThrow("date")

                var scannedCount = 0

                while (it.moveToNext()) {
                    scannedCount++
                    val address = it.getString(addressIdx) ?: ""
                    val body = it.getString(bodyIdx) ?: ""
                    val date = it.getLong(dateIdx)

                    if (isRelevantBankSms(address, body)) {
                        results.add(
                            SmsPayload(
                                sender = address,
                                body = body,
                                timestamp = date,
                                userId = userId
                            )
                        )
                    }

                    if (scannedCount % 50 == 0) {
                        onProgress?.invoke(scannedCount, results.size)
                    }
                }
            }

            Log.d(TAG, "Scanned complete: Found ${results.size} matching loan/bank SMS messages")
        } catch (e: Exception) {
            Log.e(TAG, "Error scanning historical SMS", e)
        }

        return@withContext results
    }

    fun isRelevantBankSms(sender: String, body: String): Boolean {
        val upperSender = sender.uppercase()
        val lowerBody = body.lowercase()

        val matchesBankSender = BANK_SENDER_PATTERNS.any { upperSender.contains(it) }
        val matchesKeyword = TRANSACTION_KEYWORDS.any { lowerBody.contains(it) }

        // Must match either a bank sender AND a keyword, or strongly contain explicit loan keywords
        if (matchesBankSender && matchesKeyword) {
            return true
        }

        if (lowerBody.contains("home loan") || lowerBody.contains("loan a/c") || lowerBody.contains("ln recovery")) {
            return true
        }

        return false
    }
}
