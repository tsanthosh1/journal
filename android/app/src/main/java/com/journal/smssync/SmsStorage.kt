package com.journal.smssync

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File

object SmsStorage {
    private const val TAG = "SmsStorage"
    private const val FILE_NAME = "synced_sms_cache.json"
    private val gson = Gson()
    private val lock = Any()

    @Volatile
    private var memoryCache: List<SmsPayload>? = null

    /**
     * Loads all saved SMS messages from local disk cache, ordered newest first.
     */
    fun loadSavedSms(context: Context): List<SmsPayload> {
        synchronized(lock) {
            memoryCache?.let { return it }

            return try {
                val file = File(context.filesDir, FILE_NAME)
                if (!file.exists()) {
                    memoryCache = emptyList()
                    return emptyList()
                }

                val json = file.readText(Charsets.UTF_8)
                val type = object : TypeToken<List<SmsPayload>>() {}.type
                val list: List<SmsPayload> = gson.fromJson(json, type) ?: emptyList()
                val sorted = list.sortedByDescending { it.timestamp }
                memoryCache = sorted
                sorted
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load cached SMS", e)
                emptyList()
            }
        }
    }

    /**
     * Persists all given SMS messages to disk, sorted descending by timestamp.
     */
    fun saveAllSms(context: Context, messages: List<SmsPayload>) {
        synchronized(lock) {
            try {
                val sorted = messages.sortedByDescending { it.timestamp }
                memoryCache = sorted
                val file = File(context.filesDir, FILE_NAME)
                file.writeText(gson.toJson(sorted), Charsets.UTF_8)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to save SMS list to disk", e)
            }
        }
    }

    /**
     * Merges a batch of new messages with existing saved messages, deduplicating
     * by fingerprint (sender + timestamp + body), sorted newest first.
     */
    fun mergeAndSave(context: Context, newMessages: List<SmsPayload>): List<SmsPayload> {
        synchronized(lock) {
            val current = loadSavedSms(context)
            val seenKeys = HashSet<String>()
            val combined = ArrayList<SmsPayload>(current.size + newMessages.size)

            for (msg in newMessages) {
                val key = createKey(msg)
                if (seenKeys.add(key)) {
                    combined.add(msg)
                }
            }

            for (msg in current) {
                val key = createKey(msg)
                if (seenKeys.add(key)) {
                    combined.add(msg)
                }
            }

            val sorted = combined.sortedByDescending { it.timestamp }
            saveAllSms(context, sorted)
            return sorted
        }
    }

    /**
     * Appends a single real-time SMS to the cache.
     */
    fun addSingleSms(context: Context, msg: SmsPayload): List<SmsPayload> {
        return mergeAndSave(context, listOf(msg))
    }

    private fun createKey(msg: SmsPayload): String {
        return "${msg.sender.trim()}_${msg.timestamp}_${msg.body.trim()}"
    }
}
