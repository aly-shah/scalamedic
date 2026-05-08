package com.scalamatic.medicore.callcenter

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import com.scalamatic.medicore.callcenter.databinding.ActivityLoginBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Entry point for the receptionist app. Verifies the user's MediCore
 * credentials against /api/auth/login and, on success, hands off to
 * MainActivity. The service token used for /api/calls/incoming POSTs is
 * pinned at build time (BuildConfig.SERVICE_TOKEN) so the user never
 * sees or types it — login is the only thing that gates app access.
 *
 * If the user is already logged in (Prefs.isLoggedIn()), we skip this
 * screen and go straight to Main. Sign-out clears that flag.
 */
class LoginActivity : AppCompatActivity() {

    private lateinit var b: ActivityLoginBinding
    private lateinit var prefs: Prefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)

        if (prefs.isLoggedIn()) {
            goMain()
            return
        }

        b = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(b.root)

        b.signIn.setOnClickListener { attempt() }
        b.password.setOnEditorActionListener { _, _, _ -> attempt(); true }
    }

    private fun attempt() {
        val email = b.email.text?.toString()?.trim()?.lowercase().orEmpty()
        val password = b.password.text?.toString().orEmpty()
        if (email.isBlank() || password.isBlank()) {
            showError("Enter your email and password.")
            return
        }
        b.error.visibility = View.GONE
        b.signIn.isEnabled = false
        b.signIn.text = getString(R.string.login_signing_in)

        CoroutineScope(Dispatchers.IO).launch {
            val result = MediCoreClient.login(prefs.baseUrl, email, password)
            withContext(Dispatchers.Main) {
                b.signIn.isEnabled = true
                b.signIn.text = getString(R.string.login_submit)
                if (result.isSuccess) {
                    val u = result.getOrThrow()
                    prefs.agentEmail = u.email
                    prefs.agentId = u.id
                    prefs.agentName = u.name
                    prefs.agentRole = u.role
                    prefs.serviceToken = BuildConfig.SERVICE_TOKEN
                    prefs.loggedInAt = System.currentTimeMillis()
                    goMain()
                } else {
                    showError(result.exceptionOrNull()?.message ?: "Sign-in failed.")
                }
            }
        }
    }

    private fun showError(msg: String) {
        b.error.text = msg
        b.error.visibility = View.VISIBLE
    }

    private fun goMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
