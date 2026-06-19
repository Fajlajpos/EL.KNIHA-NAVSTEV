"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Clock,
  User,
  LayoutDashboard,
  LogOut,
  X,
  ShieldCheck,
} from "lucide-react";

const NAV_ITEMS = [
  { name: "Kniha návštěv", desc: "Recepce & hosté", href: "/", icon: Building2 },
  { name: "Kioskový terminál", desc: "Příchody / odchody", href: "/kiosk", icon: Clock },
  { name: "Portál zaměstnance", desc: "Moje docházka", href: "/portal", icon: User },
  { name: "CEO Dashboard", desc: "Řízení & mzdy", href: "/dashboard", icon: LayoutDashboard },
];

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    const role = getCookie("userRole") || sessionStorage.getItem("userRole");
    const name = getCookie("userDisplayName") || sessionStorage.getItem("userDisplayName");
    setUserRole(role || null);
    setDisplayName(name ? decodeURIComponent(name) : null);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {
      console.error("Chyba při odhlašování na serveru:", e);
    }
    ["userRole", "userName", "userDisplayName", "userEmployeeNumber"].forEach((c) => {
      document.cookie = `${c}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      sessionStorage.removeItem(c);
    });
    window.location.href = "/login";
  };

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!userRole) return false;
    if (userRole === "EMPLOYEE") return item.href === "/portal";
    return true; // CEO vidí vše
  });

  const roleLabel =
    userRole === "CEO" ? "Ředitel" : userRole === "MANAGER" ? "Manažer" : userRole === "EMPLOYEE" ? "Zaměstnanec" : "";

  return (
    <>
      {/* Mobilní overlay */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      <aside
        className={`fixed top-0 left-0 z-50 h-screen w-[var(--sidebar-w)] flex flex-col
        bg-gradient-to-b from-white/70 to-white/45 backdrop-blur-3xl border-r border-white/70
        shadow-[inset_-1px_0_0_rgba(255,255,255,0.45),0_0_20px_rgba(0,0,0,0.01)] transition-transform duration-300
        lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-6 h-20 shrink-0">
          <Link href={userRole === "EMPLOYEE" ? "/portal" : "/"} className="flex items-center gap-2.5 group" onClick={onClose}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src="/logo-mark-dark.png" 
              alt="" 
              className="h-8 w-auto object-contain transition-all duration-300 group-hover:scale-105 group-hover:brightness-110" 
            />
            <span className="text-base font-bold tracking-tight text-[#1d1d1f]">
              Checkni<span className="text-[#86868b]">.to</span>
            </span>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden text-[#86868b] hover:text-[#1d1d1f] p-1 rounded-lg"
            aria-label="Zavřít menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigace */}
        <nav className="relative flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-bold transition-all border relative ${
                  isActive
                    ? "bg-gradient-to-b from-white/95 to-white/80 border-white/90 shadow-[inset_0_1px_1px_rgba(255,255,255,1),0_4px_12px_rgba(0,113,227,0.06)] text-[#0071e3]"
                    : "border-transparent text-[#6e6e73] hover:bg-white/40 hover:text-[#1d1d1f]"
                }`}
              >
                {/* 3D Glass pill sheen dome overlay for active list item */}
                {isActive && (
                  <span className="absolute top-0.5 left-0.5 right-0.5 height-[45%] bg-gradient-to-b from-white/80 to-white/5 rounded-t-xl pointer-events-none" />
                )}
                <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-[#0071e3]" : "text-[#86868b] group-hover:text-[#1d1d1f] transition-colors"}`} />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Profil + odhlášení */}
        {userRole && (
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-b from-white/75 to-white/50 border border-white/80 px-3.5 py-2.5 shadow-sm">
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center text-[#0071e3] font-bold text-sm shrink-0"
                style={{ background: "rgba(0,113,227,0.08)", border: "1px solid rgba(0,113,227,0.15)" }}
              >
                {(displayName || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[12px] font-bold text-[#1d1d1f] truncate">{displayName || "Uživatel"}</span>
                <span className="flex items-center gap-1 text-[9px] font-bold text-[#86868b] uppercase tracking-wide">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#0071e3]" />
                  {roleLabel}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="btn-danger w-full !py-2.5 !text-xs !rounded-2xl flex items-center justify-center gap-2"
            >
              <LogOut className="h-3.5 w-3.5" />
              Odhlásit se
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
