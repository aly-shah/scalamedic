import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-2xl gradient-warm flex items-center justify-center mx-auto mb-6 shadow-sm">
          <span className="text-3xl font-bold text-white">404</span>
        </div>
        <h1 className="text-2xl font-bold text-stone-900 mb-2">Page not found</h1>
        <p className="text-sm text-stone-500 mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/dashboard" className="px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors">
            Go to Dashboard
          </Link>
          <Link href="/patients" className="px-5 py-2.5 bg-white text-stone-700 text-sm font-medium rounded-xl border border-stone-200 hover:bg-stone-50 transition-colors">
            View Patients
          </Link>
        </div>
      </div>
    </div>
  );
}
