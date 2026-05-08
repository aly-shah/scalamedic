package com.scalamatic.medicore.callcenter

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.TextUtils
import android.view.Gravity
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.scalamatic.medicore.callcenter.databinding.ActivityMainBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Receptionist-mode home screen.
 *
 * Single purpose: show the live activity feed (incoming/outgoing calls
 * and WhatsApp messages forwarded from this phone). All configuration is
 * either pinned at build time (service token, base URL) or captured at
 * login (agent email + name), so this screen has no setup form, no
 * "Start sync" button — the foreground service is auto-started when
 * permissions are granted, and stopped only when the user signs out.
 *
 * Connection status pill in the toolbar reflects whether the most
 * recent forwarder POST succeeded; banner under the toolbar prompts
 * for missing runtime permissions.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var b: ActivityMainBinding
    private lateinit var prefs: Prefs

    private val main = Handler(Looper.getMainLooper())
    private val tick: Runnable = object : Runnable {
        override fun run() {
            refresh()
            main.postDelayed(this, 2000L)
        }
    }

    private val reqRuntimePerms =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            ensureSyncRunning()
            refresh()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)

        // Hard gate: if for some reason we land here without a login,
        // bounce back. Belt + braces — LoginActivity is the launcher.
        if (!prefs.isLoggedIn()) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }

        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)
        setSupportActionBar(b.toolbar)
        supportActionBar?.setDisplayShowTitleEnabled(false)

        b.grantPerms.setOnClickListener { requestPerms() }
    }

    override fun onResume() {
        super.onResume()
        ensureSyncRunning()
        refresh()
        main.post(tick)
    }

    override fun onPause() {
        super.onPause()
        main.removeCallbacks(tick)
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        R.id.menu_sign_out -> {
            confirmSignOut(); true
        }
        else -> super.onOptionsItemSelected(item)
    }

    private fun confirmSignOut() {
        AlertDialog.Builder(this)
            .setTitle(R.string.action_sign_out)
            .setMessage("Stop syncing and sign out?")
            .setPositiveButton(R.string.action_sign_out) { _, _ -> signOut() }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun signOut() {
        CallLogObserverService.stop(this)
        prefs.syncEnabled = false
        prefs.clearLogin()
        prefs.clearRecentEvents()
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }

    /** Start the foreground sync service if permissions are present and
     *  it isn't already running. Runs idempotently from onResume + after
     *  permission grants. */
    private fun ensureSyncRunning() {
        if (!hasAllRuntime()) return
        if (!prefs.syncEnabled) {
            CallLogObserverService.start(this)
        }
    }

    private fun refresh() {
        val runtimeOk = hasAllRuntime()
        val notifOk = isNotifAccessGranted()
        val needPerms = !runtimeOk || !notifOk
        b.permBanner.visibility = if (needPerms) View.VISIBLE else View.GONE

        // Connection state: the service writes lastSuccessAt on every
        // accepted POST and lastError when something fails. We treat the
        // app as connected if there's been a successful event in the
        // last 5 minutes OR sync just started (no events yet but
        // service is alive).
        val now = System.currentTimeMillis()
        val recentSuccess = prefs.lastSuccessAt > 0 && (now - prefs.lastSuccessAt) < 5 * 60_000L
        val errorMoreRecent = prefs.lastError != null && prefs.lastErrorAt > prefs.lastSuccessAt
        val connected = prefs.syncEnabled && (recentSuccess || (!errorMoreRecent && prefs.syncStartedAt > 0))

        if (connected) {
            b.connectionPill.text = "● ${getString(R.string.status_connected)}"
            b.connectionPill.setBackgroundResource(R.drawable.pill_running)
            b.connectionPill.setTextColor(0xFF065F46.toInt())
        } else {
            b.connectionPill.text = "● ${getString(R.string.status_disconnected)}"
            b.connectionPill.setBackgroundResource(R.drawable.pill_idle)
            b.connectionPill.setTextColor(0xFF78716C.toInt())
        }

        renderEvents()
    }

    private fun renderEvents() {
        val events = prefs.recentEvents()
        b.activityList.removeAllViews()
        b.emptyState.visibility = if (events.isEmpty()) View.VISIBLE else View.GONE
        for (line in events) addEventRow(line)
    }

    private fun addEventRow(line: String) {
        val parts = line.split(MediCoreClient.EVENT_FIELD_SEP).toMutableList()
        while (parts.size < 7) parts.add("")
        val tsStr     = parts[0]
        val channel   = parts[1]
        val direction = parts[2]
        val state     = parts[3]
        val phone     = parts[4]
        val name      = parts[5]
        val message   = parts[6]
        val ts        = tsStr.toLongOrNull() ?: 0L
        val isWhatsApp = channel == "whatsapp"
        val isInbound  = direction == "INBOUND"
        // WhatsApp event with a state set ⇒ it's a call notification.
        val isWACall   = isWhatsApp && state.isNotBlank()

        // ── Card container ──
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = androidx.core.content.ContextCompat.getDrawable(this@MainActivity, R.drawable.row_bg)
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.bottomMargin = dp(8)
            layoutParams = lp
        }

        // ── Direction icon bubble ──
        val icon = TextView(this).apply {
            text = when {
                isWACall -> "📞"
                isWhatsApp -> "💬"
                isInbound -> "↘"
                else -> "↗"
            }
            textSize = 16f
            gravity = Gravity.CENTER
            val size = dp(36)
            layoutParams = LinearLayout.LayoutParams(size, size).apply { rightMargin = dp(12) }
            setBackgroundResource(when {
                isWACall   -> R.drawable.bubble_emerald_strong
                isWhatsApp -> R.drawable.bubble_emerald
                isInbound  -> R.drawable.bubble_teal
                else       -> R.drawable.bubble_indigo
            })
        }

        // ── Centre column: name + phone + state/preview ──
        val center = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val titleText = if (name.isNotBlank()) name else if (phone.isNotBlank()) phone else "Unknown"
        val nameView = TextView(this).apply {
            text = titleText
            setTextColor(0xFF1C1917.toInt())
            textSize = 14f
            setTypeface(typeface, Typeface.BOLD)
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        val phoneView = TextView(this).apply {
            text = if (name.isNotBlank() && phone.isNotBlank()) phone else ""
            setTextColor(0xFF78716C.toInt())
            textSize = 12f
            typeface = Typeface.MONOSPACE
            visibility = if (text.isNullOrBlank()) View.GONE else View.VISIBLE
        }
        val sub = TextView(this).apply {
            text = subtitle(channel, direction, state, message, isWACall)
            setTextColor(0xFFA8A29E.toInt())
            textSize = 11f
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        center.addView(nameView)
        center.addView(phoneView)
        center.addView(sub)

        // ── Right column: state pill + time ──
        val right = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.END
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        val statePill = TextView(this).apply {
            text = pillText(channel, state, isWACall)
            textSize = 10f
            setTextColor(0xFF3F3F38.toInt())
            setTypeface(typeface, Typeface.BOLD)
            setPadding(dp(8), dp(3), dp(8), dp(3))
            background = androidx.core.content.ContextCompat.getDrawable(this@MainActivity, R.drawable.pill_idle)
        }
        val timeView = TextView(this).apply {
            text = if (ts > 0) formatTime(ts) else ""
            setTextColor(0xFFA8A29E.toInt())
            textSize = 10f
            gravity = Gravity.END
            setPadding(0, dp(4), 0, 0)
        }
        right.addView(statePill)
        right.addView(timeView)

        card.addView(icon)
        card.addView(center)
        card.addView(right)
        b.activityList.addView(card)
    }

    private fun subtitle(channel: String, direction: String, state: String, message: String, isWACall: Boolean): String {
        if (isWACall) return "WhatsApp · ${if (direction == "OUTBOUND") "Outgoing" else "Incoming"}"
        if (channel == "whatsapp") return if (message.isNotBlank()) message else "WhatsApp message"
        val dir = if (direction == "OUTBOUND") "Outgoing" else "Incoming"
        return "$dir call"
    }

    private fun pillText(channel: String, state: String, isWACall: Boolean): String {
        if (isWACall) return when (state) {
            "missed" -> "Missed"
            else -> "Ringing"
        }
        if (channel == "whatsapp") return "Msg"
        return when (state) {
            "ringing" -> "Ringing"
            "answered" -> "In call"
            "missed" -> "Missed"
            "ended" -> "Ended"
            else -> "Call"
        }
    }

    private fun requestPerms() {
        val needed = buildList {
            add(Manifest.permission.READ_CALL_LOG)
            add(Manifest.permission.READ_PHONE_STATE)
            add(Manifest.permission.READ_CONTACTS)
            add(Manifest.permission.PROCESS_OUTGOING_CALLS)
            add(Manifest.permission.CALL_PHONE)
            add(Manifest.permission.ANSWER_PHONE_CALLS)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1)
                add(Manifest.permission.READ_PHONE_NUMBERS)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
                add(Manifest.permission.POST_NOTIFICATIONS)
        }.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }

        if (needed.isNotEmpty()) {
            reqRuntimePerms.launch(needed.toTypedArray())
            return
        }
        // Runtime perms fine; ask for notification access (separate flow)
        if (!isNotifAccessGranted()) {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            return
        }
        // Both granted; nudge battery-opt exemption
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:$packageName")
        }
        try { startActivity(intent) } catch (_: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun hasAllRuntime(): Boolean {
        // Now also includes the dashboard-control permissions added in
        // 1.1.0 (CALL_PHONE, ANSWER_PHONE_CALLS). Without these in the
        // check, an in-place upgrade from 1.0.x left the perm banner
        // hidden — the user never re-granted, and the Answer/Hangup
        // buttons silently no-op'd.
        val needed = listOf(
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.CALL_PHONE,
            Manifest.permission.ANSWER_PHONE_CALLS,
        )
        return needed.all { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED }
    }

    private fun isNotifAccessGranted(): Boolean {
        val enabledPkgs = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
        return !TextUtils.isEmpty(enabledPkgs) && enabledPkgs.contains(packageName)
    }

    private fun formatTime(ts: Long): String =
        SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(ts))

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}
