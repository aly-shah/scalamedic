package com.scalamatic.medicore.callcenter

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

/**
 * Thin typed wrapper around SharedPreferences for the four pieces of config
 * every service needs: the MediCore base URL, the agent's email, the shared
 * service token (matches DIALER_SERVICE_TOKEN on the server), and the id of
 * the most recently observed CallLog entry so we only push new ones.
 */
class Prefs(context: Context) {
    private val sp: SharedPreferences =
        context.applicationContext.getSharedPreferences("medicore_cc", Context.MODE_PRIVATE)

    var baseUrl: String
        get() = sp.getString(K_BASE, DEFAULT_BASE) ?: DEFAULT_BASE
        set(v) = sp.edit { putString(K_BASE, v.trimEnd('/')) }

    var agentEmail: String
        get() = sp.getString(K_EMAIL, "") ?: ""
        set(v) = sp.edit { putString(K_EMAIL, v.trim().lowercase()) }

    var serviceToken: String
        get() = sp.getString(K_TOKEN, "") ?: ""
        set(v) = sp.edit { putString(K_TOKEN, v.trim()) }

    /** Server-side user.id (UUID). Used as the queue key when the dashboard
     *  POSTs phone-control commands and when the phone polls them back. */
    var agentId: String
        get() = sp.getString(K_AGENT_ID, "") ?: ""
        set(v) = sp.edit { putString(K_AGENT_ID, v) }

    /** Display name shown in the app bar, e.g., "Sara Ahmed". Captured
     *  from the /api/auth/login response so the receptionist sees their
     *  name instead of just an email. */
    var agentName: String
        get() = sp.getString(K_NAME, "") ?: ""
        set(v) = sp.edit { putString(K_NAME, v) }

    var agentRole: String
        get() = sp.getString(K_ROLE, "") ?: ""
        set(v) = sp.edit { putString(K_ROLE, v) }

    /** Last Calls._ID that's been pushed; new rows must have _id > this. */
    var lastCallId: Long
        get() = sp.getLong(K_LAST, 0L)
        set(v) = sp.edit { putLong(K_LAST, v) }

    /** True once the user has tapped Start Sync. The foreground service flips
     *  this on in onCreate and off in onDestroy so the UI can render the
     *  running state across activity recreations and after process death. */
    var syncEnabled: Boolean
        get() = sp.getBoolean(K_SYNC, false)
        set(v) = sp.edit { putBoolean(K_SYNC, v) }

    var syncStartedAt: Long
        get() = sp.getLong(K_SYNC_AT, 0L)
        set(v) = sp.edit { putLong(K_SYNC_AT, v) }

    /** Last successful POST timestamp (ms since epoch). 0 if none yet. */
    var lastSuccessAt: Long
        get() = sp.getLong(K_LAST_OK, 0L)
        set(v) = sp.edit { putLong(K_LAST_OK, v) }

    /** Short error string from the most recent FAILED POST, or null when the
     *  last attempt succeeded. The UI hides any error older than the most
     *  recent success so a transient 401 during token-fix doesn't stay
     *  pinned forever. */
    var lastError: String?
        get() = sp.getString(K_LAST_ERR, null)
        set(v) = sp.edit { if (v == null) remove(K_LAST_ERR) else putString(K_LAST_ERR, v) }

    var lastErrorAt: Long
        get() = sp.getLong(K_LAST_ERR_AT, 0L)
        set(v) = sp.edit { putLong(K_LAST_ERR_AT, v) }

    /**
     * Recent events ring buffer for the in-app activity feed. Each entry is
     * a single newline-delimited string of the form:
     *   epochMs|channel|direction|state|phone|contactName|messageText
     * Newest-first, capped at MAX_EVENTS. Stored as a single string so we can
     * read/write atomically without serialising a list.
     */
    fun recordEvent(line: String) {
        val cur = sp.getString(K_EVENTS, "") ?: ""
        val rows = (listOf(line) + cur.split("\n").filter { it.isNotBlank() }).take(MAX_EVENTS)
        sp.edit { putString(K_EVENTS, rows.joinToString("\n")) }
    }

    fun recentEvents(): List<String> {
        val raw = sp.getString(K_EVENTS, "") ?: ""
        return raw.split("\n").filter { it.isNotBlank() }
    }

    fun clearRecentEvents() = sp.edit { remove(K_EVENTS) }

    fun isConfigured(): Boolean =
        baseUrl.isNotBlank() && agentEmail.isNotBlank() && serviceToken.isNotBlank()

    /** True after the user has successfully signed in via LoginActivity.
     *  We persist the login as a one-shot flag — credentials aren't
     *  re-checked on every launch (the session token is the service
     *  token, baked at build time). To force a re-login, call
     *  clearLogin(). */
    var loggedInAt: Long
        get() = sp.getLong(K_LOGIN_AT, 0L)
        set(v) = sp.edit { putLong(K_LOGIN_AT, v) }

    fun isLoggedIn(): Boolean = loggedInAt > 0 && agentEmail.isNotBlank()

    fun clearLogin() = sp.edit {
        remove(K_LOGIN_AT)
        remove(K_EMAIL)
        remove(K_AGENT_ID)
        remove(K_NAME)
        remove(K_ROLE)
    }

    companion object {
        private const val K_BASE    = "baseUrl"
        private const val K_EMAIL   = "agentEmail"
        private const val K_AGENT_ID = "agentId"
        private const val K_TOKEN   = "serviceToken"
        private const val K_NAME    = "agentName"
        private const val K_ROLE    = "agentRole"
        private const val K_LOGIN_AT = "loggedInAt"
        private const val K_LAST    = "lastCallId"
        private const val K_SYNC    = "syncEnabled"
        private const val K_SYNC_AT = "syncStartedAt"
        private const val K_EVENTS  = "recentEvents"
        private const val K_LAST_OK = "lastSuccessAt"
        private const val K_LAST_ERR = "lastError"
        private const val K_LAST_ERR_AT = "lastErrorAt"
        const val DEFAULT_BASE = "https://medical.scalamatic.com"
        private const val MAX_EVENTS = 30
    }
}
