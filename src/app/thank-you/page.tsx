/**
 * @system MediCore ERP — Public thank-you page
 * @route GET /thank-you
 *
 * Anonymous scanners land here (sent by /qr/[token] when no staff
 * session is present). This page intentionally exposes ZERO patient
 * data — no name, phone, treatment, invoice, amount. It's purely
 * marketing: clinic name + brand colour. If a patient shares a
 * screenshot publicly, nothing about their visit leaks.
 *
 * Clinic name comes from the tenant resolution (Host header →
 * tenant_hostnames → tenant.name) so each deployment / per-host
 * tenant sees its own brand. Falls back to platform default
 * ("ScalaMedic") if resolution fails.
 */
import type { Metadata } from "next";
import { getCurrentTenant } from "@/lib/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant();
  const name = tenant.name ?? "ScalaMedic";
  return {
    title: `Thank you — ${name}`,
    description: `Thank you for visiting ${name}.`,
    // Keep search engines out of this surface; the URL is one click
    // away from any scanned receipt and there's nothing to index here.
    robots: { index: false, follow: false },
  };
}

export default async function ThankYouPage() {
  const tenant = await getCurrentTenant();
  const clinicName = tenant.name ?? "ScalaMedic";
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-b from-teal-50 via-emerald-50 to-cyan-50">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-stone-100 p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-teal-500 via-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-8 h-8">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h1 className="mt-5 text-xl font-bold text-stone-900">Thank you for your payment</h1>
        <p className="mt-2 text-sm text-stone-500 leading-relaxed">
          We appreciate you choosing
          <br />
          <span className="font-semibold text-stone-700">{clinicName}.</span>
        </p>

        <p className="mt-6 text-[10px] uppercase tracking-wider text-stone-300">
          Skincare, Aesthetic & Wellness
        </p>
      </div>
    </main>
  );
}
