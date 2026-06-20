"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { 
  ArrowLeft, 
  Camera, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Building2, 
  Car, 
  Check, 
  Sparkles, 
  Keyboard,
  Search,
  LogOut,
  Clock,
  User,
  RefreshCw,
  FileText
} from "lucide-react";
import { createWorker } from "tesseract.js";

interface Visit {
  id: number;
  jmeno: string;
  prijmeni: string;
  organizace: string | null;
  spz: string | null;
  cas_prichodu: string;
  cas_odchodu: string | null;
  status: "V budově" | "Odešel";
}

// Helper methods for offline Tesseract parsing
const toTitleCase = (str: string) => {
  return str
    .toLowerCase()
    .split(" ")
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const sanitizeName = (str: string) => {
  return str
    .replace(/[^A-Za-zÁ-Žá-ž\s\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const parseMRZ = (rawText: string) => {
  const lines = rawText.split("\n");
  for (const line of lines) {
    const cleaned = line.replace(/\s+/g, "").toUpperCase();
    if (cleaned.includes("<<") && /^[A-Z0-9<]{28,32}$/.test(cleaned)) {
      const parts = cleaned.split("<<");
      if (parts.length >= 2) {
        const rawPrijmeni = parts[0];
        const rawJmeno = parts[1];
        const cleanPrijmeni = rawPrijmeni.replace(/</g, " ").trim();
        const cleanJmeno = rawJmeno.replace(/</g, " ").trim();
        return {
          prijmeni: sanitizeName(toTitleCase(cleanPrijmeni)),
          jmeno: sanitizeName(toTitleCase(cleanJmeno))
        };
      }
    }
  }
  return null;
};

const parseFallback = (rawText: string) => {
  const lines = rawText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  let jmeno = "";
  let prijmeni = "";

  const surnameKeywords = ["příjmení", "surname", "prijmeni"];
  const givenNameKeywords = ["jméno", "given name", "jmeno", "given names"];

  const surnameLabelRegex = /(?:příjmení\s*[\/\-]?\s*surname|surname\s*[\/\-]?\s*příjmení|prijmeni\s*[\/\-]?\s*surname|surname\s*[\/\-]?\s*prijmeni|příjmení|surname|prijmeni)\s*[:\/\-]?\s*/i;
  const givenNameLabelRegex = /(?:jméno\s*[\/\-]?\s*given\s+names?|given\s+names?\s*[\/\-]?\s*jméno|jmeno\s*[\/\-]?\s*given\s+names?|given\s+names?\s*[\/\-]?\s*jmeno|jméno|given\s+names?|jmeno)\s*[:\/\-]?\s*/i;

  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();
    if (!prijmeni && surnameKeywords.some((kw) => lineLower.includes(kw))) {
      const match = lines[i].match(surnameLabelRegex);
      if (match) {
        const matched = match[0];
        const index = lines[i].indexOf(matched);
        const value = lines[i].slice(index + matched.length).trim();
        if (value.length > 1) {
          prijmeni = sanitizeName(toTitleCase(value));
        } else if (i + 1 < lines.length) {
          const nextLineLower = lines[i + 1].toLowerCase();
          if (!givenNameKeywords.some((kw) => nextLineLower.includes(kw))) {
            prijmeni = sanitizeName(toTitleCase(lines[i + 1].trim()));
          }
        }
      }
    }
    if (!jmeno && givenNameKeywords.some((kw) => lineLower.includes(kw))) {
      const match = lines[i].match(givenNameLabelRegex);
      if (match) {
        const matched = match[0];
        const index = lines[i].indexOf(matched);
        const value = lines[i].slice(index + matched.length).trim();
        if (value.length > 1) {
          jmeno = sanitizeName(toTitleCase(value));
        } else if (i + 1 < lines.length) {
          const nextLineLower = lines[i + 1].toLowerCase();
          if (!surnameKeywords.some((kw) => nextLineLower.includes(kw))) {
            jmeno = sanitizeName(toTitleCase(lines[i + 1].trim()));
          }
        }
      }
    }
  }
  return { jmeno, prijmeni };
};

const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Chyba při načítání souboru."));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Chyba při čtení souboru."));
    reader.readAsDataURL(file);
  });
};

const preprocessImage = (img: HTMLImageElement): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    let contrast = (gray - 128) * 2.5 + 128;
    if (contrast > 255) contrast = 255;
    if (contrast < 0) contrast = 0;
    data[i] = contrast;
    data[i + 1] = contrast;
    data[i + 2] = contrast;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
};

type KioskStage = "welcome" | "scanning" | "form" | "success";

