package com.scalamatic.medicore.callcenter

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.telecom.TelecomManager
import android.util.Log
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Short-polls the MediCore server for phone-control commands queued by
 * the dashboard (Answer / Hang up / Click-to-dial). Each command is
 * dispatched to the appropriate Android API:
 *
 *   answer  → TelecomManager.acceptRingingCall()  (API 26+, ANSWER_PHONE_CALLS)
 *   hangup  → TelecomManager.endCall()            (API 28+, ANSWER_PHONE_CALLS)
 *   dial    → ACTION_CALL intent                  (CALL_PHONE)
 *
 * Why short-polling:
 *   - We're already running a foreground service for the call observer,
 *     so the polling loop is "free" battery-wise.
 *   - Long-poll / SSE in Next.js is fiddly and gains us 0–2s latency on
 *     a button press for a call that's going to ring 30+ seconds anyway.
 *   - WebSocket would be ideal but Next.js App Router doesn't support
 *     it natively.
 *
 * Lifecycle: started in CallLogObserverService.onCreate, cancelled in
 * onDestroy. Failures are silenced — the user will see button latency
 * if the network is bad, but the foreground service stays healthy.
 */
class CallControlPoller(private val ctx: Context) {

    private val prefs = Prefs(ctx)
    private val tm = ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var job: Job? = null

    private val http: OkHttpClient = OkHttpClient.Builder()
        .callTimeout(8, TimeUnit.SECONDS)
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .build()

    fun start() {
        if (job?.isActive == true) return
        job = scope.launch {
            // Tiny initial delay so we don't poll the moment the service
            // starts up — gives the network a beat to settle on slow boot.
            delay(2_000)
            while (isActive) {
                try { tick() } catch (e: Exception) {
                    Log.w(TAG, "poll error: ${e.message}")
                }
                delay(POLL_INTERVAL_MS)
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    private suspend fun tick() {
        if (!prefs.isConfigured() || prefs.agentId.isBlank()) return
        val url = "${prefs.baseUrl.trimEnd('/')}/api/calls/control/poll?agentId=${prefs.agentId}"
        val req = Request.Builder()
            .url(url)
            .header("X-Service-Token", prefs.serviceToken)
            .build()
        withContext(Dispatchers.IO) {
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@use
                val body = resp.body?.string().orEmpty()
                val arr = JSONObject(body).optJSONArray("data") ?: return@use
                for (i in 0 until arr.length()) {
                    val cmd = arr.optJSONObject(i) ?: continue
                    val action = cmd.optString("action")
                    val number = cmd.optString("number").takeIf { it.isNotBlank() }
                    Log.i(TAG, "executing $action ${number ?: ""}")
                    withContext(Dispatchers.Main) { execute(action, number) }
                }
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun execute(action: String, number: String?) {
        when (action) {
            "answer" -> {
                if (!has(Manifest.permission.ANSWER_PHONE_CALLS)) {
                    Log.w(TAG, "answer skipped: ANSWER_PHONE_CALLS not granted")
                    return
                }
                try { tm.acceptRingingCall() }
                catch (e: SecurityException) { Log.w(TAG, "acceptRingingCall: ${e.message}") }
            }
            "hangup" -> {
                if (!has(Manifest.permission.ANSWER_PHONE_CALLS)) {
                    Log.w(TAG, "hangup skipped: ANSWER_PHONE_CALLS not granted")
                    return
                }
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
                    Log.w(TAG, "hangup needs Android 9+; current SDK ${Build.VERSION.SDK_INT}")
                    return
                }
                try {
                    @Suppress("DEPRECATION")
                    tm.endCall()
                } catch (e: SecurityException) { Log.w(TAG, "endCall: ${e.message}") }
            }
            "dial" -> {
                val n = number ?: return
                if (!has(Manifest.permission.CALL_PHONE)) {
                    Log.w(TAG, "dial skipped: CALL_PHONE not granted")
                    return
                }
                val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$n")).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                try { ctx.startActivity(intent) }
                catch (e: SecurityException) { Log.w(TAG, "dial: ${e.message}") }
            }
            else -> Log.w(TAG, "unknown action $action")
        }
    }

    private fun has(perm: String) =
        ContextCompat.checkSelfPermission(ctx, perm) == PackageManager.PERMISSION_GRANTED

    companion object {
        private const val TAG = "CallControlPoller"
        // 3s strikes the right balance: receptionist sees Answer feel
        // near-instant, phone polls 20×/min which is negligible while
        // already in foreground.
        private const val POLL_INTERVAL_MS = 3_000L
    }
}
