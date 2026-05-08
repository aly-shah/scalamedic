package com.scalamatic.medicore.callcenter

import android.content.Context
import android.telephony.PhoneStateListener
import android.telephony.TelephonyManager
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Fires LIVE call-lifecycle events to MediCore while a call is in progress
 * (before the CallLog row appears):
 *   - INBOUND state=ringing  when the phone starts ringing (number included)
 *   - INBOUND state=answered when the user picks up
 *
 * Outbound dial events (state=ringing, direction=OUTBOUND) are delivered by
 * OutgoingCallReceiver, which is the only path that exposes the dialed
 * number before the call connects. CALL_STATE_IDLE is intentionally not
 * fired here — CallLogObserverService handles the finalized ended/missed
 * event with duration when the CallLog row appears (typically within 1–2s
 * of the call ending).
 *
 * Uses the deprecated PhoneStateListener so we can receive the phone
 * number alongside the state change. The modern TelephonyCallback
 * CallStateListener on API 31+ no longer exposes the number to general
 * apps, so the deprecated API is the least-bad option here; it still
 * functions on every supported Android version.
 */
class PhoneStateMonitor(private val ctx: Context) {

    private val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    private val prefs = Prefs(ctx)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var lastState: Int = TelephonyManager.CALL_STATE_IDLE

    @Suppress("DEPRECATION")
    private val listener = object : PhoneStateListener() {
        override fun onCallStateChanged(state: Int, phoneNumber: String?) {
            when (state) {
                TelephonyManager.CALL_STATE_RINGING ->
                    fire("INBOUND", "ringing", phoneNumber)
                TelephonyManager.CALL_STATE_OFFHOOK -> {
                    if (lastState == TelephonyManager.CALL_STATE_RINGING) {
                        fire("INBOUND", "answered", phoneNumber)
                    }
                }
                TelephonyManager.CALL_STATE_IDLE -> { /* see class doc */ }
            }
            lastState = state
        }
    }

    @Suppress("DEPRECATION")
    fun start() {
        try {
            tm.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
        } catch (e: SecurityException) {
            Log.w(TAG, "READ_PHONE_STATE missing; skipping live call tracking")
        }
    }

    @Suppress("DEPRECATION")
    fun stop() {
        tm.listen(listener, PhoneStateListener.LISTEN_NONE)
    }

    private fun fire(direction: String, state: String, number: String?) {
        if (!prefs.isConfigured()) return
        val phone = number?.trim().orEmpty()
        if (phone.isBlank()) {
            Log.i(TAG, "$direction $state: private/unknown number — skipping live event")
            return
        }
        val name = ContactsLookup.nameForPhone(ctx, phone)
        scope.launch {
            MediCoreClient.send(
                prefs,
                MediCoreClient.Event(
                    channel = "phone",
                    direction = direction,
                    state = state,
                    phone = phone,
                    contactName = name,
                ),
            )
            Log.i(TAG, "$direction $state $phone (${name ?: "not in contacts"})")
        }
    }

    companion object { private const val TAG = "PhoneStateMonitor" }
}
