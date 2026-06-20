"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Menu, Bot, Send, X, Loader2 } from "lucide-react";
import Sidebar from "./Sidebar";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

/**
 * App shell — rozhoduje o rozložení podle cesty:
 *  - /login  → samostatná obrazovka (bez sidebaru)
 *  - ostatní → levý sidebar + hlavní obsah + aurora pozadí
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  // AI Chatbot States
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: "Ahoj! Jsem Váš inteligentní asistent **CHECKNI TO AI** pro naši společnost.\n\nPřipojil jsem se k firemní databázi a jsem připraven Vám pomoci. Můžete se mě zeptat na cokoliv ohledně přítomných osob, směn, nebo docházkových logů.\n\n*Vyzkoušejte rychlé dotazy dole!*" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isChatOpen]);

  useEffect(() => {
    const role = getCookie("userRole") || sessionStorage.getItem("userRole");
    setUserRole(role || null);
  }, [pathname]);

  // Sync sidebar open state to body class for global styling overrides (e.g. hiding chatbot)
  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add("sidebar-open");
    } else {
      document.body.classList.remove("sidebar-open");
    }
    return () => {
      document.body.classList.remove("sidebar-open");
    };
  }, [sidebarOpen]);

  const handleSendChatMessage = async (textToSend?: string) => {
    const messageText = textToSend || chatInput;
    if (!messageText.trim()) return;

    const userMessage = { role: "user" as const, content: messageText };
    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setIsChatLoading(true);
    setChatError(null);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...chatMessages, userMessage] }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Nepodařilo se komunikovat s AI.");
      }

      if (!res.body) {
        throw new Error("Odpověď neobsahuje textový stream.");
      }

      // Vložíme prázdnou zprávu asistenta, do které budeme streamovat
      setChatMessages((prev) => [...prev, { role: "assistant" as const, content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let streamedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const token = decoder.decode(value, { stream: true });
        streamedText += token;

        setChatMessages((prev) => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: streamedText,
            };
          }
          return updated;
        });
      }
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : "Chyba spojení s AI.";
      setChatError(errMsg);
    } finally {
      setIsChatLoading(false);
    }
  };

  const renderMarkdown = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      let content: React.ReactNode = line;

      // Table formatting check
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        const cells = line.split("|").map(c => c.trim()).filter(c => c !== "");
        if (line.includes("---")) return null;
        return (
          <div key={idx} className="flex border-b border-black/[0.08] py-1 font-mono text-[9px] divide-x divide-black/5">
            {cells.map((cell, cIdx) => (
              <span key={cIdx} className="flex-1 px-1 truncate font-bold text-[#1d1d1f]">{cell}</span>
            ))}
          </div>
        );
      }

      // Check bullet list
      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        const rawContent = line.replace(/^[-*]\s+/, "");
        let itemContent: React.ReactNode = rawContent;
        if (rawContent.includes("**")) {
          const parts = rawContent.split("**");
          itemContent = parts.map((part, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="font-bold text-[#1d1d1f]">{part}</strong> : part);
        }
        content = (
          <li key={idx} className="list-disc list-inside ml-1 my-0.5 text-[#1d1d1f]">
            {itemContent}
          </li>
        );
      } else if (typeof content === "string" && content.includes("**")) {
        const parts = content.split("**");
        content = parts.map((part, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="font-bold text-slate-950">{part}</strong> : part);
      }

      return <div key={idx} className="min-h-[1.25em]">{content}</div>;
    });
  };

  const isStandalone = pathname?.startsWith("/login");

  if (isStandalone) {
    return (
      <div className="app-bg min-h-screen relative overflow-x-hidden">
        {/* Floating Ambient Glow Blobs for realistic Liquid Glass refraction */}
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[100vw] h-[100vw] sm:w-[50vw] sm:h-[50vw] rounded-full bg-sky-400/22 sm:bg-sky-400/15 blur-[120px] animate-blob" style={{ animationDuration: "25s" }} />
          <div className="absolute bottom-[-10%] right-[-10%] w-[110vw] h-[110vw] sm:w-[60vw] sm:h-[60vw] rounded-full bg-purple-400/18 sm:bg-purple-400/12 blur-[140px] animate-blob" style={{ animationDuration: "35s", animationDelay: "2s" }} />
          <div className="absolute top-[40%] right-[10%] w-[90vw] h-[90vw] sm:w-[45vw] sm:h-[45vw] rounded-full bg-emerald-400/15 sm:bg-emerald-400/8 blur-[110px] animate-blob" style={{ animationDuration: "20s", animationDelay: "5s" }} />
          <div className="absolute bottom-[20%] left-[20%] w-[100vw] h-[100vw] sm:w-[40vw] sm:h-[40vw] rounded-full bg-pink-400/15 sm:bg-pink-400/10 blur-[100px] animate-blob" style={{ animationDuration: "30s", animationDelay: "1s" }} />
        </div>
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  return (
    <div className="app-bg min-h-screen relative overflow-x-hidden">
      {/* Floating Ambient Glow Blobs for realistic Liquid Glass refraction */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[100vw] h-[100vw] sm:w-[50vw] sm:h-[50vw] rounded-full bg-sky-400/22 sm:bg-sky-400/15 blur-[120px] animate-blob" style={{ animationDuration: "25s" }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[110vw] h-[110vw] sm:w-[60vw] sm:h-[60vw] rounded-full bg-purple-400/18 sm:bg-purple-400/12 blur-[140px] animate-blob" style={{ animationDuration: "35s", animationDelay: "2s" }} />
        <div className="absolute top-[40%] right-[10%] w-[90vw] h-[90vw] sm:w-[45vw] sm:h-[45vw] rounded-full bg-emerald-400/15 sm:bg-emerald-400/8 blur-[110px] animate-blob" style={{ animationDuration: "20s", animationDelay: "5s" }} />
        <div className="absolute bottom-[20%] left-[20%] w-[100vw] h-[100vw] sm:w-[40vw] sm:h-[40vw] rounded-full bg-pink-400/15 sm:bg-pink-400/10 blur-[100px] animate-blob" style={{ animationDuration: "30s", animationDelay: "1s" }} />
      </div>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobilní top-bar */}
      <div
        className="lg:hidden sticky top-0 z-30 flex items-center justify-between h-16 px-4 bg-[#f5f5f7]/60 backdrop-blur-2xl border-b border-black/[0.04] shadow-sm"
        style={{ WebkitBackdropFilter: "blur(40px)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full-dark.png" alt="CHECKNI TO" className="h-7 w-auto object-contain" />
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -mr-2 text-[#6e6e73] hover:text-[#1d1d1f] rounded-lg"
          aria-label="Otevřít menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div className="lg:pl-[var(--sidebar-w)] relative z-10">{children}</div>

      {/* Floating Chatbot Widget for CEO */}
      {userRole === "CEO" && (
        <div className={`fixed z-50 font-sans chatbot-widget ${isChatOpen ? "bottom-4 right-4 left-4 sm:left-auto sm:right-6 sm:bottom-6" : "bottom-4 right-4 sm:bottom-6 sm:right-6"}`}>
          {isChatOpen ? (
            <div className="glass-liquid w-full sm:w-96 h-[450px] sm:h-[500px] rounded-3xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
              {/* Header */}
              <div className="bg-white/50 px-4 py-3.5 border-b border-white/60 text-[#1d1d1f] flex items-center justify-between shadow-sm relative z-10">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-[#0071e3] animate-pulse" />
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#1d1d1f]">CHECKNI TO AI</h4>
                    <span className="text-[9px] text-[#6e6e73] font-semibold block">Online asistent docházky</span>
                  </div>
                </div>
                <button 
                  onClick={() => setIsChatOpen(false)}
                  className="text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.04] p-1 rounded-lg transition-colors"
                  aria-label="Zavřít chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Messages Viewport */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/[0.02]">
                {chatMessages.map((msg, index) => {
                  const isUser = msg.role === "user";
                  return (
                    <div 
                      key={index}
                      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                    >
                      <div 
                        className={`px-3 py-2 rounded-2xl text-[11px] shadow-sm max-w-[85%] leading-relaxed whitespace-pre-wrap ${
                          isUser 
                            ? "chat-bubble-user rounded-tr-none animate-in fade-in duration-200" 
                            : "chat-bubble-assistant rounded-tl-none animate-in fade-in duration-200"
                        }`}
                      >
                        {isUser ? msg.content : renderMarkdown(msg.content)}
                      </div>
                    </div>
                  );
                })}
                
                {isChatLoading && (
                  <div className="flex items-center gap-2 text-[#86868b] chat-bubble-assistant px-3 py-2 rounded-2xl rounded-tl-none max-w-[50%] shadow-sm self-start text-[11px] font-medium animate-pulse">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#6e6e73]" />
                    <span>AI píše...</span>
                  </div>
                )}

                {chatError && (
                  <div className="bg-rose-500/15 border border-rose-500/30 text-rose-700 px-3 py-2 rounded-xl text-[10px] font-bold leading-normal">
                    Chyba: {chatError}
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Quick Prompts Panel */}
              <div className="px-3 py-2 border-t border-white/40 bg-white/20 flex flex-wrap gap-1.5 shrink-0 select-none backdrop-blur-md">
                {[
                  "Kdo je teď v budově?",
                  "Ukaž dnešní směny",
                  "Máme nějaké anomálie?"
                ].map((promptText) => (
                  <button
                    key={promptText}
                    type="button"
                    disabled={isChatLoading}
                    onClick={() => handleSendChatMessage(promptText)}
                    className="bg-white/60 hover:bg-white/80 border border-white/80 text-[#6e6e73] hover:text-[#1d1d1f] font-bold px-2.5 py-1 rounded-full text-[9px] uppercase tracking-wide transition-all active:scale-[0.96] disabled:opacity-50"
                  >
                    {promptText}
                  </button>
                ))}
              </div>

              {/* Input Form */}
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSendChatMessage(); }}
                className="p-3 border-t border-white/40 bg-white/30 flex gap-2 items-center shrink-0 backdrop-blur-md"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={isChatLoading}
                  placeholder="Zeptejte se asistenta..."
                  className="flex-1 px-3 py-2 bg-white/60 border border-white/80 rounded-xl text-[11px] placeholder-[#86868b] focus:outline-none focus:border-[#0071e3] text-[#1d1d1f]"
                />
                <button
                  type="submit"
                  disabled={isChatLoading || !chatInput.trim()}
                  className="bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-40 text-white p-2.5 rounded-xl transition-all active:scale-[0.96] flex items-center justify-center shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          ) : (
            <button
              onClick={() => setIsChatOpen(true)}
              className="glass-liquid text-[#1d1d1f] rounded-full p-4 hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center gap-2 font-bold text-xs uppercase tracking-wider z-50 relative group"
            >
              <Bot className="h-5 w-5 animate-pulse" />
              <span>AI Asistent</span>
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-rose-500 rounded-full border-2 border-white animate-bounce"></span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

