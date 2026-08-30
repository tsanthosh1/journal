package com.journal.smssync

import android.content.Context
import android.content.SharedPreferences

object SyncConfig {
    const val PREFS_NAME = "finance_sms_prefs"

    const val KEY_USER_ID = "sync_user_id"
    const val KEY_BASE_URL = "sync_base_url"
    const val KEY_SYNC_ENABLED = "sync_enabled"
    const val KEY_BANK_SENDERS = "sync_bank_senders"
    const val KEY_FILTER_KEYWORDS = "sync_filter_keywords"
    const val KEY_SCAN_MONTHS = "sync_scan_months"
    const val KEY_LAST_SMS_LOG = "last_sms_log"

    // Default Fallbacks
    const val DEFAULT_USER_ID = "tsanthosh.online@gmail.com"
    const val DEFAULT_BASE_URL = "https://journal--track-everything-ai.us-east4.hosted.app"
    const val DEFAULT_BANK_SENDERS = "BOI, HDFC, SBI, ICICI, CANARA, CANBNK, AXIS, KOTAK, BAJAJ, TATACAP, LICHFL, BOB, PNB, UNION"
    const val DEFAULT_KEYWORDS = "loan, emi, recovery, loan rec, ach d, ach, nach, ecs, auto-debit, auto debit, debited(trf), debited, deducted, transferred to loan"
    const val DEFAULT_SCAN_MONTHS = 12

    fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getUserId(context: Context): String {
        return getPrefs(context).getString(KEY_USER_ID, DEFAULT_USER_ID) ?: DEFAULT_USER_ID
    }

    fun setUserId(context: Context, userId: String) {
        getPrefs(context).edit().putString(KEY_USER_ID, userId.trim()).apply()
    }

    fun getBaseUrl(context: Context): String {
        return getPrefs(context).getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL
    }

    fun setBaseUrl(context: Context, url: String) {
        getPrefs(context).edit().putString(KEY_BASE_URL, url.trim().removeSuffix("/")).apply()
    }

    fun isSyncEnabled(context: Context): Boolean {
        return getPrefs(context).getBoolean(KEY_SYNC_ENABLED, true)
    }

    fun setSyncEnabled(context: Context, enabled: Boolean) {
        getPrefs(context).edit().putBoolean(KEY_SYNC_ENABLED, enabled).apply()
    }

    fun getBankSenders(context: Context): List<String> {
        val raw = getPrefs(context).getString(KEY_BANK_SENDERS, DEFAULT_BANK_SENDERS) ?: DEFAULT_BANK_SENDERS
        return raw.split(",").map { it.trim() }.filter { it.isNotBlank() }
    }

    fun setBankSenders(context: Context, senders: String) {
        getPrefs(context).edit().putString(KEY_BANK_SENDERS, senders.trim()).apply()
    }

    fun getFilterKeywords(context: Context): List<String> {
        val raw = getPrefs(context).getString(KEY_FILTER_KEYWORDS, DEFAULT_KEYWORDS) ?: DEFAULT_KEYWORDS
        return raw.split(",").map { it.trim() }.filter { it.isNotBlank() }
    }

    fun setFilterKeywords(context: Context, keywords: String) {
        getPrefs(context).edit().putString(KEY_FILTER_KEYWORDS, keywords.trim()).apply()
    }

    fun getScanMonths(context: Context): Int {
        return getPrefs(context).getInt(KEY_SCAN_MONTHS, DEFAULT_SCAN_MONTHS)
    }

    fun setScanMonths(context: Context, months: Int) {
        getPrefs(context).edit().putInt(KEY_SCAN_MONTHS, months).apply()
    }

    fun resetToDefaults(context: Context) {
        getPrefs(context).edit()
            .putString(KEY_BANK_SENDERS, DEFAULT_BANK_SENDERS)
            .putString(KEY_FILTER_KEYWORDS, DEFAULT_KEYWORDS)
            .putInt(KEY_SCAN_MONTHS, DEFAULT_SCAN_MONTHS)
            .putString(KEY_BASE_URL, DEFAULT_BASE_URL)
            .apply()
    }
}
