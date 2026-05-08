package com.scalamatic.medicore.callcenter

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Fires a LIVE state=ringing, direction=OUTBOUND event the moment the
 * receptionist dials out. Listens for ACTION_NEW_OUTGOING_CALL, which is
 * the only system-provided broadcast that carries the dialed number
 * before the call connects.
 *
 * PROCESS_OUTGOING_CALLS is deprecated but still the permission the
 * broadcast is gated on across current Android versions; declared in the
 * manifest and requested at runtime by MainActivity.
 *
 * Registered dynamically from CallLogObserverService (not in the manifest)
 * so it's only active while the sync service is running — closes cleanly
 * on service shutdown.
 */
class OutgoingCallReceiver : BroadcastReceiver() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_NEW_OUTGOING_CALL) return
        val number = intent.getStringExtra(Intent.EXTRA_PHONE_NUMBER)?.trim()
        if (number.isNullOrBlank()) return

        val prefs = Prefs(context)
        if (!prefs.isConfigured()) return

        val name = ContactsLookup.nameForPhone(context, number)
        scope.launch {
            MediCoreClient.send(
                prefs,
                MediCoreClient.Event(
                    channel = "phone",
                    direction = "OUTBOUND",
                    state = "ringing",
                    phone = number,
                    contactName = name,
                ),
            )
            Log.i(TAG, "OUTBOUND dial $number (${name ?: "not in contacts"})")
        }
    }

    companion object { private const val TAG = "OutgoingCallReceiver" }
}
