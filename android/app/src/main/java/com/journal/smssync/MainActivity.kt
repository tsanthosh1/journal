package com.journal.smssync

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            FinanceHubSmsApp()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FinanceHubSmsApp() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // Config state
    var userEmail by remember { mutableStateOf(SyncConfig.getUserId(context)) }
    var baseUrl by remember { mutableStateOf(SyncConfig.getBaseUrl(context)) }
    var bankSendersText by remember { mutableStateOf(SyncConfig.getBankSenders(context).joinToString(", ")) }
    var keywordsText by remember { mutableStateOf(SyncConfig.getFilterKeywords(context).joinToString(", ")) }
    var scanMonths by remember { mutableIntStateOf(SyncConfig.getScanMonths(context)) }
    var isRealtimeSyncEnabled by remember { mutableStateOf(SyncConfig.isSyncEnabled(context)) }

    var isBackfilling by remember { mutableStateOf(false) }
    var backfillProgress by remember { mutableStateOf("Ready to scan") }
    var showSettingsDialog by remember { mutableStateOf(false) }

    // Sync Logs State
    var showLogsDialog by remember { mutableStateOf(false) }
    var selectedLogForDetail by remember { mutableStateOf<SyncLogRecord?>(null) }
    var allSyncLogs by remember { mutableStateOf<List<SyncLogRecord>>(emptyList()) }

    fun refreshLogs() {
        allSyncLogs = SyncLogStorage.getAllLogs(context)
    }

    // Search query state
    var searchQuery by remember { mutableStateOf("") }

    // Loaded full SMS messages from local persistent storage (sorted newest first)
    var allMessages by remember {
        mutableStateOf(SmsStorage.loadSavedSms(context))
    }

    // Filter messages dynamically based on search query
    val filteredMessages = remember(allMessages, searchQuery) {
        if (searchQuery.isBlank()) {
            allMessages
        } else {
            val q = searchQuery.trim().lowercase()
            allMessages.filter { sms ->
                sms.body.lowercase().contains(q) ||
                sms.sender.lowercase().contains(q)
            }
        }
    }

    // Infinite Scrolling State (Windowed Pagination)
    val pageSize = 25
    var visibleCount by remember { mutableIntStateOf(pageSize) }
    val listState = rememberLazyListState()

    // Directly recompute displayed messages when filteredMessages or visibleCount changes
    val displayedMessages = remember(filteredMessages, visibleCount) {
        filteredMessages.take(visibleCount)
    }

    // Reset pagination when search query changes
    LaunchedEffect(searchQuery) {
        visibleCount = pageSize
    }

    // Performant infinite scrolling listener
    val shouldLoadMore by remember {
        derivedStateOf {
            val totalItems = listState.layoutInfo.totalItemsCount
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            totalItems > 0 && lastVisible >= totalItems - 4 && visibleCount < filteredMessages.size
        }
    }

    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) {
            visibleCount = minOf(visibleCount + pageSize, filteredMessages.size)
        }
    }

    // On initial launch: Load local cache and optionally sync latest from server
    LaunchedEffect(userEmail, baseUrl) {
        val cached = SmsStorage.loadSavedSms(context)
        if (cached.isNotEmpty()) {
            allMessages = cached
        }
        try {
            val serverResult = ApiService.fetchServerSms(userEmail, limit = 200, customBaseUrl = baseUrl)
            if (serverResult.isSuccess) {
                val serverItems = serverResult.getOrNull() ?: emptyList()
                if (serverItems.isNotEmpty()) {
                    val merged = SmsStorage.mergeAndSave(context, serverItems)
                    allMessages = merged
                }
            }
        } catch (_: Exception) {
            // Silently fall back to cached messages
        }
    }

    // SMS Permissions
    var hasSmsPermissions by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val receiveGranted = permissions[Manifest.permission.RECEIVE_SMS] ?: false
        val readGranted = permissions[Manifest.permission.READ_SMS] ?: false
        hasSmsPermissions = receiveGranted && readGranted
        if (hasSmsPermissions) {
            Toast.makeText(context, "SMS permissions granted!", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(context, "Permissions required to forward banking SMS", Toast.LENGTH_LONG).show()
        }
    }

    val activeKeywords = remember(keywordsText) {
        keywordsText.split(",").map { it.trim() }.filter { it.isNotBlank() }
    }
    val activeSenders = remember(bankSendersText) {
        bankSendersText.split(",").map { it.trim() }.filter { it.isNotBlank() }
    }

    Scaffold(
        containerColor = Color(0xFF020617),
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("💬 Finance Hub SMS Sync", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                },
                actions = {
                    IconButton(onClick = {
                        refreshLogs()
                        showLogsDialog = true
                    }) {
                        Icon(Icons.Default.ReceiptLong, contentDescription = "Sync Logs", tint = Color(0xFF38BDF8))
                    }
                    IconButton(onClick = { showSettingsDialog = true }) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings", tint = Color(0xFF94A3B8))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF0F172A))
            )
        }
    ) { paddingValues ->
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Permission Alert Banner if missing
            if (!hasSmsPermissions) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF7F1D1D).copy(alpha = 0.4f)),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("⚠️ SMS Permissions Required", fontWeight = FontWeight.Bold, color = Color(0xFFFCA5A5), fontSize = 14.sp)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text("Grant SMS access so this app can detect loan debits & backfill your history.", color = Color(0xFFE2E8F0), fontSize = 12.sp)
                            Spacer(modifier = Modifier.height(10.dp))
                            Button(
                                onClick = {
                                    permissionLauncher.launch(
                                        arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)
                                    )
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444))
                            ) {
                                Text("Grant SMS Access")
                            }
                        }
                    }
                }
            }

            // User & Account Card
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.AccountCircle, contentDescription = null, tint = Color(0xFF38BDF8), modifier = Modifier.size(32.dp))
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text("Target User Account", color = Color(0xFF94A3B8), fontSize = 11.sp)
                                    Text(userEmail, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                }
                            }
                            IconButton(onClick = { showSettingsDialog = true }) {
                                Icon(Icons.Default.Edit, contentDescription = "Edit Account", tint = Color(0xFF94A3B8), modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }
            }

            // Real-Time Background Listener Status
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(if (isRealtimeSyncEnabled) Color(0xFF10B981) else Color(0xFFF59E0B))
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    if (isRealtimeSyncEnabled) "Real-Time Listener Active" else "Listener Paused",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                "Automatically catches new loan recovery and EMI SMS from your bank.",
                                color = Color(0xFF94A3B8),
                                fontSize = 11.sp
                            )
                        }
                        Switch(
                            checked = isRealtimeSyncEnabled,
                            onCheckedChange = {
                                isRealtimeSyncEnabled = it
                                SyncConfig.setSyncEnabled(context, it)
                            }
                        )
                    }
                }
            }

            // 1-Click Historic Backfill Action Card
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1B4B).copy(alpha = 0.5f)),
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("🔄 1-Click Historical Backfill", fontWeight = FontWeight.Bold, color = Color(0xFFA5B4FC), fontSize = 14.sp)
                            Surface(
                                color = Color(0xFF312E81),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text(
                                    "Past $scanMonths Mos",
                                    color = Color(0xFFC7D2FE),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "Scans your inbox for past $scanMonths months of loan EMI debits (HDFC, SBI, ICICI, etc.) and pushes them to your dashboard.",
                            color = Color(0xFFCBD5E1),
                            fontSize = 11.sp
                        )
                        Spacer(modifier = Modifier.height(12.dp))

                        Button(
                            onClick = {
                                if (!hasSmsPermissions) {
                                    permissionLauncher.launch(
                                        arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)
                                    )
                                    return@Button
                                }

                                scope.launch {
                                    isBackfilling = true
                                    backfillProgress = "Scanning inbox for past $scanMonths months..."
                                    val logSession = SyncLogSession(context, "Historical Backfill Scan")
                                    logSession.log("Target user: $userEmail")
                                    logSession.log("Server URL: $baseUrl")
                                    logSession.log("Scan Lookback: $scanMonths months")
                                    logSession.log("Bank Senders: ${activeSenders.joinToString(", ")}")
                                    logSession.log("Filter Keywords: ${activeKeywords.joinToString(", ")}")

                                    try {
                                        // Step 1: Scan ALL matching messages
                                        logSession.log("Starting query against content://sms/inbox...")
                                        val matchingMessages = SmsScanner.scanHistoricalSms(
                                            context = context,
                                            userId = userEmail,
                                            monthsBack = scanMonths,
                                            customSenders = activeSenders,
                                            customKeywords = activeKeywords
                                        ) { scanned, found ->
                                            backfillProgress = "Scanned $scanned SMS (Found $found matching records)..."
                                            if (scanned % 100 == 0) {
                                                logSession.log("Scanned $scanned SMS so far (Found $found matching records)")
                                            }
                                        }

                                        logSession.log("Scan complete. Found ${matchingMessages.size} matching bank & loan messages.")

                                        if (matchingMessages.isEmpty()) {
                                            backfillProgress = "No matching SMS found for configured senders & keywords in past $scanMonths months."
                                            logSession.finishSuccess("Scan completed: 0 matching messages found.")
                                            Toast.makeText(context, "No matching SMS found", Toast.LENGTH_SHORT).show()
                                        } else {
                                            // Step 2: Upload in chunked batches to server
                                            backfillProgress = "Found ${matchingMessages.size} matching SMS. Uploading..."
                                            logSession.log("Uploading ${matchingMessages.size} SMS to $baseUrl/api/sync/sms in batches of 100")
                                            val uploadResult = ApiService.syncBatchSms(
                                                messages = matchingMessages,
                                                userId = userEmail,
                                                customBaseUrl = baseUrl
                                            ) { uploaded, total ->
                                                backfillProgress = "Uploaded $uploaded of $total matching SMS..."
                                                logSession.log("Uploaded $uploaded of $total matching SMS")
                                            }

                                            // Step 3: Explicitly trigger the server SMS reading & reconciliation API
                                            backfillProgress = "Triggering server SMS reconciliation & ledger update..."
                                            logSession.log("Explicitly triggering server SMS reconciliation at $baseUrl/api/sync/sms/process")
                                            val serverResult = ApiService.triggerServerSmsProcessing(
                                                userId = userEmail,
                                                customBaseUrl = baseUrl
                                            )

                                            // Step 4: Persist all matching messages to local cache & update state
                                            val merged = SmsStorage.mergeAndSave(context, matchingMessages)
                                            allMessages = merged
                                            visibleCount = pageSize

                                            if (serverResult.isSuccess) {
                                                val serverSummary = serverResult.getOrNull()?.summaryText
                                                    ?: "Server processed ${matchingMessages.size} SMS records!"
                                                backfillProgress = serverSummary
                                                logSession.log("Server reconciliation response: $serverSummary")
                                                logSession.finishSuccess("Synced ${matchingMessages.size} SMS. $serverSummary")
                                                Toast.makeText(context, "Backfill & Server Reconciliation Complete!", Toast.LENGTH_LONG).show()
                                            } else {
                                                val serverNotice = serverResult.exceptionOrNull()?.message
                                                    ?: uploadResult.getOrNull()?.syncSummary
                                                    ?: "Synced ${matchingMessages.size} records"
                                                backfillProgress = "Synced ${matchingMessages.size} SMS. $serverNotice"
                                                logSession.log("Server completed with notice: $serverNotice")
                                                logSession.finishSuccess("Synced ${matchingMessages.size} SMS. Notice: $serverNotice")
                                                Toast.makeText(context, "Backfill Complete (${matchingMessages.size} SMS)", Toast.LENGTH_LONG).show()
                                            }
                                        }
                                    } catch (e: Exception) {
                                        backfillProgress = "Error: ${e.message}"
                                        logSession.finishError("Backfill failed: ${e.message}")
                                    } finally {
                                        isBackfilling = false
                                        refreshLogs()
                                    }
                                }
                            },
                            enabled = !isBackfilling,
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1)),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            if (isBackfilling) {
                                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Scanning & Syncing...", color = Color.White)
                            } else {
                                Icon(Icons.Default.Sync, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Scan & Backfill Past $scanMonths Months", color = Color.White, fontWeight = FontWeight.Bold)
                            }
                        }

                        if (backfillProgress.isNotBlank()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(backfillProgress, color = Color(0xFF818CF8), fontSize = 11.sp)
                        }
                    }
                }
            }

            // Configured Matchers Card
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("🏛️ Monitored Senders & Loan Types", color = Color(0xFF94A3B8), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Text(
                                "Settings ⚙️",
                                color = Color(0xFF38BDF8),
                                fontSize = 11.sp,
                                modifier = Modifier.clickable { showSettingsDialog = true }
                            )
                        }

                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            activeSenders.take(8).forEach { sender ->
                                Surface(
                                    color = Color(0xFF1E293B),
                                    shape = RoundedCornerShape(6.dp)
                                ) {
                                    Text(
                                        text = sender,
                                        color = Color(0xFF38BDF8),
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))
                        Text("Active Keywords:", color = Color(0xFF64748B), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = keywordsText,
                            color = Color(0xFFCBD5E1),
                            fontSize = 11.sp,
                            maxLines = 2
                        )
                    }
                }
            }

            // Search & Filter Bar
            item {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = {
                        Text(
                            "Search messages by text, sender, amount, keyword...",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )
                    },
                    leadingIcon = {
                        Icon(
                            Icons.Default.Search,
                            contentDescription = "Search",
                            tint = Color(0xFF38BDF8),
                            modifier = Modifier.size(20.dp)
                        )
                    },
                    trailingIcon = {
                        if (searchQuery.isNotBlank()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(
                                    Icons.Default.Close,
                                    contentDescription = "Clear Search",
                                    tint = Color(0xFF94A3B8),
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color(0xFF0F172A),
                        unfocusedContainerColor = Color(0xFF0F172A),
                        focusedBorderColor = Color(0xFF38BDF8),
                        unfocusedBorderColor = Color(0xFF1E293B),
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                        cursorColor = Color(0xFF38BDF8)
                    )
                )
            }

            // Synced SMS Events Header with count badge
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("📋 Recent Synced SMS Events", color = Color(0xFF94A3B8), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    if (filteredMessages.isNotEmpty()) {
                        Text(
                            text = if (searchQuery.isNotBlank()) {
                                "Showing ${displayedMessages.size} of ${filteredMessages.size} (filtered)"
                            } else {
                                "Showing ${displayedMessages.size} of ${allMessages.size}"
                            },
                            color = Color(0xFF64748B),
                            fontSize = 11.sp
                        )
                    }
                }
            }

            // Empty state (or no search matches)
            if (filteredMessages.isEmpty()) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            if (searchQuery.isNotBlank()) {
                                Text(
                                    "No messages match \"$searchQuery\"",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                TextButton(
                                    onClick = { searchQuery = "" },
                                    colors = ButtonDefaults.textButtonColors(contentColor = Color(0xFF38BDF8))
                                ) {
                                    Text("Clear Search Filter")
                                }
                            } else {
                                Text(
                                    "No SMS synced yet.",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    "Click 'Scan & Backfill' above to import past loan SMS or wait for new bank SMS.",
                                    color = Color(0xFF64748B),
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                }
            } else {
                // Performant Infinite-Scrolling items with highlighted configured matches
                items(
                    items = displayedMessages,
                    key = { "${it.sender}_${it.timestamp}_${it.body.hashCode()}" }
                ) { sms ->
                    SyncedSmsItem(
                        sms = sms,
                        configuredKeywords = activeKeywords,
                        configuredSenders = activeSenders,
                        searchQuery = searchQuery
                    )
                }

                // Loading / End of list footer indicator
                item {
                    if (visibleCount < filteredMessages.size) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                    color = Color(0xFF6366F1)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    "Loading more messages (${displayedMessages.size}/${filteredMessages.size})...",
                                    color = Color(0xFF818CF8),
                                    fontSize = 11.sp
                                )
                            }
                        }
                    } else if (filteredMessages.size > pageSize) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "✓ All ${filteredMessages.size} messages loaded",
                                color = Color(0xFF64748B),
                                fontSize = 11.sp
                            )
                        }
                    }
                }
            }
        }
    }

    // Sync Logs List Modal Dialog
    if (showLogsDialog) {
        AlertDialog(
            onDismissRequest = { showLogsDialog = false },
            title = {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("📋 Sync History & Logs", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color.White)
                    Surface(
                        color = Color(0xFF1E293B),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            "${allSyncLogs.size} logs",
                            color = Color(0xFF38BDF8),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                        )
                    }
                }
            },
            text = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 420.dp)
                ) {
                    if (allSyncLogs.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 32.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "No sync logs recorded yet in storage.",
                                color = Color(0xFF94A3B8),
                                fontSize = 12.sp
                            )
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            items(allSyncLogs) { logRecord ->
                                Card(
                                    colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            selectedLogForDetail = logRecord
                                        }
                                ) {
                                    Column(modifier = Modifier.padding(12.dp)) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(
                                                text = logRecord.actionName,
                                                color = Color.White,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp
                                            )
                                            Surface(
                                                color = if (logRecord.status == "SUCCESS") Color(0xFF065F46) else Color(0xFF991B1B),
                                                shape = RoundedCornerShape(4.dp)
                                            ) {
                                                Text(
                                                    text = logRecord.status,
                                                    color = if (logRecord.status == "SUCCESS") Color(0xFF34D399) else Color(0xFFFCA5A5),
                                                    fontSize = 9.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                )
                                            }
                                        }

                                        Spacer(modifier = Modifier.height(4.dp))
                                        Text(
                                            text = logRecord.formattedTime,
                                            color = Color(0xFF64748B),
                                            fontSize = 10.sp
                                        )

                                        Spacer(modifier = Modifier.height(6.dp))
                                        Text(
                                            text = logRecord.summary,
                                            color = Color(0xFFCBD5E1),
                                            fontSize = 11.sp,
                                            maxLines = 2
                                        )

                                        Spacer(modifier = Modifier.height(6.dp))
                                        Text(
                                            text = "Tap to view full trace (${logRecord.logs.size} lines) →",
                                            color = Color(0xFF38BDF8),
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showLogsDialog = false }) {
                    Text("Close")
                }
            },
            dismissButton = {
                if (allSyncLogs.isNotEmpty()) {
                    TextButton(
                        onClick = {
                            SyncLogStorage.clearAllLogs(context)
                            refreshLogs()
                            Toast.makeText(context, "Cleared all sync logs", Toast.LENGTH_SHORT).show()
                        }
                    ) {
                        Text("Clear Logs", color = Color(0xFFF87171))
                    }
                }
            }
        )
    }

    // Detailed Log Popup Dialog
    if (selectedLogForDetail != null) {
        val detail = selectedLogForDetail!!
        val clipboardManager = LocalClipboardManager.current

        AlertDialog(
            onDismissRequest = { selectedLogForDetail = null },
            title = {
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(detail.actionName, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color.White)
                        Surface(
                            color = if (detail.status == "SUCCESS") Color(0xFF065F46) else Color(0xFF991B1B),
                            shape = RoundedCornerShape(4.dp)
                        ) {
                            Text(
                                detail.status,
                                color = if (detail.status == "SUCCESS") Color(0xFF34D399) else Color(0xFFFCA5A5),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(detail.formattedTime, color = Color(0xFF94A3B8), fontSize = 11.sp)
                }
            },
            text = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 400.dp)
                ) {
                    // Summary Banner
                    Surface(
                        color = Color(0xFF1E293B),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = detail.summary,
                            color = Color(0xFFE2E8F0),
                            fontSize = 11.sp,
                            modifier = Modifier.padding(10.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                    Text("Execution Log Trace:", color = Color(0xFF94A3B8), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(4.dp))

                    // Monospaced Log Console
                    Surface(
                        color = Color(0xFF020617),
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(1.dp, Color(0xFF1E293B)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f, fill = false)
                    ) {
                        val scrollState = rememberScrollState()
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .verticalScroll(scrollState)
                                .padding(10.dp)
                        ) {
                            detail.logs.forEach { line ->
                                Text(
                                    text = line,
                                    color = if (line.contains("error", ignoreCase = true) || line.contains("failed", ignoreCase = true)) {
                                        Color(0xFFFCA5A5)
                                    } else if (line.contains("success", ignoreCase = true)) {
                                        Color(0xFF34D399)
                                    } else {
                                        Color(0xFF94A3B8)
                                    },
                                    fontSize = 10.sp,
                                    fontFamily = FontFamily.Monospace,
                                    lineHeight = 15.sp
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val fullLog = buildString {
                            appendLine("=== Sync Log: ${detail.actionName} ===")
                            appendLine("Timestamp: ${detail.formattedTime}")
                            appendLine("Status: ${detail.status}")
                            appendLine("Summary: ${detail.summary}")
                            appendLine("--- Trace ---")
                            detail.logs.forEach { appendLine(it) }
                        }
                        clipboardManager.setText(AnnotatedString(fullLog))
                        Toast.makeText(context, "Logs copied to clipboard!", Toast.LENGTH_SHORT).show()
                    }
                ) {
                    Text("Copy Logs")
                }
            },
            dismissButton = {
                TextButton(onClick = { selectedLogForDetail = null }) {
                    Text("Close")
                }
            }
        )
    }

    // Settings Modal Dialog
    if (showSettingsDialog) {
        AlertDialog(
            onDismissRequest = { showSettingsDialog = false },
            title = { Text("Configure SMS Matchers & Settings", fontWeight = FontWeight.Bold, fontSize = 16.sp) },
            text = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedTextField(
                        value = userEmail,
                        onValueChange = { userEmail = it },
                        label = { Text("Account Email") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = bankSendersText,
                        onValueChange = { bankSendersText = it },
                        label = { Text("Bank Senders (Comma-separated)") },
                        placeholder = { Text("BOI, HDFCBK, SBI, ICICI") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = keywordsText,
                        onValueChange = { keywordsText = it },
                        label = { Text("Filter Keywords (Comma-separated)") },
                        placeholder = { Text("ACH D, loan, emi, recovery") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = scanMonths.toString(),
                        onValueChange = { scanMonths = it.toIntOrNull() ?: 12 },
                        label = { Text("Historical Scan Lookback (Months)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = baseUrl,
                        onValueChange = { baseUrl = it },
                        label = { Text("Backend Server URL") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        SyncConfig.setUserId(context, userEmail)
                        SyncConfig.setBaseUrl(context, baseUrl)
                        SyncConfig.setBankSenders(context, bankSendersText)
                        SyncConfig.setFilterKeywords(context, keywordsText)
                        SyncConfig.setScanMonths(context, scanMonths)

                        showSettingsDialog = false
                        Toast.makeText(context, "Settings saved!", Toast.LENGTH_SHORT).show()
                    }
                ) {
                    Text("Save Settings")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        SyncConfig.resetToDefaults(context)
                        userEmail = SyncConfig.DEFAULT_USER_ID
                        baseUrl = SyncConfig.DEFAULT_BASE_URL
                        bankSendersText = SyncConfig.DEFAULT_BANK_SENDERS
                        keywordsText = SyncConfig.DEFAULT_KEYWORDS
                        scanMonths = SyncConfig.DEFAULT_SCAN_MONTHS
                        Toast.makeText(context, "Reset to defaults", Toast.LENGTH_SHORT).show()
                    }
                ) {
                    Text("Reset Defaults", color = Color(0xFFF87171))
                }
            }
        )
    }
}

/**
 * Individual SMS Item Card displaying full content, timestamp, and highlighted configured matches
 */
@Composable
fun SyncedSmsItem(
    sms: SmsPayload,
    configuredKeywords: List<String>,
    configuredSenders: List<String>,
    searchQuery: String
) {
    val annotatedBody = remember(sms.body, configuredKeywords, configuredSenders, searchQuery) {
        buildHighlightedSmsText(sms.body, configuredKeywords, configuredSenders, searchQuery)
    }

    val formattedDate = remember(sms.timestamp) {
        if (sms.timestamp > 0) {
            try {
                val sdf = SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault())
                sdf.format(Date(sms.timestamp))
            } catch (_: Exception) {
                ""
            }
        } else ""
    }

    val matchesSender = remember(sms.sender, configuredSenders) {
        configuredSenders.any { s ->
            s.isNotBlank() && sms.sender.contains(s, ignoreCase = true)
        }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            // Header: Sender badge and Timestamp
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    color = if (matchesSender) Color(0xFF0C4A6E).copy(alpha = 0.6f) else Color(0xFF1E293B),
                    shape = RoundedCornerShape(6.dp),
                    border = if (matchesSender) BorderStroke(1.dp, Color(0xFF38BDF8).copy(alpha = 0.5f)) else null
                ) {
                    Text(
                        text = "[${sms.sender}]",
                        color = if (matchesSender) Color(0xFF38BDF8) else Color(0xFF94A3B8),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }

                if (formattedDate.isNotBlank()) {
                    Text(
                        text = formattedDate,
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Full message text without truncation, with matched parts highlighted
            Text(
                text = annotatedBody,
                color = Color(0xFFE2E8F0),
                fontSize = 12.sp,
                lineHeight = 18.sp,
                fontFamily = FontFamily.SansSerif
            )
        }
    }
}

/**
 * Builds an AnnotatedString that strictly highlights the CONFIGURED matchers (keywords and bank senders),
 * active search query, and genuine currency amounts.
 */
fun buildHighlightedSmsText(
    body: String,
    keywords: List<String>,
    senders: List<String>,
    searchQuery: String = ""
): AnnotatedString {
    return buildAnnotatedString {
        append(body)

        // 1. Highlight CONFIGURED FILTER KEYWORDS and loan patterns (e.g. ACH D, Loan Rec, Debited(TRF)) in Amber/Gold
        val combinedKeywords = (keywords + listOf("loan rec", "debited(trf)", "ln recovery", "loan a/c")).distinct()
        for (kw in combinedKeywords) {
            val cleanKw = kw.trim()
            if (cleanKw.length < 2) continue
            var startIndex = 0
            while (startIndex < body.length) {
                val index = body.indexOf(cleanKw, startIndex, ignoreCase = true)
                if (index == -1) break
                addStyle(
                    style = SpanStyle(
                        color = Color(0xFFFBBF24), // Amber/Gold
                        fontWeight = FontWeight.Bold,
                        background = Color(0x40FBBF24)
                    ),
                    start = index,
                    end = index + cleanKw.length
                )
                startIndex = index + cleanKw.length
            }
        }

        // 2. Highlight CONFIGURED BANK SENDERS in the message body (e.g. BOI, HDFCBK, HDFC) in Sky Blue
        for (sender in senders) {
            val cleanSender = sender.trim()
            if (cleanSender.length < 2) continue
            var startIndex = 0
            while (startIndex < body.length) {
                val index = body.indexOf(cleanSender, startIndex, ignoreCase = true)
                if (index == -1) break
                addStyle(
                    style = SpanStyle(
                        color = Color(0xFF38BDF8), // Cyan/Sky Blue
                        fontWeight = FontWeight.Bold,
                        background = Color(0x3338BDF8)
                    ),
                    start = index,
                    end = index + cleanSender.length
                )
                startIndex = index + cleanSender.length
            }
        }

        // 3. Highlight SEARCH QUERY (if active) in Vibrant Purple
        val cleanSearch = searchQuery.trim()
        if (cleanSearch.length >= 2) {
            var startIndex = 0
            while (startIndex < body.length) {
                val index = body.indexOf(cleanSearch, startIndex, ignoreCase = true)
                if (index == -1) break
                addStyle(
                    style = SpanStyle(
                        color = Color(0xFFC084FC), // Vibrant Purple
                        fontWeight = FontWeight.ExtraBold,
                        background = Color(0x4D8B5CF6)
                    ),
                    start = index,
                    end = index + cleanSearch.length
                )
                startIndex = index + cleanSearch.length
            }
        }

        // 4. Highlight Currency Amounts (e.g. INR 36,344.00, Rs 42262.77, ₹12,000) in Emerald Green
        val amountRegex = Regex("(?i)(?:inr\\.?|rs\\.?|₹)\\s*[\\d,]+(?:\\.\\d{1,2})?")
        for (match in amountRegex.findAll(body)) {
            addStyle(
                style = SpanStyle(
                    color = Color(0xFF34D399), // Emerald
                    fontWeight = FontWeight.Bold,
                    background = Color(0x2634D399)
                ),
                start = match.range.first,
                end = match.range.last + 1
            )
        }
    }
}
