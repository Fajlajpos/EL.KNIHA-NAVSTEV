"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldAlert, UserCheck, Loader2, ArrowRight } from "lucide-react";

function LoginContent() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        document.cookie = `userRole=${data.role}; path=/; max-age=86400; SameSite=Lax`;
        document.cookie = `userName=${data.username}; path=/; max-age=86400; SameSite=Lax`;
        document.cookie = `userDisplayName=${encodeURIComponent(data.displayName)}; path=/; max-age=86400; SameSite=Lax`;
        document.cookie = `userEmployeeNumber=${data.employeeNumber}; path=/; max-age=86400; SameSite=Lax`;

        sessionStorage.setItem("userRole", data.role);
        sessionStorage.setItem("userName", data.username);
        sessionStorage.setItem("userDisplayName", data.displayName);
        sessionStorage.setItem("userEmployeeNumber", data.employeeNumber);

        const target = data.role === "CEO" ? (redirectTo || "/dashboard") : "/portal";
        window.location.href = target;
      } else {
        setErrorMsg(data.error || "Přihlášení se nezdařilo.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Chyba při komunikaci se serverem.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans relative">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6">

        {/* Brand Logo Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img
              src="/logo.png"
              alt="Logo CHECKNI TO"
              className="h-10 w-auto object-contain"
            />
          </div>
          <div className="space-y-1">
            <h2 className="text-xs font-black tracking-widest text-slate-900 uppercase">Elektronický Docházkový Systém</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Elektronická Kniha & Docházka</p>
          </div>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-250 text-rose-800 text-xs flex items-center gap-2.5">
            <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Uživatelské jméno
            </label>
            <input
              type="text"
              placeholder="Např. pbures"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-650 text-slate-800"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Heslo
            </label>
            <input
              type="password"
              placeholder="Zadejte heslo"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-650 text-slate-800"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !username || !password}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 px-4 rounded-xl text-xs font-bold uppercase tracking-widest shadow-md transition-all mt-2 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Ověřuji...
              </>
            ) : (
              <>
                Přihlásit se
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Credentials Hints */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-[10px] text-slate-500 leading-normal space-y-2">
          <div className="font-bold uppercase tracking-widest text-indigo-600 mb-1.5 flex items-center gap-1">
            <UserCheck className="h-3.5 w-3.5" />
            Testovací přihlašovací údaje
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="font-semibold text-slate-600">CEO (Ředitel):</div>
            <div><strong className="font-mono text-slate-800">pbures</strong> / <strong className="font-mono text-slate-800">ceo123</strong></div>
            <div className="font-semibold text-slate-600">Zaměstnanec:</div>
            <div><strong className="font-mono text-slate-800">jnovak</strong> / <strong className="font-mono text-slate-800">novak123</strong></div>
            <div className="font-semibold text-slate-600">Zaměstnanec:</div>
            <div><strong className="font-mono text-slate-800">lkralova</strong> / <strong className="font-mono text-slate-800">kralova123</strong></div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500 font-sans text-xs uppercase tracking-widest gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        <span>Načítání přihlášení...</span>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
