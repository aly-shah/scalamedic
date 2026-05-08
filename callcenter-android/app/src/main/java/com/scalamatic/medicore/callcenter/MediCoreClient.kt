package com.scalamatic.medicore.callcenter

import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * HTTP client for the MediCore /api/calls/incoming endpoint. Single
 * send() method — the route accepts multiple shapes keyed by `channel`:
 *   channel=phone    → call lifecycle event (state + optional duration)
 *   channel=whatsapp → messaging event (messageText + optional contactName)
 */
object MediCoreClient {
    private const val TAG = "MediCoreClient"
    private val JSON = "application/json; charset=utf-8".toMediaType()
    private val http: OkHttpClient = OkHttpClient.Builder()
        .callTimeout(15, TimeUnit.SECONDS)
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    /** Field separator for the recent-events ring buffer Prefs writes. We
     *  use TAB because phone numbers, contact names, and message text never
     *  legitimately contain it; sanitised on the way in just in case. */
    const val EVENT_FIELD_SEP = "\t"

    data class Event(
        val channel: String,                 // "phone" | "whatsapp"
        val direction: String,               // "INBOUND" | "OUTBOUND"
        val phone: String,                   // +92300…
        val state: String? = null,           // "ringing" | "answered" | "ended" | "missed"
        val duration: Int? = null,           // seconds (phone, for ended)
        val messageText: String? = null,     // whatsapp
        val contactName: String? = null,     // display name from device/contacts
    )

    fun send(prefs: Prefs, event: Event): Result<String> {
        if (!prefs.isConfigured()) return Result.failure(IllegalStateException("Not configured"))
        val json = JSONObject().apply {
            put("channel", event.channel)
            put("direction", event.direction)
            put("phone", event.phone)
            put("agentEmail", prefs.agentEmail)
            event.state?.let       { put("state", it) }
            event.duration?.let    { put("duration", it) }
            event.messageText?.let { put("messageText", it) }
            event.contactName?.let { put("contactName", it) }
        }.toString()

        val req = Request.Builder()
            .url("${prefs.baseUrl}/api/calls/incoming")
            .header("X-Service-Token", prefs.serviceToken)
            .post(json.toRequestBody(JSON))
            .build()

        return try {
            http.newCall(req).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                if (resp.isSuccessful) {
                    Log.i(TAG, "${event.channel} ${event.direction} ${event.phone} → ${resp.code}")
                    prefs.lastSuccessAt = System.currentTimeMillis()
                    prefs.lastError = null
                    prefs.recordEvent(formatEventLine(event))
                    Result.success(body)
                } else {
                    Log.w(TAG, "POST failed ${resp.code}: ${body.take(200)}")
                    prefs.lastError = "HTTP ${resp.code}${humanise(resp.code)}"
                    prefs.lastErrorAt = System.currentTimeMillis()
                    Result.failure(RuntimeException("HTTP ${resp.code}"))
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "POST error: ${e.message}")
            prefs.lastError = "Network: ${e.message ?: e.javaClass.simpleName}"
            prefs.lastErrorAt = System.currentTimeMillis()
            Result.failure(e)
        }
    }

    private fun humanise(code: Int): String = when (code) {
        401 -> " (token rejected)"
        400 -> " (bad request — agent email or phone missing)"
        403 -> " (forbidden)"
        404 -> " (server route missing)"
        in 500..599 -> " (server error)"
        else -> ""
    }

    private fun formatEventLine(e: Event): String {
        fun s(v: String?) = (v ?: "").replace("\t", " ").replace("\n", " ")
        return listOf(
            System.currentTimeMillis().toString(),
            e.channel,
            e.direction,
            s(e.state),
            s(e.phone),
            s(e.contactName),
            s(e.messageText).take(140),
        ).joinToString(EVENT_FIELD_SEP)
    }

    /**
     * Verify a user's MediCore email + password by calling /api/auth/login.
     * Used by the LoginActivity gate. Doesn't keep the session — we just
     * need to confirm the credentials are valid before letting the user
     * into the activity-feed screen, then API calls are auth'd via
     * X-Service-Token. Returns the user's role+name on success so the UI
     * can greet them.
     */
    data class LoggedInUser(val id: String, val name: String, val role: String, val email: String)

    fun login(baseUrl: String, email: String, password: String): Result<LoggedInUser> {
        val json = JSONObject().apply {
            put("email", email)
            put("password", password)
        }.toString()
        val req = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/api/auth/login")
            .post(json.toRequestBody(JSON))
            .build()
        return try {
            http.newCall(req).execute().use { resp ->
                val body = resp.body?.string().orEmpty()
                if (resp.isSuccessful) {
                    val data = JSONObject(body).optJSONObject("data")
                    val user = data?.optJSONObject("user")
                    Result.success(
                        LoggedInUser(
                            id = user?.optString("id") ?: "",
                            name = user?.optString("name") ?: "",
                            role = user?.optString("role") ?: "",
                            email = user?.optString("email") ?: email,
                        )
                    )
                } else {
                    val msg = try { JSONObject(body).optString("error", "HTTP ${resp.code}") }
                              catch (_: Exception) { "HTTP ${resp.code}" }
                    Result.failure(RuntimeException(msg))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
