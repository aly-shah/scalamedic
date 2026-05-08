"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => router.push("/dashboard"), 800);
  };

  return (
    <div className="min-h-screen flex" data-id="AUTH-SIGNUP">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-600">
        <div className="absolute inset-0">
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-emerald-400/20 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-center px-12 text-white">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <span className="text-lg font-bold">M</span>
            </div>
            <span className="text-xl font-bold">MediCore</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Start managing<br />your clinic today.
          </h1>
          <p className="text-lg text-white/80 max-w-md leading-relaxed">
            Set up your workspace in minutes. No complex configuration needed.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 lg:px-16 bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="w-10 h-10 gradient-warm rounded-xl flex items-center justify-center shadow-sm">
              <span className="text-lg font-bold text-white">M</span>
            </div>
            <span className="text-xl font-bold text-stone-900">MediCore</span>
          </div>

          <h2 className="text-2xl font-bold text-stone-900 mb-1">Create your account</h2>
          <p className="text-stone-500 mb-8">Get your clinic workspace ready</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-stone-700">Full Name</label>
              <input type="text" placeholder="Dr. Jane Smith" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:bg-white transition-all" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-stone-700">Email</label>
              <input type="email" placeholder="you@clinic.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:bg-white transition-all" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-stone-700">Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} placeholder="8+ characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-3 pr-11 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:bg-white transition-all" required minLength={8} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-all disabled:opacity-50 cursor-pointer shadow-sm shadow-teal-200 active:scale-[0.98]">
              {loading ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Creating...</span> : "Get Started"}
            </button>
          </form>

          <p className="text-center text-sm text-stone-500 mt-8">
            Already have an account?{" "}
            <Link href="/login" className="text-teal-600 font-medium hover:text-teal-700">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
