import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.scalamatic.medicore.doctor",
  appName: "MediCore Doctor",
  webDir: "out",
  server: {
    url: "https://medical.scalamatic.com/doctor-app",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: "#ffffff",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#0d9488",
      showSpinner: false,
    },
  },
};

export default config;
