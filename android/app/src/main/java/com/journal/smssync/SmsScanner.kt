package com.journal.smssync

import android.content.Context
import android.net.Uri
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Calendar

object SmsScanner {
    private const val TAG = "SmsScanner"

    suspend fun scanHistoricalSms(
        context: Context,
        userId: String? = null,
        monthsBack: Int? = null,
        customSenders: List<String>? = null,
        customKeywords: List<String>? = null,
        onProgress: ((current: Int, totalFound: Int) -> Unit)? = null
    ): List<SmsPayload> = withContext(Dispatchers.IO) {
        val results = mutableListOf<SmsPayload>()

        val effectiveUserId = userId ?: SyncConfig.getUserId(context)
        val effectiveMonths = monthsBack ?: SyncConfig.getScanMonths(context)
        val senders = customSenders ?: SyncConfig.getBankSenders(context)
        val keywords = customKeywords ?: SyncConfig.getFilterKeywords(context)

        try {
            val calendar = Calendar.getInstance()
            calendar.add(Calendar.MONTH, -effectiveMonths)
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

                    if (isRelevantBankSms(address, body, senders, keywords)) {
                        results.add(
                            SmsPayload(
                                sender = address,
                                body = body,
                                timestamp = date,
                                userId = effectiveUserId
                            )
                        )
                    }

                    if (scannedCount % 50 == 0) {
                        onProgress?.invoke(scannedCount, results.size)
                    }
                }
            }

            Log.d(TAG, "Scanned complete: Found ${results.size} matching SMS messages")
        } catch (e: Exception) {
            Log.e(TAG, "Error scanning historical SMS", e)
        }

        return@withContext results
    }

    fun isRelevantBankSms(
        sender: String,
        body: String,
        customSenders: List<String>? = null,
        customKeywords: List<String>? = null
    ): Boolean {
        val upperSender = sender.uppercase()
        val lowerBody = body.lowercase()

        val bankSenders = customSenders?.takeIf { it.isNotEmpty() }
            ?: SyncConfig.DEFAULT_BANK_SENDERS.split(",").map { it.trim().uppercase() }

        val filterKeywords = customKeywords?.takeIf { it.isNotEmpty() }
            ?: SyncConfig.DEFAULT_KEYWORDS.split(",").map { it.trim().lowercase() }

        // Check if sender matches any configured bank patterns
        val matchesBankSender = bankSenders.any {
            it.isNotBlank() && upperSender.contains(it.uppercase().trim())
        }

        // Check if body matches any configured keywords
        val matchesKeyword = filterKeywords.any {
            it.isNotBlank() && lowerBody.contains(it.lowercase().trim())
        }

        if (matchesBankSender && matchesKeyword) {
            return true
        }

        // Strongly formatted loan signatures
        if (lowerBody.contains("home loan") || lowerBody.contains("loan a/c") || lowerBody.contains("ln recovery")) {
            return true
        }

        return false
    }
}
