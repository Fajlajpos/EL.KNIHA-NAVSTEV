"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Clock, User, Users, LogOut } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(";").shift();
      return null;
    };
    const role = getCookie("userRole") || sessionStorage.getItem("userRole");
    const name = getCookie("userDisplayName") || sessionStorage.getItem("userDisplayName");
    setUserRole(role || null);
    setDisplayName(name ? decodeURIComponent(name) : null);
  }, [pathname]);

  const handleLogout = () => {
    document.cookie = "userRole=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "userName=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "userDisplayName=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "userEmployeeNumber=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    sessionStorage.removeItem("userRole");
    sessionStorage.removeItem("userName");
    sessionStorage.removeItem("userDisplayName");
    sessionStorage.removeItem("userEmployeeNumber");
    setUserRole(null);
    setDisplayName(null);
    window.location.href = "/login";
  };

  const navItems = [
    { name: "Kniha návštěv", href: "/", icon: Building2 },
    { name: "Kioskový terminál", href: "/kiosk", icon: Clock },
    { name: "Portál zaměstnance", href: "/portal", icon: User },
    { name: "CEO Dashboard", href: "/dashboard", icon: Users },
  ];

  return (
    <nav className="bg-white text-slate-800 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between sticky top-0 z-50 shadow-sm">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="Logo CHECKNI TO"
            className="h-7 w-auto object-contain"
          />
        </Link>
        <span className="text-slate-200 text-xs">|</span>
        <span className="text-[9px] text-slate-450 font-bold uppercase tracking-widest hidden sm:inline">
          Výroba & Docházka
        </span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3">
        <div className="flex gap-1.5 sm:gap-3">
          {navItems
            .filter((item) => {
              if (!userRole) return false;
              if (userRole === "EMPLOYEE") return item.href === "/portal";
              return true; // CEO sees everything
            })
            .map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    isActive
                      ? "bg-indigo-600 text-white shadow shadow-indigo-600/10"
                      : "text-slate-500 hover:text-slate-850 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden md:inline">{item.name}</span>
                </Link>
              );
            })}
        </div>

        {userRole && (
          <div className="flex items-center gap-2 ml-1 sm:ml-2">
            {displayName && (
              <span className="hidden sm:inline text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
                {displayName}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800 transition-all"
              title="Odhlásit se ze systému"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Odhlásit</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
