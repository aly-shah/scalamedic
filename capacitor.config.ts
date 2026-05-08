import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.scalamatic.medicore.agent",
  appName: "MediCore Agent",
  webDir: "out",
  server: {
    url: "https://medical.scalamatic.com/agent",
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
