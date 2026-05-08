package com.scalamatic.medicore.callcenter

import android.app.*
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.CallLog
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*

/**
 * Foreground service that watches the device CallLog content provider.
 * When new rows appear (detected via ContentObserver), we query for rows
 * whose _id is greater than the last-pushed id (stored in Prefs) and POST
 * each one to MediCore /api/calls/incoming with channel=phone.
 *
 * Mapping from Android CallLog.TYPE → MediCore {direction, state}:
 *   INCOMING, duration > 0  → INBOUND,  ended
 *   INCOMING, duration == 0 → INBOUND,  missed
 *   OUTGOING, duration > 0  → OUTBOUND, ended
 *   OUTGOING, duration == 0 → OUTBOUND, missed (not answered by other side)
 *   MISSED                  → INBOUND,  missed
 *   REJECTED                → INBOUND,  missed
 *   VOICEMAIL / BLOCKED     → skipped
 */
class CallLogObserverService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var prefs: Prefs
    private val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean, uri: Uri?) { syncNewCalls() }
    }
    private lateinit var phoneMonitor: PhoneStateMonitor
    private val outgoingReceiver = OutgoingCallReceiver()
    private var pollJob: Job? = null
    private lateinit var controlPoller: CallControlPoller

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        prefs.syncEnabled = true
        prefs.syncStartedAt = System.currentTimeMillis()
        startInForeground()
        contentResolver.registerContentObserver(CallLog.Calls.CONTENT_URI, true, observer)

        // Live tracking: ringing/answered inbound + dial-out outbound. The
        // CallLog observer still fires the final ended/missed row with
        // duration once the system writes the row.
        phoneMonitor = PhoneStateMonitor(this).also { it.start() }
        val filter = IntentFilter(Intent.ACTION_NEW_OUTGOING_CALL)
        ContextCompat.registerReceiver(
            this, outgoingReceiver, filter, ContextCompat.RECEIVER_EXPORTED,
        )

        // Pull dashboard-issued Answer/Hangup/Dial commands.
        controlPoller = CallControlPoller(this).also { it.start() }

        // Sync once at startup to catch anything missed while we were down
        syncNewCalls()

        // Safety-net poller: fires every 60s regardless of ContentObserver
        // notifications. Android's CallLog ContentObserver isn't 100%
        // reliable across OEMs (MIUI, ColorOS, HarmonyOS quietly drop
        // observer callbacks after some battery-optimisation kicks in),
        // so a periodic re-query catches anything onChange missed.
        pollJob = scope.launch {
            while (isActive) {
                delay(60_000)
                syncNewCalls()
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        contentResolver.unregisterContentObserver(observer)
        phoneMonitor.stop()
        try { unregisterReceiver(outgoingReceiver) } catch (_: IllegalArgumentException) { /* not registered */ }
        controlPoller.stop()
        pollJob?.cancel()
        prefs.syncEnabled = false
        scope.cancel()
        super.onDestroy()
    }

    private fun startInForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL_ID, "Call Sync", NotificationManager.IMPORTANCE_MIN)
            ch.description = "Background sync of call log events to MediCore"
            nm.createNotificationChannel(ch)
        }
        val notif = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_phone_call)
            .setContentTitle("MediCore Call Sync")
            .setContentText("Monitoring call log")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun syncNewCalls() = scope.launch {
        try {
            if (!prefs.isConfigured()) return@launch
            val rows = queryNewCalls(prefs.lastCallId)
            for (row in rows) {
                val result = MediCoreClient.send(prefs, row.toEvent())
                if (result.isSuccess) {
                    prefs.lastCallId = row.id
                } else {
                    Log.w(TAG, "Stopping sync on failure; will retry next onChange")
                    break
                }
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "READ_CALL_LOG not granted")
        } catch (e: Exception) {
            Log.w(TAG, "syncNewCalls error: ${e.message}")
        }
    }

    private data class CallRow(
        val id: Long, val number: String, val type: Int, val duration: Int, val name: String?,
    ) {
        fun toEvent(): MediCoreClient.Event {
            val direction = if (type == CallLog.Calls.OUTGOING_TYPE) "OUTBOUND" else "INBOUND"
            val state = when {
                type == CallLog.Calls.MISSED_TYPE || type == CallLog.Calls.REJECTED_TYPE -> "missed"
                duration == 0 -> "missed"
                else -> "ended"
            }
            return MediCoreClient.Event(
                channel = "phone",
                direction = direction,
                phone = number,
                state = state,
                duration = duration,
                contactName = name,
            )
        }
    }

    private fun queryNewCalls(afterId: Long): List<CallRow> {
        val projection = arrayOf(
            CallLog.Calls._ID,
            CallLog.Calls.NUMBER,
            CallLog.Calls.TYPE,
            CallLog.Calls.DURATION,
            CallLog.Calls.CACHED_NAME,
            CallLog.Calls.DATE,
        )
        // Hard cap how far back we'll backfill on first sync. Without this,
        // a fresh install (lastCallId=0) would push every CallLog row on
        // the device — potentially thousands of unrelated old calls — and
        // pollute the dashboard with ancient activity. Steady-state queries
        // (lastCallId>0) are still bounded by `_ID > afterId`, so this only
        // really kicks in on first run / after settings reset.
        val cutoffMs = System.currentTimeMillis() - BACKFILL_WINDOW_MS
        val out = mutableListOf<CallRow>()
        contentResolver.query(
            CallLog.Calls.CONTENT_URI, projection,
            "${CallLog.Calls._ID} > ? AND ${CallLog.Calls.DATE} >= ?",
            arrayOf(afterId.toString(), cutoffMs.toString()),
            "${CallLog.Calls._ID} ASC"
        )?.use { c ->
            val iId = c.getColumnIndexOrThrow(CallLog.Calls._ID)
            val iNum = c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
            val iTyp = c.getColumnIndexOrThrow(CallLog.Calls.TYPE)
            val iDur = c.getColumnIndexOrThrow(CallLog.Calls.DURATION)
            val iNam = c.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME)
            while (c.moveToNext()) {
                val num = c.getString(iNum) ?: continue
                val type = c.getInt(iTyp)
                // Skip voicemail + blocked — not call-center relevant
                if (type == CallLog.Calls.VOICEMAIL_TYPE || type == CallLog.Calls.BLOCKED_TYPE) continue
                out.add(CallRow(
                    id = c.getLong(iId),
                    number = num,
                    type = type,
                    duration = c.getInt(iDur),
                    name = c.getString(iNam),
                ))
            }
        }
        return out
    }

    companion object {
        private const val TAG = "CallLogObserver"
        private const val CHANNEL_ID = "callsync"
        private const val NOTIF_ID = 42
        // How far back the CallLog query window reaches. Anything older
        // is ignored — keeps fresh installs from spamming the dashboard
        // with the entire phone-call history. Tuned for "we'll catch any
        // call within an hour of it happening" assuming the phone +
        // service stay alive that long.
        private const val BACKFILL_WINDOW_MS: Long = 60L * 60L * 1000L

        fun start(ctx: android.content.Context) {
            val i = Intent(ctx, CallLogObserverService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i)
            else ctx.startService(i)
        }

        fun stop(ctx: android.content.Context) {
            ctx.stopService(Intent(ctx, CallLogObserverService::class.java))
        }
    }
}
