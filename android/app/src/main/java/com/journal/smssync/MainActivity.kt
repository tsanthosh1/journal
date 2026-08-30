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
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

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
    val prefs = remember { context.getSharedPreferences(SmsReceiver.PREFS_NAME, Context.MODE_PRIVATE) }
    val scope = rememberCoroutineScope()

    var userEmail by remember {
        mutableStateOf(prefs.getString(SmsReceiver.KEY_USER_ID, "tsanthosh.online@gmail.com") ?: "tsanthosh.online@gmail.com")
    }
    var isRealtimeSyncEnabled by remember {
        mutableStateOf(prefs.getBoolean(SmsReceiver.KEY_SYNC_ENABLED, true))
    }
    var isBackfilling by remember { mutableStateOf(false) }
    var backfillProgress by remember { mutableStateOf("Ready to scan") }
    var recentLogs by remember {
        mutableStateOf(
            prefs.getString(SmsReceiver.KEY_LAST_SMS_LOG, "")
                ?.split("\n")
                ?.filter { it.isNotBlank() } ?: emptyList()
        )
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

    Scaffold(
        containerColor = Color(0xFF020617),
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("💬 Finance Hub SMS Sync", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF0F172A))
            )
        }
    ) { paddingValues ->
        LazyColumn(
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
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.AccountCircle, contentDescription = null, tint = Color(0xFF38BDF8), modifier = Modifier.size(32.dp))
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text("Target User Account", color = Color(0xFF94A3B8), fontSize = 11.sp)
                                Text(userEmail, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
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
                                prefs.edit().putBoolean(SmsReceiver.KEY_SYNC_ENABLED, it).apply()
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
                        Text("🔄 1-Click Historical Backfill", fontWeight = FontWeight.Bold, color = Color(0xFFA5B4FC), fontSize = 14.sp)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "Scans your inbox for past 12 months of loan EMI debits (HDFC, SBI, ICICI, etc.) and pushes them to your dashboard.",
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
                                    backfillProgress = "Scanning inbox..."
                                    try {
                                        val messages = SmsScanner.scanHistoricalSms(
                                            context = context,
                                            userId = userEmail,
                                            monthsBack = 12
                                        ) { scanned, found ->
                                            backfillProgress = "Scanned $scanned SMS (Found $found loan records)..."
                                        }

                                        backfillProgress = "Found ${messages.size} loan records. Uploading..."
                                        val result = ApiService.syncBatchSms(messages, userEmail)

                                        if (result.isSuccess) {
                                            val summary = result.getOrNull()?.syncSummary ?: "Ingested ${messages.size} records!"
                                            backfillProgress = summary
                                            Toast.makeText(context, "Backfill Complete!", Toast.LENGTH_LONG).show()

                                            val logs = messages.take(10).map { "[${it.sender}] ${it.body.take(60)}..." }
                                            recentLogs = logs
                                            prefs.edit().putString(SmsReceiver.KEY_LAST_SMS_LOG, logs.joinToString("\n")).apply()
                                        } else {
                                            backfillProgress = "Upload Error: ${result.exceptionOrNull()?.message}"
                                        }
                                    } catch (e: Exception) {
                                        backfillProgress = "Error: ${e.message}"
                                    } finally {
                                        isBackfilling = false
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
                                Text("Scanning...", color = Color.White)
                            } else {
                                Icon(Icons.Default.Sync, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Scan & Backfill Past 12 Months", color = Color.White, fontWeight = FontWeight.Bold)
                            }
                        }

                        if (backfillProgress.isNotBlank()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(backfillProgress, color = Color(0xFF818CF8), fontSize = 11.sp)
                        }
                    }
                }
            }

            // Monitored Banks Chips
            item {
                Column {
                    Text("🏦 Monitored Senders & Loan Types", color = Color(0xFF94A3B8), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        listOf("HDFC", "SBI", "ICICI", "CANARA", "AXIS", "BAJAJ").forEach { bank ->
                            Surface(
                                color = Color(0xFF1E293B),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text(
                                    text = bank,
                                    color = Color(0xFF38BDF8),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }
                }
            }

            // Live Sync Feed Log
            item {
                Text("📋 Recent Synced SMS Events", color = Color(0xFF94A3B8), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }

            if (recentLogs.isEmpty()) {
                item {
                    Text("No SMS forwarded yet. Incoming bank SMS will appear here automatically.", color = Color(0xFF64748B), fontSize = 11.sp)
                }
            } else {
                items(recentLogs) { logLine ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = logLine,
                            color = Color(0xFFE2E8F0),
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            }
        }
    }
}
