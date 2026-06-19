"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  Camera, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  LogOut,
  Clock,
  Building2,
  Car,
  Search,
  Download,
  Check
} from "lucide-react";
import { createWorker } from "tesseract.js";

interface Visit {
  id: number | string;
  jmeno: string;
  prijmeni: string;
  organizace: string | null;
  spz: string | null;
  cas_prichodu: string;
  cas_odchodu: string | null;
  status: string;
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

export default function Home() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Auth Verification
  useEffect(() => {
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(";").shift();
      return null;
    };

    const role = getCookie("userRole") || sessionStorage.getItem("userRole");
    if (role === "CEO") {
      setIsAuthorized(true);
    } else if (role === "EMPLOYEE") {
      router.push("/portal");
    } else {
      router.push("/login?redirect=/");
    }
  }, [router]);

  // Form state
  const [jmeno, setJmeno] = useState("");
  const [prijmeni, setPrijmeni] = useState("");
  const [organizace, setOrganizace] = useState("");
  const [spz, setSpz] = useState("");
  
  // API states
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState<number | string | null>(null);
  
  // Lists and filters
  const [visits, setVisits] = useState<Visit[]>([]);
  const [isLoadingVisits, setIsLoadingVisits] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  
  // Messages
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // Live Clock State
  const [time, setTime] = useState("");
  const [dateStr, setDateStr] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tick the live clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setDateStr(now.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" }).toUpperCase());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch visits from the backend
  const fetchVisits = async () => {
    setIsLoadingVisits(true);
    try {
      const res = await fetch("/api/visits");
      if (res.ok) {
        const data = await res.json();
        setVisits(data);
      }
    } catch (err) {
      console.error("Chyba při načítání návštěv:", err);
    } finally {
      setIsLoadingVisits(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchVisits();
    }
  }, [isAuthorized]);

  // Auto-dismiss alert notifications
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(null), 7000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  // Handle OCR Document Photo 100% Client-Side using Tesseract.js
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanProgress(0);
    setErrorMsg(null);
    setSuccessMsg(null);

    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

    try {
      // 1. Read and preprocess document image
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
        setSuccessMsg("Doklad načten ze zadní strany (MRZ).");
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

      if (fallbackData.jmeno || fallbackData.prijmeni) {
        setSuccessMsg("Doklad načten z přední strany.");
      } else {
        setErrorMsg("Na dokladu nebyly rozpoznány čitelné údaje.");
      }
      setScanProgress(100);
    } catch (err) {
      console.error(err);
      setErrorMsg("Chyba při OCR zpracování. Vyplňte údaje ručně.");
    } finally {
      if (worker) {
        await worker.terminate();
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsScanning(false);
    }
  };

  // Submit visit check-in
  const handleSaveVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jmeno.trim() || !prijmeni.trim()) {
      setErrorMsg("Jméno a příjmení jsou povinné.");
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jmeno,
          prijmeni,
          organizace,
          spz
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Nepodařilo se uložit návštěvu.");
      }

      setSuccessMsg(`Zápis dokončen: ${jmeno} ${prijmeni}`);
      setJmeno("");
      setPrijmeni("");
      setOrganizace("");
      setSpz("");
      
      await fetchVisits();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Chyba při ukládání.";
      setErrorMsg(errMsg);
    } finally {
      setIsSaving(false);
    }
  };

  // Check out visit
  const handleCheckout = async (id: number | string, name: string) => {
    setIsCheckingOut(id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/visits/${id}`, {
        method: "PATCH",
      });

      if (!res.ok) {
        throw new Error("Nepodařilo se odhlásit návštěvu.");
      }

      setSuccessMsg(`Host ${name} byl odhlášen.`);
      await fetchVisits();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Chyba při odhlašování.";
      setErrorMsg(errMsg);
    } finally {
      setIsCheckingOut(null);
    }
  };

  // Calculate duration elapsed in building
  const getElapsedTime = (isoArrival: string, isoDeparture: string | null) => {
    try {
      const start = new Date(isoArrival).getTime();
      const end = isoDeparture ? new Date(isoDeparture).getTime() : Date.now();
      const diffMs = end - start;
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return "nyní";
      if (diffMins < 60) return `${diffMins} min`;
      
      const hours = Math.floor(diffMins / 60);
      const minutes = diffMins % 60;
      
      if (minutes === 0) return `${hours} hod`;
      return `${hours}h ${minutes}m`;
    } catch {
      return "--";
    }
  };

  // Format date elements
  const formatCzechTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "--:--";
    }
  };

  // Filter & Search visits
  const filteredVisits = visits.filter((visit) => {
    const searchLower = searchText.toLowerCase();
    const nameMatch = `${visit.jmeno} ${visit.prijmeni}`.toLowerCase().includes(searchLower);
    const companyMatch = visit.organizace?.toLowerCase().includes(searchLower) || false;
    const spzMatch = visit.spz?.toLowerCase().includes(searchLower) || false;
    const matchesSearch = nameMatch || companyMatch || spzMatch;

    if (filter === "active") return matchesSearch && visit.status === "V budově";
    if (filter === "completed") return matchesSearch && visit.status === "Odešel";
    return matchesSearch;
  });

  // Calculate stats
  const activeCount = visits.filter(v => v.status === "V budově").length;
  const totalCount = visits.length;
  const checkedOutCount = visits.filter(v => v.status === "Odešel").length;

  // Export to CSV sheet
  const exportToCSV = () => {
    const headers = ["Jméno", "Příjmení", "Organizace", "SPZ", "Příchod", "Odchod", "Doba", "Status"];
    const rows = filteredVisits.map((v) => [
      v.jmeno,
      v.prijmeni,
      v.organizace || "",
      v.spz || "",
      v.cas_prichodu ? new Date(v.cas_prichodu).toLocaleString("cs-CZ") : "",
      v.cas_odchodu ? new Date(v.cas_odchodu).toLocaleString("cs-CZ") : "",
      getElapsedTime(v.cas_prichodu, v.cas_odchodu),
      v.status,
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `checknito-export-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500 font-sans text-xs uppercase tracking-widest gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        <span>Ověřování přístupu...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16 font-sans antialiased selection:bg-indigo-100">
      
      {/* Visual Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-5 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Logo Brand */}
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="CHECKNI TO" className="h-9 w-auto object-contain" />
            <div className="hidden sm:block border-l border-slate-200 pl-3">
              <h1 className="text-sm font-black tracking-wider text-indigo-600">CHECKNI TO</h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Kniha návštěv</p>
            </div>
          </div>

          {/* Minimalist Summary Tickers & Clock */}
          <div className="flex flex-wrap items-center gap-5 md:gap-8">
            {/* Live digital status tickers */}
            <div className="text-[11px] font-mono text-slate-600 uppercase flex items-center gap-4 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm">
              <span>V budově: <strong className="text-emerald-600 font-bold">{activeCount}</strong></span>
              <span className="text-slate-200">|</span>
              <span>Dnes: <strong className="text-slate-800 font-bold">{totalCount}</strong></span>
              <span className="text-slate-200">|</span>
              <span>Odešli: <strong className="text-slate-400 font-bold">{checkedOutCount}</strong></span>
            </div>

            {/* Typewriter clock */}
            <div className="text-right font-mono border-l border-slate-200 pl-4 hidden sm:block">
              <span className="text-xs font-bold text-slate-800 block tracking-tight">{time || "00:00:00"}</span>
              <span className="text-[9px] text-slate-400 block uppercase font-semibold">{dateStr || "ZAVÁDĚNÍ"}</span>
            </div>

            <button 
              onClick={fetchVisits} 
              disabled={isLoadingVisits}
              className="p-2 text-slate-400 hover:text-slate-650 bg-white border border-slate-200 rounded-xl transition-all disabled:opacity-50"
              title="Obnovit data"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingVisits ? "animate-spin" : ""}`} />
            </button>
          </div>

        </div>
      </header>

      {/* Content Area */}
      <main className="max-w-6xl mx-auto px-4 mt-8">
        
        {/* Global Notifications */}
        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 shadow-sm animate-in fade-in slide-in-from-top-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span className="font-semibold">{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5 shadow-sm animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
        )}

        {/* Dashboard Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT: Index Card check-in registration */}
          <div className="lg:col-span-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
              {/* Paper line indicator top decoration */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500"></div>
              
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4">
                Karta příchodu
              </h2>

              {/* Physical tray dropzone design */}
              <div className="border border-slate-200 rounded-2xl p-5 text-center mb-6 bg-slate-50">
                {isScanning ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                    <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                      Vytěžuji doklad... {scanProgress}%
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                      Položte doklad (OP, pas) před objektiv a stiskněte tlačítko pro vyčtení údajů.
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 bg-indigo-650 hover:bg-indigo-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-sm transition-all w-full active:scale-[0.99]"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Vyfotit / Skenovat doklad
                    </button>
                  </div>
                )}
                
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Registration Form */}
              <form onSubmit={handleSaveVisit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-widest">
                      Jméno
                    </label>
                    <input
                      type="text"
                      required
                      value={jmeno}
                      onChange={(e) => setJmeno(e.target.value)}
                      placeholder="Jan"
                      className="mt-1.5 block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 text-slate-900 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-widest">
                      Příjmení
                    </label>
                    <input
                      type="text"
                      required
                      value={prijmeni}
                      onChange={(e) => setPrijmeni(e.target.value)}
                      placeholder="Novák"
                      className="mt-1.5 block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 text-slate-900 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-455 uppercase tracking-widest">
                    Název firmy / Organizace
                  </label>
                  <input
                    type="text"
                    value={organizace}
                    onChange={(e) => setOrganizace(e.target.value)}
                    placeholder="Např. Google (nepovinné)"
                    className="mt-1.5 block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-widest">
                    Státní poznávací značka (SPZ)
                  </label>
                  <input
                    type="text"
                    value={spz}
                    onChange={(e) => setSpz(e.target.value)}
                    placeholder="Např. 1AB 2345 (nepovinné)"
                    className="mt-1.5 block w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 text-slate-900 font-mono font-bold uppercase"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSaving || isScanning}
                  className="w-full bg-indigo-650 hover:bg-indigo-600 text-white py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-widest shadow-md transition-all mt-2 disabled:opacity-50 active:scale-[0.99]"
                >
                  {isSaving ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Zapisuji příchod...
                    </span>
                  ) : (
                    "Zapsat příchod"
                  )}
                </button>
              </form>

              {/* GDPR Legal Safeguard footer */}
              <div className="mt-5 pt-4 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-center gap-1.5 font-bold leading-relaxed text-center">
                <Check className="h-3.5 w-3.5 text-emerald-550 shrink-0" />
                Fotky ihned odstraňujeme. Neukládáme žádné kopie dokladů.
              </div>

            </div>
          </div>

          {/* RIGHT: Visitor logbook grid */}
          <div className="lg:col-span-7">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500"></div>
              
              {/* Controls Bar */}
              <div className="space-y-4 mb-6">
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                    Logbook návštěv
                  </h2>
                  
                  {/* CSV Export */}
                  <button
                    onClick={exportToCSV}
                    disabled={filteredVisits.length === 0}
                    className="inline-flex items-center justify-center gap-1.5 border border-slate-205 hover:bg-slate-50 text-slate-600 py-1.5 px-3 rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50 self-start sm:self-auto"
                    title="Uložit list do CSV souboru"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-500" />
                    Uložit jako CSV
                  </button>
                </div>

                {/* Search query box */}
                <div className="relative">
                  <Search className="absolute left-3 top-3.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Hledat podle jména, firmy nebo SPZ..."
                    className="block w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-indigo-500 text-slate-800"
                  />
                </div>

                {/* GitHub/Linear style Underline Tabs */}
                <div className="flex gap-5 border-b border-slate-150 pb-1">
                  <button
                    onClick={() => setFilter("all")}
                    className={`py-1 text-xs font-bold transition-all relative ${
                      filter === "all"
                        ? "text-indigo-600"
                        : "text-slate-450 hover:text-slate-700"
                    }`}
                  >
                    Všichni ({totalCount})
                    {filter === "all" && <span className="absolute bottom-[-5px] left-0 right-0 h-[2px] bg-indigo-500"></span>}
                  </button>
                  <button
                    onClick={() => setFilter("active")}
                    className={`py-1 text-xs font-bold transition-all relative flex items-center gap-1 ${
                      filter === "active"
                        ? "text-indigo-600"
                        : "text-slate-450 hover:text-slate-700"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                    V budově ({activeCount})
                    {filter === "active" && <span className="absolute bottom-[-5px] left-0 right-0 h-[2px] bg-indigo-500"></span>}
                  </button>
                  <button
                    onClick={() => setFilter("completed")}
                    className={`py-1 text-xs font-bold transition-all relative ${
                      filter === "completed"
                        ? "text-indigo-600"
                        : "text-slate-455 hover:text-slate-700"
                    }`}
                  >
                    Odešli ({checkedOutCount})
                    {filter === "completed" && <span className="absolute bottom-[-5px] left-0 right-0 h-[2px] bg-indigo-500"></span>}
                  </button>
                </div>

              </div>

              {/* Table / List layout */}
              {isLoadingVisits && visits.length === 0 ? (
                <div className="space-y-4 py-4">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="flex justify-between items-center border-b border-slate-100 pb-4 animate-pulse">
                      <div className="space-y-2 w-2/3">
                        <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                        <div className="h-3 bg-slate-100 rounded w-1/3"></div>
                      </div>
                      <div className="h-8 bg-slate-105 rounded w-16"></div>
                    </div>
                  ))}
                </div>
              ) : filteredVisits.length === 0 ? (
                <div className="py-16 text-center text-slate-400 bg-slate-50 border border-slate-150 rounded-xl">
                  <p className="font-bold text-xs uppercase tracking-wider text-slate-400">Žádné záznamy</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredVisits.map((visit) => {
                    const isActive = visit.status === "V budově";
                    return (
                      <div 
                        key={visit.id} 
                        className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 min-w-0">
                          {/* Name / Organization */}
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 text-sm">
                              {visit.prijmeni} {visit.jmeno}
                            </span>
                            {visit.organizace && (
                              <span className="flex items-center gap-1 bg-slate-50 border border-slate-205 px-2 py-0.5 rounded text-slate-600 font-bold text-[10px]">
                                <Building2 className="h-2.5 w-2.5 text-slate-400" />
                                {visit.organizace}
                              </span>
                            )}
                          </div>

                          {/* Monospace Ledger details */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500 font-mono">
                            
                            {/* Time details */}
                            <span className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-bold text-slate-650">
                              <Clock className="h-3 w-3 text-slate-400" />
                              <span>{formatCzechTime(visit.cas_prichodu)}</span>
                              {!isActive && visit.cas_odchodu && (
                                <>
                                  <span className="text-slate-300 font-light">•</span>
                                  <span>{formatCzechTime(visit.cas_odchodu)}</span>
                                </>
                              )}
                            </span>

                            {/* Duration details */}
                            <span className="text-[11px] text-indigo-600 font-bold bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
                              Doba: {getElapsedTime(visit.cas_prichodu, visit.cas_odchodu)}
                            </span>

                            {/* Vehicle plate details */}
                            {visit.spz && (
                              <span className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px] text-slate-600">
                                <Car className="h-3 w-3 text-slate-400" />
                                {visit.spz}
                              </span>
                            )}

                          </div>
                        </div>
                        
                        {/* Actions */}
                        <div className="shrink-0">
                          {isActive ? (
                            <button
                              onClick={() => handleCheckout(visit.id, `${visit.jmeno} ${visit.prijmeni}`)}
                              disabled={isCheckingOut === visit.id}
                              className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-200 font-bold py-1.5 px-3.5 rounded-lg text-xs shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                            >
                              {isCheckingOut === visit.id ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  ...
                                </>
                              ) : (
                                <>
                                  <LogOut className="h-3.5 w-3.5" />
                                  Odchod
                                </>
                              )}
                            </button>
                          ) : (
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pr-2 font-mono">
                              Odešel
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          </div>
          
        </div>
      </main>
    </div>
  );
}
