package com.scalamatic.medicore.callcenter

import android.content.Context
import android.net.Uri
import android.provider.ContactsContract

/**
 * Resolve a WhatsApp display name to a real phone number by looking it up
 * in the device address book.
 *
 * WhatsApp notifications expose the *contact name* as the sender, never the
 * raw E.164 number. MediCore identifies patients by phone, so forwarding an
 * event with only a name risks matching the wrong patient (two "Ali Khan"s,
 * typos, collisions). Instead we resolve the name on-device against the
 * receptionist's contacts, which WhatsApp itself uses to pick display
 * names — so if WhatsApp showed a given name, the number is in contacts.
 *
 * Returns null when the name has zero matches OR more than one distinct
 * contact matches (ambiguity → skip rather than risk a wrong-patient log).
 * Requires the READ_CONTACTS runtime permission (already requested in
 * MainActivity).
 */
object ContactsLookup {

    fun phoneForName(ctx: Context, displayName: String): String? {
        val name = displayName.trim()
        if (name.isBlank()) return null

        val cursor = try {
            ctx.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                arrayOf(
                    ContactsContract.CommonDataKinds.Phone.NUMBER,
                    ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                ),
                "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} = ? COLLATE NOCASE",
                arrayOf(name),
                null,
            )
        } catch (e: SecurityException) {
            return null
        } ?: return null

        return cursor.use { c ->
            val iNum = c.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER)
            val iId = c.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
            // Map CONTACT_ID → first non-empty phone. Multiple numbers under
            // one contact is fine (pick first); multiple *contacts* is not.
            val byContact = linkedMapOf<Long, String>()
            while (c.moveToNext()) {
                val id = c.getLong(iId)
                val num = c.getString(iNum)?.trim().orEmpty()
                if (num.isNotEmpty() && id !in byContact) byContact[id] = num
            }
            if (byContact.size == 1) byContact.values.first() else null
        }
    }

    /**
     * Reverse lookup: given a raw phone number (any format — the system
     * normalizes it), return the matching contact's display name or null.
     * Used by the live-call flow to render "Ali Khan · +923…" when the
     * receptionist has the caller saved.
     */
    fun nameForPhone(ctx: Context, phone: String): String? {
        val trimmed = phone.trim()
        if (trimmed.isBlank()) return null
        val uri = Uri.withAppendedPath(
            ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
            Uri.encode(trimmed),
        )
        val cursor = try {
            ctx.contentResolver.query(
                uri,
                arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME),
                null, null, null,
            )
        } catch (e: SecurityException) {
            return null
        } ?: return null

        return cursor.use { c ->
            if (c.moveToFirst()) c.getString(0)?.trim()?.takeIf { it.isNotBlank() } else null
        }
    }
}
