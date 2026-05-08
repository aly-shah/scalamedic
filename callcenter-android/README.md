# MediCore Call Center Companion (Android)

A silent forwarder app that watches an Android device's **call log** and
**WhatsApp notifications** and pushes every event to
`https://medical.scalamatic.com/api/calls/incoming` so the agent's activity
appears in the MediCore call-center dashboard in real time.

## Architecture

```
 ┌─────────────────────────┐
 │ Receptionist's Android  │
 │                         │
 │  ┌──────────────────┐   │
 │  │ CallLogObserver  │ ←─┼── ContentObserver on CallLog.Calls
 │  │ (foreground svc) │   │
 │  └────────┬─────────┘   │
 │           │             │
 │  ┌────────┴─────────┐   │
 │  │ WhatsAppListener │ ←─┼── NotificationListenerService
 │  │ (system service) │   │       filters com.whatsapp[.w4b]
 │  └────────┬─────────┘   │
 │           │             │       HTTPS POST
 │           └─────────────┼────────────────────────┐
 └─────────────────────────┘                        │
                                                    ▼
                        ┌───────────────────────────────────────────┐
                        │ MediCore /api/calls/incoming              │
                        │   channel=phone    → CallLog row          │
                        │   channel=whatsapp → CommunicationLog row │
                        │                      (if patient matched) │
                        └───────────────────────────────────────────┘
```

## Build

Pre-reqs: Android SDK + JDK 17. No Android Studio needed — `gradlew` is fine.

```bash
cd callcenter-android
./gradlew :app:assembleRelease     # outputs app/build/outputs/apk/release/app-release.apk
```

The default `build.gradle.kts` uses the **debug keystore** to sign release
builds so `./gradlew assembleRelease` produces an installable APK without
extra setup. Replace `signingConfig = signingConfigs.getByName("debug")` with
a real config before wide distribution.

## Install + setup on a receptionist's phone

1. **Sideload the APK** (transfer the file and open it; enable "Install
   unknown apps" for the file manager when prompted).
2. Open **MediCore CC** and fill in:
   - **MediCore base URL** — `https://medical.scalamatic.com` (pre-filled)
   - **Agent email** — the receptionist's MediCore login email (this is how
     the server knows which agent a call/message is for)
   - **Service token** — the `DIALER_SERVICE_TOKEN` value. Get it from the
     clinic admin; it's the same token the dialer-server uses. Tap **Save**.
3. Tap **Grant call log / phone / contacts** — approve all three runtime
   permissions when prompted.
4. Tap **Open notification access settings**. In the system dialog, enable
   "MediCore CC" (this is the one permission that can't be requested from
   inside the app — Android requires the user to toggle it manually).
5. Tap **Start sync**. A persistent "MediCore Call Sync" notification
   appears in the shade — that's the foreground-service marker. It's
   low-priority and silent.

## What gets pushed

### Phone calls (channel=phone)

| Android `CallLog.TYPE` | Duration | → `direction` | `state`  |
| ---------------------- | -------- | ------------- | -------- |
| INCOMING               | > 0      | INBOUND       | ended    |
| INCOMING               | 0        | INBOUND       | missed   |
| OUTGOING               | > 0      | OUTBOUND      | ended    |
| OUTGOING               | 0        | OUTBOUND      | missed   |
| MISSED                 | —        | INBOUND       | missed   |
| REJECTED               | —        | INBOUND       | missed   |
| VOICEMAIL / BLOCKED    | —        | (skipped)     |          |

Payload sent per call:

```json
{
  "channel": "phone",
  "direction": "INBOUND",
  "phone": "+923001234567",
  "state": "ended",
  "duration": 73,
  "contactName": "Ali Khan",
  "agentEmail": "receptionist@clinic.com"
}
```

### WhatsApp (channel=whatsapp)

Every WhatsApp message notification (from `com.whatsapp` or `com.whatsapp.w4b`)
has its sender display-name resolved to a **real phone number** via the
device's contacts (`ContactsContract`). Events are only forwarded when:

1. The sender name matches exactly one saved contact on the receptionist's
   phone, AND
2. That contact has a phone number.

If zero or multiple contacts match the name, the notification is skipped —
MediCore identifies patients by phone, and a guessed name-match would risk
logging the message against the wrong patient. **Practical implication:**
save patients as contacts on the receptionist's phone for their WhatsApp
messages to land in MediCore. Group summaries and transient "X new
messages" notifications are always filtered out.

```json
{
  "channel": "whatsapp",
  "direction": "INBOUND",
  "phone": "+923001234567",
  "contactName": "Ali Khan",
  "messageText": "Hi, I would like to book a follow-up",
  "agentEmail": "receptionist@clinic.com"
}
```

Server writes a `CommunicationLog` row when the phone matches a known
patient; otherwise it records a live-preview event without persisting.

## Caveats

- **Outgoing WhatsApp messages don't generate a notification on the sender's
  device**, so the listener can only see inbound WhatsApp. For true outbound
  parity, wire up the Meta WhatsApp Business API webhook on the server
  (future work).
- Some Chinese OEM builds (MIUI/HyperOS, ColorOS, HarmonyOS) aggressively
  kill background services. Add the app to the phone's "Protected apps"
  or "Auto-start" list to keep sync running overnight.
- `READ_CALL_LOG` is considered a "restricted permission" on Google Play
  — distribution via the Play Store requires a use-case declaration. For
  clinic-internal sideloaded distribution this is fine.
