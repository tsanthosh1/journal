package com.journal.smssync

import android.util.Log
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

data class SmsPayload(
    val sender: String,
    val body: String,
    val timestamp: Long,
    val userId: String
)

data class BatchSmsRequest(
    val userId: String,
    val messages: List<SmsPayload>
)

data class ApiResponse(
    val success: Boolean,
    val ingestedCount: Int?,
    val syncSummary: String?,
    val message: String?,
    val error: String?
)

data class SmsProcessResponse(
    val success: Boolean,
    val totalSmsFound: Int?,
    val matchedSmsCount: Int?,
    val updatedSubscriptions: Int?,
    val summaryText: String?,
    val error: String?
)

data class ServerSmsListResponse(
    val success: Boolean,
    val totalCount: Int?,
    val messages: List<ServerSmsItem>?
)

data class ServerSmsItem(
    val id: String?,
    val sender: String?,
    val body: String?,
    val timestamp: Long?,
    val userId: String?,
    val date: String?
)

object ApiService {
    private const val TAG = "ApiService"
    private const val CHUNK_SIZE = 100

    private val client = OkHttpClient.Builder()
        .connectTimeout(45, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val JSON = "application/json; charset=utf-8".toMediaType()

    suspend fun syncSingleSms(sms: SmsPayload, customBaseUrl: String? = null): Result<ApiResponse> =
        withContext(Dispatchers.IO) {
            syncBatchSms(listOf(sms), sms.userId, customBaseUrl)
        }

    /**
     * Uploads messages to the server, automatically chunking large lists into
     * chunks of 100 to prevent payload drops or timeouts.
     */
    suspend fun syncBatchSms(
        messages: List<SmsPayload>,
        userId: String,
        customBaseUrl: String? = null,
        onProgress: ((uploaded: Int, total: Int) -> Unit)? = null
    ): Result<ApiResponse> = withContext(Dispatchers.IO) {
        try {
            if (messages.isEmpty()) {
                return@withContext Result.success(
                    ApiResponse(true, 0, null, "No messages to sync", null)
                )
            }

            val baseUrl = (customBaseUrl ?: SyncConfig.DEFAULT_BASE_URL).removeSuffix("/")
            val url = "$baseUrl/api/sync/sms"
            var totalIngested = 0
            var lastSummary: String? = null

            val chunks = messages.chunked(CHUNK_SIZE)
            for ((index, chunk) in chunks.withIndex()) {
                val payload = BatchSmsRequest(userId = userId, messages = chunk)
                val jsonBody = gson.toJson(payload)

                Log.d(TAG, "Posting chunk ${index + 1}/${chunks.size} (${chunk.size} SMS) to $url")

                val request = Request.Builder()
                    .url(url)
                    .post(jsonBody.toRequestBody(JSON))
                    .build()

                val apiResponse = client.newCall(request).execute().use { response ->
                    val responseStr = response.body?.string() ?: ""
                    if (!response.isSuccessful) {
                        Log.e(TAG, "API Error (${response.code}): $responseStr")
                        throw Exception("HTTP ${response.code}: $responseStr")
                    }
                    gson.fromJson(responseStr, ApiResponse::class.java)
                }

                totalIngested += apiResponse.ingestedCount ?: chunk.size
                if (!apiResponse.syncSummary.isNullOrBlank()) {
                    lastSummary = apiResponse.syncSummary
                }

                onProgress?.invoke(minOf(totalIngested, messages.size), messages.size)
            }

            Result.success(
                ApiResponse(
                    success = true,
                    ingestedCount = totalIngested,
                    syncSummary = lastSummary,
                    message = "Successfully ingested $totalIngested SMS messages.",
                    error = null
                )
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to post SMS to API", e)
            Result.failure(e)
        }
    }

    /**
     * Explicitly triggers the server SMS processing/reconciliation engine (/api/sync/sms/process).
     * This forces the server to read all stored SMS from Firestore, parse loan commitments,
     * update subscription payment cycles, and return reconciliation stats.
     */
    suspend fun triggerServerSmsProcessing(
        userId: String,
        customBaseUrl: String? = null
    ): Result<SmsProcessResponse> = withContext(Dispatchers.IO) {
        try {
            val baseUrl = (customBaseUrl ?: SyncConfig.DEFAULT_BASE_URL).removeSuffix("/")
            val url = "$baseUrl/api/sync/sms/process"
            val body = gson.toJson(mapOf("userId" to userId))

            Log.d(TAG, "Triggering server SMS processing at $url for user $userId")

            val request = Request.Builder()
                .url(url)
                .post(body.toRequestBody(JSON))
                .build()

            client.newCall(request).execute().use { response ->
                val responseStr = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    Log.e(TAG, "Server sync process error (${response.code}): $responseStr")
                    return@withContext Result.failure(Exception("HTTP ${response.code}: $responseStr"))
                }

                val result = gson.fromJson(responseStr, SmsProcessResponse::class.java)
                Log.d(TAG, "Server sync complete: ${result.summaryText}")
                Result.success(result)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error triggering server SMS processing", e)
            Result.failure(e)
        }
    }

    /**
     * Fetches stored SMS records from the server, ordered newest first.
     */
    suspend fun fetchServerSms(
        userId: String,
        limit: Int = 200,
        customBaseUrl: String? = null
    ): Result<List<SmsPayload>> = withContext(Dispatchers.IO) {
        try {
            val baseUrl = (customBaseUrl ?: SyncConfig.DEFAULT_BASE_URL).removeSuffix("/")
            val url = "$baseUrl/api/sync/sms?userId=$userId&limit=$limit"

            val request = Request.Builder()
                .url(url)
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                val responseStr = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    return@withContext Result.failure(Exception("HTTP ${response.code}: $responseStr"))
                }

                val listRes = gson.fromJson(responseStr, ServerSmsListResponse::class.java)
                val items = listRes.messages?.mapNotNull { item ->
                    if (item.sender != null && item.body != null) {
                        SmsPayload(
                            sender = item.sender,
                            body = item.body,
                            timestamp = item.timestamp ?: 0L,
                            userId = item.userId ?: userId
                        )
                    } else null
                } ?: emptyList()

                Result.success(items)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching SMS from server", e)
            Result.failure(e)
        }
    }
}
