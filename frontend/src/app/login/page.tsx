"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "../../lib/api";
import { Loader2 } from "lucide-react";

// Highlighter glyph — the app's identity mark (marking what matters)
function HighlighterMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 19.5 L4 17 L13 8 L16 11 L7 20 L4.5 20 Z" fill="currentColor" opacity="0.9" />
      <path d="M13 8 L16.5 4.5 A2 2 0 0 1 19.5 4.5 L19.5 4.5 A2 2 0 0 1 19.5 7.5 L16 11 Z" fill="currentColor" />
      <line x1="3.5" y1="21.5" x2="9.5" y2="21.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Already signed in? Straight to the dashboard (after mount, so the router
  // is initialized and there's no SSR/client mismatch).
  useEffect(() => {
    if (getToken()) router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        await api.signup(name, email, password);
      } else {
        await api.login(email, password);
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  };

  const inputClass =
    "w-full px-4 py-3 rounded-lg bg-[#141312] border border-[#34302B] text-white placeholder-[#6E685C] focus:outline-none focus:border-[#A7C4A0]/60 transition-colors";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#141312] px-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-xl bg-[#A7C4A0]/10 border border-[#A7C4A0]/30 flex items-center justify-center">
            <HighlighterMark className="w-5 h-5 text-[#A7C4A0]" />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-[#ECE6DA] leading-tight">Finals Buddy</h1>
            <p className="text-xs text-[#A29A8B]">your study desk for exam season</p>
          </div>
        </div>

        <div className="bg-[#1D1B19] border border-[#34302B] rounded-2xl p-8 shadow-2xl">
          {/* Mode toggle */}
          <div className="flex bg-[#141312] rounded-lg p-1 mb-6">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 py-2 rounded-md text-sm font-bold transition-colors ${
                  mode === m ? "bg-[#A7C4A0] text-[#141312]" : "text-[#A29A8B] hover:text-white"
                }`}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-medium text-[#A29A8B] mb-1.5">Name</label>
                <input
                  className={inputClass}
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={80}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#A29A8B] mb-1.5">Email</label>
              <input
                className={inputClass}
                type="email"
                placeholder="you@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#A29A8B] mb-1.5">Password</label>
              <input
                className={inputClass}
                type="password"
                placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "signup" ? 8 : undefined}
              />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-[#A7C4A0] text-[#141312] font-bold hover:bg-[#A7C4A0]/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          {mode === "signup" && (
            <p className="mt-4 text-xs text-[#6E685C] text-center leading-relaxed">
              Your desk starts empty. Add your first subject and Finals Buddy takes it from there.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
