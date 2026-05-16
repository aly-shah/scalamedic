/**
 * @system ScalaMedic — Public booking page
 * @route GET /book
 *
 * Server component shell: pulls tenant brand via getCurrentTenant()
 * (Host header → tenant_hostnames lookup, no auth needed) for the
 * masthead + page title + theme colour. The interactive multi-step
 * wizard lives in <BookingForm /> as a client component.
 *
 * Allowed without a session by the middleware publicPaths list.
 */
import type { Metadata } from "next";
import { getCurrentTenant } from "@/lib/tenant";
import BookingForm from "./booking-form";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant();
  const name = tenant.name ?? "ScalaMedic";
  return {
    title: `Book an appointment — ${name}`,
    description: `Pick a doctor, choose your time, and book online at ${name}.`,
    // Keep search engines out of this surface for the demos.
    // Production tenants can drop this in their own metadata override.
    robots: { index: false, follow: false },
  };
}

export default async function BookingPage() {
  const tenant = await getCurrentTenant();
  return (
    <main className="min-h-screen bg-gradient-to-b from-teal-50 via-emerald-50 to-cyan-50">
      <header className="max-w-2xl mx-auto px-4 sm:px-6 pt-10 pb-6">
        <div className="flex items-center gap-3">
          {tenant.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={tenant.logoUrl} alt={tenant.name ?? "ScalaMedic"} className="h-10 w-auto object-contain" />
          ) : (
            <span className="text-xl font-bold text-stone-900">{tenant.shortName ?? tenant.name ?? "ScalaMedic"}</span>
          )}
          <span className="text-stone-300">·</span>
          <span className="text-sm font-medium text-stone-600">Book online</span>
        </div>
        <h1 className="mt-6 text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
          Book your visit at {tenant.name ?? "ScalaMedic"}
        </h1>
        <p className="mt-2 text-sm sm:text-base text-stone-600 leading-relaxed">
          Pick a doctor, choose a date, and select a time slot. You&apos;ll get a confirmation code right away.
        </p>
      </header>
      <BookingForm
        tenantName={tenant.name ?? "ScalaMedic"}
        currency={tenant.currency ?? "PKR"}
        locale={tenant.locale ?? "en-PK"}
      />
    </main>
  );
}
