package com.journal.smssync

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

data class SyncLogRecord(
    val id: String,
    val actionName: String,
    val timestamp: Long,
    val formattedTime: String,
    val status: String, // "SUCCESS", "FAILED", "RUNNING"
    val summary: String,
    val logs: List<String>
)

class SyncLogSession(
    val context: Context,
    val actionName: String
) {
    val id: String = UUID.randomUUID().toString()
    val timestamp: Long = System.currentTimeMillis()
    val logs = mutableListOf<String>()
    private val timeFormat = SimpleDateFormat("HH:mm:ss.SSS", Locale.getDefault())

    init {
        log("Session started for action: $actionName")
    }

    fun log(message: String) {
        val time = timeFormat.format(Date())
        val entry = "[$time] $message"
        logs.add(entry)
        Log.d("SyncLogSession", "[$actionName] $message")
    }

    fun finishSuccess(summary: String): SyncLogRecord {
        log("Completed successfully: $summary")
        val record = buildRecord("SUCCESS", summary)
        SyncLogStorage.saveLog(context, record)
        return record
    }

    fun finishError(error: String): SyncLogRecord {
        log("Failed with error: $error")
        val record = buildRecord("FAILED", error)
        SyncLogStorage.saveLog(context, record)
        return record
    }

    private fun buildRecord(status: String, summary: String): SyncLogRecord {
        val sdf = SimpleDateFormat("dd MMM yyyy, hh:mm:ss a", Locale.getDefault())
        return SyncLogRecord(
            id = id,
            actionName = actionName,
            timestamp = timestamp,
            formattedTime = sdf.format(Date(timestamp)),
            status = status,
            summary = summary,
            logs = ArrayList(logs)
        )
    }
}

object SyncLogStorage {
    private const val TAG = "SyncLogStorage"
    private const val DIR_NAME = "sync_logs"
    private val gson = Gson()
    private val lock = Any()

    private fun getLogsDir(context: Context): File {
        val dir = File(context.filesDir, DIR_NAME)
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir
    }

    /**
     * Persists a completed SyncLogRecord into file storage.
     */
    fun saveLog(context: Context, record: SyncLogRecord) {
        synchronized(lock) {
            try {
                val dir = getLogsDir(context)
                val file = File(dir, "log_${record.timestamp}_${record.id.take(8)}.json")
                file.writeText(gson.toJson(record), Charsets.UTF_8)
                Log.d(TAG, "Saved sync log to ${file.absolutePath}")

                // Cleanup: keep at most 50 newest log files to prevent storage bloat
                val allFiles = dir.listFiles { _, name -> name.endsWith(".json") } ?: emptyArray()
                if (allFiles.size > 50) {
                    allFiles.sortedBy { it.lastModified() }
                        .take(allFiles.size - 50)
                        .forEach { it.delete() }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to save sync log file", e)
            }
        }
    }

    /**
     * Reads all sync log records from file storage, ordered newest first.
     */
    fun getAllLogs(context: Context): List<SyncLogRecord> {
        synchronized(lock) {
            return try {
                val dir = getLogsDir(context)
                val files = dir.listFiles { _, name -> name.endsWith(".json") } ?: emptyArray()
                val list = mutableListOf<SyncLogRecord>()

                for (file in files.sortedByDescending { it.lastModified() }) {
                    try {
                        val json = file.readText(Charsets.UTF_8)
                        val record = gson.fromJson(json, SyncLogRecord::class.java)
                        if (record != null) {
                            list.add(record)
                        }
                    } catch (err: Exception) {
                        Log.w(TAG, "Could not parse log file ${file.name}: ${err.message}")
                    }
                }

                list.sortedByDescending { it.timestamp }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to read sync logs from disk", e)
                emptyList()
            }
        }
    }

    /**
     * Clears all log files from disk.
     */
    fun clearAllLogs(context: Context) {
        synchronized(lock) {
            try {
                val dir = getLogsDir(context)
                dir.listFiles()?.forEach { it.delete() }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to clear sync logs", e)
            }
        }
    }
}
