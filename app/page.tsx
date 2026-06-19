"use client";

import { useState, useEffect, useRef } from "react";
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
      window.location.replace("/portal");
    } else {
      window.location.replace("/login?redirect=/");
    }
  }, []);

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
      <div className="min-h-screen bg-black/[0.04] flex flex-col items-center justify-center text-[#6e6e73] font-sans text-xs uppercase tracking-widest gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-[#6e6e73]" />
        <span>Ověřování přístupu...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-[#1d1d1f] pb-16 font-sans antialiased selection:bg-black/[0.06]">

      {/* Visual Header */}
      <header className="lg:sticky lg:top-0 z-30 glass-bar border-b border-black/[0.08] px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">

          {/* Page title */}
          <div className="flex items-center gap-3">
            <div>
              <p className="eyebrow">Recepce</p>
              <h1 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">Kniha návštěv</h1>
            </div>
          </div>

          {/* Live stat chips & Clock */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="chip chip-emerald gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                V budově: {activeCount}
              </span>
              <span className="chip chip-indigo">Dnes: {totalCount}</span>
              <span className="chip chip-slate">Odešli: {checkedOutCount}</span>
            </div>

            {/* Clock */}
            <div className="text-right font-mono border-l border-black/[0.08] pl-3 hidden sm:block">
              <span className="text-sm font-bold text-[#1d1d1f] block tracking-tight tabular-nums">{time || "00:00:00"}</span>
              <span className="text-[9px] text-[#86868b] block uppercase font-semibold">{dateStr || "ZAVÁDĚNÍ"}</span>
            </div>

            <button
              onClick={fetchVisits}
              disabled={isLoadingVisits}
              className="btn-ghost !px-2.5 !py-2.5"
              title="Obnovit data"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingVisits ? "animate-spin" : ""}`} />
            </button>
          </div>

        </div>
      </header>

      {/* Content Area */}
      <main className="max-w-7xl mx-auto px-4 lg:px-6 mt-8">
        
        {/* Global Notifications */}
        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 text-xs flex items-center gap-2.5 shadow-sm animate-in fade-in slide-in-from-top-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span className="font-semibold">{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-700 text-xs flex items-center gap-2.5 shadow-sm animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
        )}

        {/* Dashboard Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT: Index Card check-in registration */}
          <div className="lg:col-span-5">
            <div className="surface card-accent p-6 animate-rise">

              <h2 className="section-title mb-1">
                <span className="stat-icon bg-black/[0.04] text-[#6e6e73] !h-8 !w-8"><Camera className="h-4 w-4" /></span>
                Karta příchodu
              </h2>
              <p className="text-xs text-[#6e6e73] mb-5">Naskenujte doklad nebo vyplňte údaje ručně.</p>

              {/* Physical tray dropzone design */}
              <div className="border-2 border-dashed rounded-2xl p-5 text-center mb-6 bg-black/[0.01] border-black/[0.08] hover:border-black/15 hover:bg-black/[0.03] transition-all">
                {isScanning ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-[#6e6e73]" />
                    <span className="text-[11px] font-mono text-[#6e6e73] uppercase tracking-wider animate-pulse">
                      Vytěžuji doklad... {scanProgress}%
                    </span>
                    <div className="w-full h-1.5 bg-black/[0.06] rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-[#0071e3] transition-all" style={{ width: `${scanProgress}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="mx-auto h-12 w-12 rounded-2xl bg-black/[0.04] flex items-center justify-center text-[#6e6e73]">
                      <Camera className="h-5 w-5" />
                    </div>
                    <p className="text-[11px] text-[#6e6e73] leading-relaxed font-semibold">
                      Položte doklad (OP, pas) před objektiv a stiskněte tlačítko pro vyčtení údajů.
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-primary w-full"
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
                    <label className="field-label">Jméno</label>
                    <input
                      type="text"
                      required
                      value={jmeno}
                      onChange={(e) => setJmeno(e.target.value)}
                      placeholder="Jan"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="field-label">Příjmení</label>
                    <input
                      type="text"
                      required
                      value={prijmeni}
                      onChange={(e) => setPrijmeni(e.target.value)}
                      placeholder="Novák"
                      className="input"
                    />
                  </div>
                </div>

                <div>
                  <label className="field-label">Název firmy / Organizace</label>
                  <input
                    type="text"
                    value={organizace}
                    onChange={(e) => setOrganizace(e.target.value)}
                    placeholder="Např. Google (nepovinné)"
                    className="input"
                  />
                </div>

                <div>
                  <label className="field-label">Státní poznávací značka (SPZ)</label>
                  <input
                    type="text"
                    value={spz}
                    onChange={(e) => setSpz(e.target.value)}
                    placeholder="Např. 1AB 2345 (nepovinné)"
                    className="input font-mono font-bold uppercase"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSaving || isScanning}
                  className="btn-primary w-full py-3 tracking-widest"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Zapisuji příchod...
                    </>
                  ) : (
                    "Zapsat příchod"
                  )}
                </button>
              </form>

              {/* GDPR Legal Safeguard footer */}
              <div className="mt-5 pt-4 border-t border-black/5 text-[10px] text-[#86868b] flex items-center justify-center gap-1.5 font-bold leading-relaxed text-center">
                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                Fotky ihned odstraňujeme. Neukládáme žádné kopie dokladů.
              </div>

            </div>
          </div>

          {/* RIGHT: Visitor logbook grid */}
          <div className="lg:col-span-7">
            <div className="surface card-accent p-6 animate-rise">

              {/* Controls Bar */}
              <div className="space-y-4 mb-6">

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 className="section-title">
                    <span className="stat-icon bg-black/[0.04] text-[#6e6e73] !h-8 !w-8"><Building2 className="h-4 w-4" /></span>
                    Logbook návštěv
                  </h2>

                  {/* CSV Export */}
                  <button
                    onClick={exportToCSV}
                    disabled={filteredVisits.length === 0}
                    className="btn-ghost"
                    title="Uložit list do CSV souboru"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Uložit jako CSV
                  </button>
                </div>

                {/* Search query box */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#86868b]" />
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Hledat podle jména, firmy nebo SPZ..."
                    className="input pl-10"
                  />
                </div>

                {/* Underline Tabs */}
                <div className="flex gap-6 border-b border-black/[0.08]">
                  <button onClick={() => setFilter("all")} className={`tab ${filter === "all" ? "tab-active" : ""}`}>
                    Všichni ({totalCount})
                  </button>
                  <button onClick={() => setFilter("active")} className={`tab flex items-center gap-1.5 ${filter === "active" ? "tab-active" : ""}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                    V budově ({activeCount})
                  </button>
                  <button onClick={() => setFilter("completed")} className={`tab ${filter === "completed" ? "tab-active" : ""}`}>
                    Odešli ({checkedOutCount})
                  </button>
                </div>

              </div>

              {/* Table / List layout */}
              {isLoadingVisits && visits.length === 0 ? (
                <div className="space-y-4 py-4">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="flex justify-between items-center border-b border-black/5 pb-4 animate-pulse">
                      <div className="space-y-2 w-2/3">
                        <div className="h-4 bg-black/[0.06] rounded w-1/2"></div>
                        <div className="h-3 bg-black/[0.06] rounded w-1/3"></div>
                      </div>
                      <div className="h-8 bg-black/[0.06] rounded w-16"></div>
                    </div>
                  ))}
                </div>
              ) : filteredVisits.length === 0 ? (
                <div className="py-16 text-center text-[#86868b] bg-black/[0.04] border border-black/5 rounded-xl">
                  <p className="font-bold text-xs uppercase tracking-wider text-[#86868b]">Žádné záznamy</p>
                </div>
              ) : (
                <div className="divide-y divide-black/5">
                  {filteredVisits.map((visit) => {
                    const isActive = visit.status === "V budově";
                    return (
                      <div
                        key={visit.id}
                        className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4 -mx-2 px-2 rounded-xl hover:bg-black/[0.06] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Avatar */}
                          <div
                            className={`h-10 w-10 rounded-xl flex items-center justify-center text-[#0071e3] font-bold text-sm shrink-0 ${
                              isActive ? "" : "opacity-50 grayscale"
                            }`}
                            style={{ background: "rgba(0,113,227,0.12)" }}
                          >
                            {visit.prijmeni.charAt(0).toUpperCase()}
                          </div>

                          <div className="space-y-1.5 min-w-0">
                            {/* Name / Organization */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-[#1d1d1f] text-sm">
                                {visit.prijmeni} {visit.jmeno}
                              </span>
                              {visit.organizace && (
                                <span className="chip chip-slate">
                                  <Building2 className="h-2.5 w-2.5 text-[#86868b]" />
                                  {visit.organizace}
                                </span>
                              )}
                            </div>

                            {/* Ledger details */}
                            <div className="flex flex-wrap items-center gap-1.5 font-mono">
                              <span className="chip chip-slate text-[10px]">
                                <Clock className="h-3 w-3 text-[#86868b]" />
                                <span>{formatCzechTime(visit.cas_prichodu)}</span>
                                {!isActive && visit.cas_odchodu && (
                                  <>
                                    <span className="text-[#86868b] font-light">•</span>
                                    <span>{formatCzechTime(visit.cas_odchodu)}</span>
                                  </>
                                )}
                              </span>
                              <span className="chip chip-indigo text-[10px]">
                                Doba: {getElapsedTime(visit.cas_prichodu, visit.cas_odchodu)}
                              </span>
                              {visit.spz && (
                                <span className="chip chip-slate text-[10px] uppercase tracking-wider">
                                  <Car className="h-3 w-3 text-[#86868b]" />
                                  {visit.spz}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="shrink-0">
                          {isActive ? (
                            <button
                              onClick={() => handleCheckout(visit.id, `${visit.jmeno} ${visit.prijmeni}`)}
                              disabled={isCheckingOut === visit.id}
                              className="btn-danger !px-3.5 !py-1.5 !text-xs"
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
                            <div className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest pr-2 font-mono">
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
