package com.journal.smssync

import android.util.Log
import com.google.gson.Gson
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

object ApiService {
    private const val TAG = "ApiService"
    
    // Default production endpoint
    var baseUrl: String = "https://journal--track-everything-ai.us-east4.hosted.app"

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val JSON = "application/json; charset=utf-8".toMediaType()

    suspend fun syncSingleSms(sms: SmsPayload): Result<ApiResponse> = withContext(Dispatchers.IO) {
        syncBatchSms(listOf(sms), sms.userId)
    }

    suspend fun syncBatchSms(messages: List<SmsPayload>, userId: String): Result<ApiResponse> =
        withContext(Dispatchers.IO) {
            try {
                if (messages.isEmpty()) {
                    return@withContext Result.success(
                        ApiResponse(true, 0, null, "No messages to sync", null)
                    )
                }

                val payload = BatchSmsRequest(userId = userId, messages = messages)
                val jsonBody = gson.toJson(payload)

                val url = "$baseUrl/api/sync/sms"
                Log.d(TAG, "Posting ${messages.size} SMS to $url")

                val request = Request.Builder()
                    .url(url)
                    .post(jsonBody.toRequestBody(JSON))
                    .build()

                client.newCall(request).execute().use { response ->
                    val responseStr = response.body?.string() ?: ""
                    if (!response.isSuccessful) {
                        Log.e(TAG, "API Error (${response.code}): $responseStr")
                        return@withContext Result.failure(
                            Exception("HTTP ${response.code}: $responseStr")
                        )
                    }

                    val apiResponse = gson.fromJson(responseStr, ApiResponse::class.java)
                    Log.d(TAG, "API Success: ${apiResponse.message}")
                    Result.success(apiResponse)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to post SMS to API", e)
                Result.failure(e)
            }
        }
}
