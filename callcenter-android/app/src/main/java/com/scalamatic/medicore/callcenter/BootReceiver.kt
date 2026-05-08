package com.scalamatic.medicore.callcenter

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restart the call-log observer on boot + after app updates. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            if (Prefs(context).isConfigured()) {
                CallLogObserverService.start(context)
            }
        }
    }
}
