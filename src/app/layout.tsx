import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { QueryProvider } from "@/lib/query-provider";
import { FeedbackProvider } from "@/lib/feedback-provider";
import { getCurrentTenant } from "@/lib/tenant";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

// Metadata is tenant-aware so each deployment (or per-host tenant on a
// multi-tenant box) sees its own name in the browser tab, the Open
// Graph card, and the iOS home-screen launcher. Resolution order
// inside getCurrentTenant(): session.user.tenant → Host header →
// single-tenant fallback → platform default ("ScalaMedic").
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant();
  const name = tenant.name ?? "ScalaMedic";
  const shortName = tenant.shortName ?? name;
  return {
    title: name,
    description: `${name} — Clinic Management System`,
    manifest: "/manifest.json",
    themeColor: "#0D9488",
    appleWebApp: { capable: true, statusBarStyle: "default", title: shortName },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-full bg-[#FAFAF9] text-stone-900">
        {/* Service worker registration removed — /sw.js is now a kill-switch
            that unregisters itself and clears caches on first load. The v1
            SW was caching HTML cache-first and served stale chunk-hash refs
            on /dashboard after each deploy. Re-introduce a registration
            script only if offline support or push are actually wired up. */}
        <QueryProvider>
          <AuthProvider>
            <FeedbackProvider>{children}</FeedbackProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
