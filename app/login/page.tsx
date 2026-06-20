"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldAlert, Loader2, ArrowRight, MonitorSmartphone } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center p-6 font-sans relative">
      <div className="w-full max-w-md">
        {/* Brand nad kartou */}
        <div className="text-center mb-6 animate-rise">
          <div className="flex justify-center mb-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-full-dark.png" alt="Logo Checkni.to" className="h-24 w-auto object-contain drop-shadow-md" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1d1d1f]">
            Vítejte zpět
          </h1>
          <p className="text-sm text-[#6e6e73] mt-1">
            Elektronická kniha návštěv &amp; docházkový systém
          </p>
        </div>

        <div className="glass p-8 space-y-6 animate-fade-in">
          {/* Error Notification */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-700 text-xs flex items-center gap-2.5 animate-rise">
              <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
              <span className="font-semibold">{errorMsg}</span>
            </div>
          )}

          {/* Login form */}
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="field-label">Uživatelské jméno</label>
              <input
                type="text"
                placeholder="Např. pbures"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="input"
              />
            </div>

            <div>
              <label className="field-label">Heslo</label>
              <input
                type="password"
                placeholder="Zadejte heslo"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="input"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !username || !password}
              className="btn-primary w-full py-3.5 tracking-widest"
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

          <div className="pt-2">
            <Link
              href="/kiosk"
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-black/[0.08] bg-white/45 px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-[#1d1d1f] transition-all hover:bg-white/70 active:scale-[0.98]"
            >
              <MonitorSmartphone className="h-4 w-4 text-[#0071e3]" />
              Zaměstnanecký kiosek
            </Link>
          </div>
        </div>

        <p className="text-center text-[10px] text-[#86868b] font-semibold uppercase tracking-widest mt-6">
          © 2026 CHECKNI TO • Všechna práva vyhrazena
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black/[0.04] flex flex-col items-center justify-center text-[#6e6e73] font-sans text-xs uppercase tracking-widest gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-[#6e6e73]" />
        <span>Načítání přihlášení...</span>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
