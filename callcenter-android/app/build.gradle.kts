plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.scalamatic.medicore.callcenter"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.scalamatic.medicore.callcenter"
        minSdk = 26           // Android 8.0 — covers 95%+ of active devices
        targetSdk = 34
        versionCode = 3
        versionName = "1.1.1"
        // Service token for /api/calls/incoming. Pinned at build time for
        // sideloaded clinic-internal use — no plaintext exposure to the
        // user, no need for a separate token-config UI. Override at build
        // time via -PserviceToken=... on the gradle command line if you
        // ever rotate it.
        val serviceToken = (project.findProperty("serviceToken") as String?)
            ?: "661be671feb58ab117ce7f3faabb2fc2a8574dec8c58cd445750c27880c04fe7"
        buildConfigField("String", "SERVICE_TOKEN", "\"$serviceToken\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Use a debug-style signing for MVP; swap for your signing config before distribution
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        viewBinding = true
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
