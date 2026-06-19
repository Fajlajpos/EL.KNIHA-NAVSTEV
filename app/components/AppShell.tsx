"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";

/**
 * App shell — rozhoduje o rozložení podle cesty:
 *  - /login  → samostatná obrazovka (bez sidebaru)
 *  - /kiosk  → fullscreen nástěnný terminál (bez sidebaru)
 *  - ostatní → levý sidebar + hlavní obsah + aurora pozadí
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isStandalone = pathname?.startsWith("/login") || pathname?.startsWith("/kiosk");

  if (isStandalone) {
    return (
      <div className="app-bg min-h-screen relative overflow-x-hidden">
        {/* Floating Ambient Glow Blobs for realistic Liquid Glass refraction */}
        <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-sky-400/15 blur-[120px] animate-blob" style={{ animationDuration: "25s" }} />
          <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-purple-400/12 blur-[140px] animate-blob" style={{ animationDuration: "35s", animationDelay: "2s" }} />
          <div className="absolute top-[40%] right-[10%] w-[45vw] h-[45vw] rounded-full bg-emerald-400/8 blur-[110px] animate-blob" style={{ animationDuration: "20s", animationDelay: "5s" }} />
          <div className="absolute bottom-[20%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-pink-400/10 blur-[100px] animate-blob" style={{ animationDuration: "30s", animationDelay: "1s" }} />
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="app-bg min-h-screen relative overflow-x-hidden">
      {/* Floating Ambient Glow Blobs for realistic Liquid Glass refraction */}
      <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-sky-400/15 blur-[120px] animate-blob" style={{ animationDuration: "25s" }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-purple-400/12 blur-[140px] animate-blob" style={{ animationDuration: "35s", animationDelay: "2s" }} />
        <div className="absolute top-[40%] right-[10%] w-[45vw] h-[45vw] rounded-full bg-emerald-400/8 blur-[110px] animate-blob" style={{ animationDuration: "20s", animationDelay: "5s" }} />
        <div className="absolute bottom-[20%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-pink-400/10 blur-[100px] animate-blob" style={{ animationDuration: "30s", animationDelay: "1s" }} />
      </div>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobilní top-bar */}
      <div
        className="lg:hidden sticky top-0 z-30 flex items-center gap-3 h-16 px-4 bg-[#f5f5f7]/60 backdrop-blur-2xl border-b border-black/[0.04] shadow-sm"
      >
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 text-[#6e6e73] hover:text-[#1d1d1f] rounded-lg"
          aria-label="Otevřít menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full-dark.png" alt="CHECKNI TO" className="h-7 w-auto object-contain" />
      </div>

      <div className="lg:pl-[var(--sidebar-w)]">{children}</div>
    </div>
  );
}