export default function KioskPage() {
  const [stage, setStage] = useState<KioskStage>("welcome");
  
  // Form states
  const [jmeno, setJmeno] = useState("");
  const [prijmeni, setPrijmeni] = useState("");
  const [organizace, setOrganizace] = useState("");
  const [spz, setSpz] = useState("");

  // Scan & Save states
  const [scanProgress, setScanProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live Clock States
  const [time, setTime] = useState("");
  const [dateStr, setDateStr] = useState("");

  // Visitor List and log states
  const [visits, setVisits] = useState<Visit[]>([]);
  const [isLoadingVisits, setIsLoadingVisits] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tick the live clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }));
      setDateStr(now.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" }).toUpperCase());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch visits list helper
  const fetchVisits = async () => {
    setIsLoadingVisits(true);
    try {
      const res = await fetch("/api/visits");
      if (res.ok) {
        const data = await res.json();
        setVisits(data);
      }
    } catch (err) {
      console.error("Error fetching visits:", err);
    } finally {
      setIsLoadingVisits(false);
    }
  };

  // Poll visits list every 10 seconds to stay updated
  useEffect(() => {
    fetchVisits();
    const interval = setInterval(fetchVisits, 10000);
    return () => clearInterval(interval);
  }, []);

  // Show status Toast
  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => {
      setToastMsg(null);
    }, 4000);
  };

  // Handle OCR Document Photo using Tesseract.js
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStage("scanning");
    setScanProgress(0);
    setErrorMsg(null);
    setJmeno("");
    setPrijmeni("");

    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

    try {
      // 1. Read and preprocess image
      const img = await loadImage(file);
      const canvas = preprocessImage(img);

      // 2. Stage 1: Try reading MRZ on back of ID ('eng' + whitelist)
      worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing") {
            setScanProgress(Math.round(m.progress * 50));
          }
        },
      });

      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
      });

      const { data: { text: mrzText } } = await worker.recognize(canvas);
      await worker.terminate();
      worker = null;

      const mrzData = parseMRZ(mrzText);
      if (mrzData && (mrzData.jmeno || mrzData.prijmeni)) {
        if (mrzData.jmeno) setJmeno(mrzData.jmeno);
        if (mrzData.prijmeni) setPrijmeni(mrzData.prijmeni);
        setStage("form");
        setScanProgress(100);
        return;
      }

      // 3. Stage 2: Fallback to reading front page ('ces+eng' without whitelist)
      worker = await createWorker("ces+eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing") {
            setScanProgress(50 + Math.round(m.progress * 50));
          }
        },
      });

      const { data: { text: fallbackText } } = await worker.recognize(canvas);
      const fallbackData = parseFallback(fallbackText);

      if (fallbackData.jmeno) setJmeno(fallbackData.jmeno);
      if (fallbackData.prijmeni) setPrijmeni(fallbackData.prijmeni);

      setStage("form");
      setScanProgress(100);
    } catch (err) {
      console.error(err);
      setErrorMsg("Nepodařilo se automaticky vyčíst údaje. Vyplňte je prosím ručně.");
      setStage("form");
    } finally {
      if (worker) {
        await worker.terminate();
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Submit visit check-in
  const handleSaveVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jmeno.trim() || !prijmeni.trim()) {
      setErrorMsg("Vyplňte prosím své jméno a příjmení.");
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jmeno: jmeno.trim(),
          prijmeni: prijmeni.trim(),
          organizace: organizace.trim() || null,
          spz: spz.trim() || null
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Nepodařilo se uložit záznam o příchodu.");
      }

      setStage("success");
      fetchVisits();
      
      // Auto reset to welcome stage after 4 seconds
      setTimeout(() => {
        setJmeno("");
        setPrijmeni("");
        setOrganizace("");
        setSpz("");
        setStage("welcome");
        setErrorMsg(null);
      }, 4000);

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Chyba při odesílání dat.";
      setErrorMsg(errMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setJmeno("");
    setPrijmeni("");
    setOrganizace("");
    setSpz("");
    setStage("welcome");
    setErrorMsg(null);
  };

  // Perform visitor check-out (Odchod)
  const handleCheckOut = async (id: number, visitorName: string) => {
    try {
      const res = await fetch(`/api/visits/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Nepodařilo se zaznamenat odchod.");
      }

      showToast(`Odchod návštěvy ${visitorName} byl zaevidován.`, "success");
      fetchVisits();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Chyba při odesílání dat.";
      showToast(errMsg, "error");
    }
  };

  // Filter lists based on search bar queries
  const filtered = visits.filter(v => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      `${v.jmeno} ${v.prijmeni}`.toLowerCase().includes(q) ||
      (v.organizace && v.organizace.toLowerCase().includes(q)) ||
      (v.spz && v.spz.toLowerCase().includes(q))
    );
  });

  const activeVisits = filtered.filter(v => !v.cas_odchodu);
  const completedVisits = filtered.filter(v => !!v.cas_odchodu);
  const displayList = activeTab === "active" ? activeVisits : completedVisits;

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden app-bg selection:bg-black/[0.06]">
      
      {/* Decorative gradient blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] animate-blob" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-500/10 rounded-full blur-[120px] animate-blob" />

      {/* Main glass frame wrapper */}
      <div className="w-full max-w-6xl glass p-6 sm:p-8 min-h-[620px] flex flex-col justify-between relative z-10">
        
        {/* Top Header bar */}
        <header className="flex items-center justify-between border-b border-black/[0.08] pb-4 mb-6">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/45 px-4 py-2 text-xs font-bold text-[#6e6e73] transition-all hover:bg-white/70 hover:text-[#1d1d1f]"
          >
            <ArrowLeft className="h-4 w-4" />
            Přihlášení pro zaměstnance
          </Link>

          <div className="text-center hidden sm:block">
            <h1 className="text-sm font-extrabold tracking-widest text-[#1d1d1f] font-sans">
              ELEKTRONICKÁ KNIHA NÁVŠTĚV
            </h1>
          </div>

          <div className="text-right font-mono">
            <span className="text-base font-bold text-[#1d1d1f] block tracking-tight tabular-nums">{time || "00:00"}</span>
            <span className="text-[9px] text-[#86868b] block font-bold tracking-wider">{dateStr || "NAČÍTÁNÍ"}</span>
          </div>
        </header>

        {/* Dual Pane Grid layout */}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 py-4 items-stretch">

          {/* LEFT COLUMN: Registration Actions (5/12) */}
          <section className="lg:col-span-5 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-black/[0.08] pb-8 lg:pb-0 pr-0 lg:pr-8">
            
            {/* Stage 1: Welcome Options */}
            {stage === "welcome" && (
              <div className="space-y-6 animate-rise text-center lg:text-left">
                <div className="space-y-4">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0071e3]/10 border border-[#0071e3]/20 text-[#0071e3] shadow-inner mb-1">
                    <Sparkles className="h-6 w-6 text-[#0071e3]" />
                  </div>
                  <h2 className="text-2xl font-extrabold tracking-tight text-[#1d1d1f] leading-tight">
                    Registrace příchodu
                  </h2>
                  <p className="text-xs text-[#6e6e73] font-semibold leading-relaxed">
                    Před vstupem do prostor budovy prosím zaevidujte svou návštěvu. Zvolte naskenování dokladu pro rychlé vyplnění jména, nebo vložte údaje ručně.
                  </p>
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-primary flex items-center justify-center gap-2.5 py-4 text-xs tracking-wider shadow-sm font-bold rounded-2xl"
                  >
                    <Camera className="h-4.5 w-4.5" />
                    Naskenovat občanský průkaz
                  </button>

                  <button
                    type="button"
                    onClick={() => setStage("form")}
                    className="btn-ghost flex items-center justify-center gap-2.5 py-4 text-xs tracking-wider font-bold rounded-2xl bg-white/50"
                  >
                    <Keyboard className="h-4.5 w-4.5" />
                    Zadat údaje ručně
                  </button>
                </div>

                {/* Hidden File Scanner Input */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />

                <p className="text-[10px] text-[#86868b] font-bold leading-normal text-center lg:text-left">
                  🛡️ GDPR: Neukládáme žádné kopie ani snímky dokladů. OCR vyčte pouze Vaše jméno a příjmení na Vašem zařízení a data ihned odstraní.
                </p>
              </div>
            )}

            {/* Stage 2: Scanning screen */}
            {stage === "scanning" && (
              <div className="text-center space-y-6 animate-rise">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0071e3]/10 border border-[#0071e3]/20 text-[#0071e3]">
                  <Loader2 className="h-7 w-7 animate-spin text-[#0071e3]" />
                </div>
                
                <div className="space-y-1">
                  <h3 className="text-lg font-extrabold text-[#1d1d1f]">Načítání dokladu...</h3>
                  <p className="text-[11px] text-[#6e6e73] font-medium max-w-xs mx-auto">
                    OCR čtení probíhá bezpečně přímo ve vašem prohlížeči. Fotografie se nikam neposílá.
                  </p>
                </div>

                <div className="space-y-2 max-w-xs mx-auto pt-2">
                  <div className="w-full h-2 bg-black/[0.06] rounded-full overflow-hidden border border-black/[0.04] p-0.5">
                    <div 
                      className="h-full bg-[#0071e3] rounded-full transition-all duration-300" 
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono font-bold text-[#6e6e73]">
                    Rozpoznávání: {scanProgress}%
                  </span>
                </div>
              </div>
            )}

            {/* Stage 3: Form */}
            {stage === "form" && (
              <div className="animate-rise w-full space-y-4">
                <div className="text-center lg:text-left">
                  <h3 className="text-xl font-extrabold text-[#1d1d1f] tracking-tight">Osobní údaje</h3>
                  <p className="text-[11px] text-[#6e6e73] font-semibold mt-1">
                    Vyplňte nebo upravte své údaje k zaznamenání příchodu.
                  </p>
                </div>

                {errorMsg && (
                  <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-700 text-[11px] flex items-center gap-2 shadow-sm font-semibold">
                    <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleSaveVisit} className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">Jméno *</label>
                      <input
                        type="text"
                        required
                        value={jmeno}
                        onChange={(e) => setJmeno(e.target.value)}
                        placeholder="Jan"
                        className="input"
                        disabled={isSaving}
                      />
                    </div>
                    <div>
                      <label className="field-label">Příjmení *</label>
                      <input
                        type="text"
                        required
                        value={prijmeni}
                        onChange={(e) => setPrijmeni(e.target.value)}
                        placeholder="Novák"
                        className="input"
                        disabled={isSaving}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="field-label flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-[#86868b]" />
                      Organizace / Firma
                    </label>
                    <input
                      type="text"
                      value={organizace}
                      onChange={(e) => setOrganizace(e.target.value)}
                      placeholder="Název firmy (nepovinné)"
                      className="input"
                      disabled={isSaving}
                    />
                  </div>

                  <div>
                    <label className="field-label flex items-center gap-1.5">
                      <Car className="h-3.5 w-3.5 text-[#86868b]" />
                      SPZ vozidla
                    </label>
                    <input
                      type="text"
                      value={spz}
                      onChange={(e) => setSpz(e.target.value)}
                      placeholder="Registrační značka (nepovinné)"
                      className="input font-mono font-bold uppercase"
                      disabled={isSaving}
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={isSaving}
                      className="btn-ghost w-1/3 py-2.5 text-xs font-bold"
                    >
                      Zrušit
                    </button>

                    <button
                      type="submit"
                      disabled={isSaving}
                      className="btn-primary w-2/3 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4.5 w-4.5 animate-spin" />
                          Ukládám...
                        </>
                      ) : (
                        "Vstoupit"
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Stage 4: Success */}
            {stage === "success" && (
              <div className="text-center space-y-5 animate-rise py-4">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 border-2 border-emerald-500/30 text-emerald-600 shadow-md">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-extrabold text-[#1d1d1f] tracking-tight">Vstup povolen!</h3>
                  <p className="text-xs font-bold text-[#0071e3] tracking-wide">
                    Vítejte, {jmeno} {prijmeni}.
                  </p>
                  <p className="text-[11px] text-[#6e6e73] font-semibold leading-relaxed max-w-xs mx-auto">
                    Váš příchod byl v pořádku zaznamenán do knihy návštěv. Přejeme příjemný den.
                  </p>
                </div>

                <div className="text-[9px] text-[#86868b] font-bold animate-pulse pt-2">
                  Obrazovka se automaticky resetuje za okamžik...
                </div>
              </div>
            )}

          </section>

          {/* RIGHT COLUMN: Visitor Logbook (7/12) */}
          <section className="lg:col-span-7 flex flex-col pl-0 lg:pl-4 mt-6 lg:mt-0">
            
            {/* Logbook Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-[#1d1d1f] flex items-center gap-2 font-sans tracking-wide">
                <FileText className="h-4.5 w-4.5 text-[#0071e3]" />
                KNIHA NÁVŠTĚV
              </h3>
              
              <button 
                onClick={fetchVisits} 
                disabled={isLoadingVisits}
                title="Aktualizovat seznam"
                className="p-2 text-[#86868b] hover:text-[#1d1d1f] transition-all hover:bg-black/[0.04] rounded-full"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingVisits ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mb-4">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868b]" />
              <input
                type="text"
                placeholder="Vyhledat návštěvu podle jména, firmy, SPZ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-10 text-xs"
              />
            </div>

            {/* Tab Controls */}
            <div className="flex border-b border-black/[0.08] mb-4 gap-4">
              <button
                onClick={() => setActiveTab("active")}
                className={`tab pb-2 flex items-center gap-1.5 ${activeTab === "active" ? "tab-active" : ""}`}
              >
                <span>Aktivní v budově</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === "active" ? "bg-[#0071e3]/10 text-[#0071e3]" : "bg-black/[0.04] text-[#86868b]"
                }`}>
                  {visits.filter(v => !v.cas_odchodu).length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("completed")}
                className={`tab pb-2 flex items-center gap-1.5 ${activeTab === "completed" ? "tab-active" : ""}`}
              >
                <span>Dnešní odchody</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === "completed" ? "bg-emerald-500/10 text-emerald-700" : "bg-black/[0.04] text-[#86868b]"
                }`}>
                  {visits.filter(v => !!v.cas_odchodu).length}
                </span>
              </button>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto max-h-[360px] premium-scroll pr-1 space-y-2.5">
              {isLoadingVisits && visits.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#86868b]">
                  <Loader2 className="h-6 w-6 animate-spin text-[#86868b] mb-2" />
                  <span className="text-xs font-semibold">Načítám přehled návštěv...</span>
                </div>
              ) : displayList.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-black/[0.06] rounded-2xl bg-black/[0.01]">
                  <User className="h-8 w-8 text-[#86868b]/40 mx-auto mb-2" />
                  <p className="text-xs font-bold text-[#86868b]">
                    {searchQuery ? "Nebyly nalezeny žádné výsledky" : activeTab === "active" ? "Žádní návštěvníci v budově" : "Žádné zaznamenané odchody za posledních 24h"}
                  </p>
                </div>
              ) : (
                displayList.map((visit) => {
                  const initials = `${visit.jmeno.charAt(0)}${visit.prijmeni.charAt(0)}`.toUpperCase();
                  return (
                    <div 
                      key={visit.id} 
                      className="flex items-center justify-between p-3.5 rounded-2xl bg-white/40 border border-black/[0.04] hover:bg-white/60 transition-all duration-200 animate-rise"
                    >
                      <div className="flex items-center gap-3">
                        <div className="avatar h-10 w-10 rounded-xl text-xs font-extrabold flex items-center justify-center shrink-0">
                          {initials}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-[#1d1d1f] tracking-tight">
                            {visit.jmeno} {visit.prijmeni}
                          </h4>
                          
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[10px] font-bold text-[#6e6e73]">
                            {visit.organizace && (
                              <span className="flex items-center gap-1 bg-[#0071e3]/5 text-[#0071e3] px-1.5 py-0.5 rounded-md">
                                <Building2 className="h-3 w-3 shrink-0" />
                                {visit.organizace}
                              </span>
                            )}
                            {visit.spz && (
                              <span className="flex items-center gap-1 font-mono uppercase bg-black/[0.04] px-1.5 py-0.5 rounded-md border border-black/[0.06]">
                                <Car className="h-3 w-3 shrink-0" />
                                {visit.spz}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-[#86868b]">
                              <Clock className="h-3 w-3 shrink-0" />
                              Příchod: {formatTime(visit.cas_prichodu)}
                              {visit.cas_odchodu && ` / Odchod: ${formatTime(visit.cas_odchodu)}`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Checkout Action or Chip Badge */}
                      {activeTab === "active" ? (
                        <button
                          onClick={() => handleCheckOut(visit.id, `${visit.jmeno} ${visit.prijmeni}`)}
                          className="btn-danger py-1.5 px-3 rounded-xl text-[10px] font-extrabold flex items-center gap-1 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                          <LogOut className="h-3.5 w-3.5 shrink-0" />
                          Odchod
                        </button>
                      ) : (
                        <div className="chip chip-emerald text-[9px] font-bold py-0.5 px-2 shrink-0">
                          Dokončeno
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

          </section>

        </main>

        {/* Global Toast Notification Popup */}
        {toastMsg && (
          <div className={`fixed bottom-6 right-6 z-50 p-4 rounded-xl border shadow-lg flex items-center gap-2.5 font-bold text-xs animate-rise ${
            toastMsg.type === "success" 
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-700" 
              : "bg-rose-500/15 border-rose-500/30 text-rose-700"
          }`}>
            {toastMsg.type === "success" ? (
              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="h-4.5 w-4.5 text-rose-500 shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
        )}

        {/* Kiosk Footer */}
        <footer className="border-t border-black/5 pt-4 mt-6 text-center text-[10px] text-[#86868b] flex items-center justify-center gap-1.5 font-bold">
          <Check className="h-3.5 w-3.5 text-emerald-500" />
          Kniha návštěv — Elektronický samoobslužný recepční panel
        </footer>

      </div>
    </div>
  );
}
