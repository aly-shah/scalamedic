/**
 * @system MediCore ERP — Public thank-you page
 * @route GET /thank-you
 *
 * Anonymous scanners land here (sent by /qr/[token] when no staff
 * session is present). This page intentionally exposes ZERO patient
 * data — no name, phone, treatment, invoice, amount. It's purely
 * marketing: clinic name, brand colour, social CTA. If a patient
 * shares a screenshot publicly, nothing about their visit leaks.
 */
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thank you — Dr. Nakhoda's Skin Institute",
  description: "Thank you for visiting Dr. Nakhoda's Skin Institute.",
  // Keep search engines out of this surface; the URL is one click away
  // from any scanned receipt and there's nothing to index here.
  robots: { index: false, follow: false },
};

export default function ThankYouPage() {
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
          <span className="font-semibold text-stone-700">Dr. Nakhoda&apos;s Skin Institute.</span>
        </p>

        <div className="mt-6 pt-5 border-t border-stone-100">
          <p className="text-xs uppercase tracking-wider text-stone-400 font-semibold">Stay connected</p>
          <Link
            href="https://www.instagram.com/drnakhodaskininstitute/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-500 via-pink-500 to-orange-400 text-white text-sm font-semibold shadow hover:shadow-md transition-shadow"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.43.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23a3.71 3.71 0 0 1-.9 1.38 3.71 3.71 0 0 1-1.38.9c-.43.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.71 3.71 0 0 1-1.38-.9 3.71 3.71 0 0 1-.9-1.38c-.16-.43-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.43-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 1.94c-3.14 0-3.51.01-4.75.07-1 .04-1.55.21-1.91.35-.48.19-.83.42-1.19.78-.36.36-.59.71-.78 1.19-.14.36-.31.91-.35 1.91-.06 1.24-.07 1.61-.07 4.75s.01 3.51.07 4.75c.04 1 .21 1.55.35 1.91.19.48.42.83.78 1.19.36.36.71.59 1.19.78.36.14.91.31 1.91.35 1.24.06 1.61.07 4.75.07s3.51-.01 4.75-.07c1-.04 1.55-.21 1.91-.35.48-.19.83-.42 1.19-.78.36-.36.59-.71.78-1.19.14-.36.31-.91.35-1.91.06-1.24.07-1.61.07-4.75s-.01-3.51-.07-4.75c-.04-1-.21-1.55-.35-1.91a3.21 3.21 0 0 0-.78-1.19 3.21 3.21 0 0 0-1.19-.78c-.36-.14-.91-.31-1.91-.35-1.24-.06-1.61-.07-4.75-.07Zm0 3.3a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2Zm0 1.94a2.66 2.66 0 1 0 0 5.32 2.66 2.66 0 0 0 0-5.32Zm5.85-2.25a1.08 1.08 0 1 1-2.16 0 1.08 1.08 0 0 1 2.16 0Z" />
            </svg>
            @drnakhodaskininstitute
          </Link>
        </div>

        <p className="mt-6 text-[10px] uppercase tracking-wider text-stone-300">
          Skincare, Aesthetic & Wellness
        </p>
      </div>
    </main>
  );
}
