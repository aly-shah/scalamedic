package com.scalamatic.medicore.callcenter

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Listens to system notifications and forwards WhatsApp message + voice/video
 * call notifications to MediCore as `channel=whatsapp` events. Requires the
 * user to grant "Notification Access" in system settings.
 *
 * Distinguishes two kinds of notifications:
 *   - Messages — tagged with state=null, messageText=actual text
 *   - Voice/video calls — tagged with state="ringing", messageText="[Voice call]"
 *     or "[Video call]". The dashboard renders these with a 📞 icon and
 *     "Voice call"/"Video call" label instead of the message preview.
 *
 * Detection: notification.category == CATEGORY_CALL is the most reliable
 * signal WhatsApp uses for ringing calls. As a fallback we also key off
 * the action labels (Answer/Decline) and the title/body text containing
 * "voice call", "video call", "calling", or "incoming call".
 *
 * Caveats:
 *   - Can only see *incoming* messages and ringing calls — outgoing
 *     activity from inside WhatsApp doesn't surface as a listener-visible
 *     notification.
 *   - WhatsApp notifications carry only the contact's display name, not
 *     the phone number. We resolve name→number via ContactsLookup. If the
 *     sender isn't a saved contact on this device (or the name matches
 *     multiple contacts) we skip the event entirely.
 *   - WhatsApp Business is a separate package (com.whatsapp.w4b) — handled.
 */
class WhatsAppListener : NotificationListenerService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName
        if (pkg != "com.whatsapp" && pkg != "com.whatsapp.w4b") return

        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: return
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
        val message = bigText ?: text ?: ""

        // Skip the group-summary notification — always non-actionable
        if (sbn.isGroup && (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return

        // Skip WhatsApp's own transient "X new messages" / "checking" titles
        if (title.contains("new message", ignoreCase = true)) return

        val callKind = detectCall(sbn.notification, title, message)
        if (callKind == null && message.isBlank()) return // nothing to forward

        // For call notifications, the title is usually the caller's name
        // ("Ali Khan") and text is "Incoming voice call". For messages,
        // group chats put "Sender: msg" in the body so we still parse.
        val parsed = if (callKind != null) Parsed(title.trim(), "")
                     else parseSenderAndBody(title, message)

        val phone = ContactsLookup.phoneForName(this, parsed.senderName)
        if (phone == null) {
            Log.i(TAG, "skip '${parsed.senderName}' (${callKind ?: "msg"}): not a saved contact")
            return
        }

        val prefs = Prefs(this)
        if (!prefs.isConfigured()) return

        scope.launch {
            MediCoreClient.send(
                prefs,
                MediCoreClient.Event(
                    channel = "whatsapp",
                    direction = "INBOUND",
                    phone = phone,
                    contactName = parsed.senderName,
                    state = callKind?.let { "ringing" },
                    messageText = when (callKind) {
                        CallKind.VOICE -> "[Voice call]"
                        CallKind.VIDEO -> "[Video call]"
                        null -> parsed.body
                    },
                )
            )
            Log.i(TAG, "→ ${parsed.senderName} <$phone> ${callKind?.name ?: "MSG"}: ${parsed.body.take(60)}")
        }
    }

    private enum class CallKind { VOICE, VIDEO }

    private fun detectCall(notif: Notification, title: String, body: String): CallKind? {
        // Most reliable: WhatsApp tags ringing calls with category=call.
        if (notif.category == Notification.CATEGORY_CALL) {
            return if (looksVideo(title, body)) CallKind.VIDEO else CallKind.VOICE
        }
        // Fallback heuristics for OEM/version variants where category is
        // missing. WhatsApp call notifications consistently carry "voice
        // call" / "video call" / "incoming call" / "calling…" copy.
        val combined = "$title $body".lowercase()
        if (combined.contains("video call")) return CallKind.VIDEO
        if (combined.contains("voice call")) return CallKind.VOICE
        if (combined.contains("incoming call")) return CallKind.VOICE
        if (combined.contains("calling")) return CallKind.VOICE

        // Action-label fallback: ringing notifications expose Answer / Decline.
        val actions = notif.actions
        if (actions != null) {
            for (a in actions) {
                val t = a.title?.toString()?.lowercase() ?: continue
                if (t == "answer" || t == "decline") return CallKind.VOICE
            }
        }
        return null
    }

    private fun looksVideo(title: String, body: String): Boolean {
        val combined = "$title $body".lowercase()
        return combined.contains("video")
    }

    private data class Parsed(val senderName: String, val body: String)

    private fun parseSenderAndBody(title: String, text: String): Parsed {
        // Group chat form: title = "Group Name", text = "Sender: actual message"
        // We need the *inner* sender name so the contacts lookup resolves to
        // the right person, not the group.
        val colon = text.indexOf(':')
        if (colon in 1..40) {
            val maybeSender = text.substring(0, colon).trim()
            val maybeBody = text.substring(colon + 1).trim()
            if (!maybeSender.contains('/') && !maybeSender.contains('?')) {
                return Parsed(maybeSender, maybeBody)
            }
        }
        return Parsed(title.trim(), text.trim())
    }

    companion object { private const val TAG = "WhatsAppListener" }
}
