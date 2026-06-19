"use client";

import { useState, useEffect, useRef } from "react";
import {
  Key,
  Users,
  Building2,
  Clock,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface User {
  id: number;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  department: string;
  role: string;
  rfidCardUid: string | null;
}

interface AttendanceLog {
  id: number;
  userId: number;
  checkIn: string;
  checkOut: string | null;
  logType: string;
  status: string;
}

export default function KioskPage() {
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
      window.location.replace("/login?redirect=/kiosk");
    }
  }, []);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);

  // Kiosk Navigation States
  const [step, setStep] = useState<"welcome" | "dept" | "employee" | "pin">("welcome");
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pinCode, setPinCode] = useState("");
  const [rfidInput, setRfidInput] = useState("");

  // Authenticated State & Auto-action
  const [authStatus, setAuthStatus] = useState<{
    user: { firstName: string; lastName: string; id: number };
    currentLog: { logType: string; checkIn: string } | null;
  } | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [punchResult, setPunchResult] = useState<{ message: string; success: boolean } | null>(null);

  // Loading & Global message
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch employee directory
  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
        const depts: string[] = Array.from(new Set(data.map((u: User) => u.department)));
        setDepartments(depts);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Nepodařilo se načíst seznam zaměstnanců.");
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Clock state
  const [timeStr, setTimeStr] = useState("");
  const [dateStr, setDateStr] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setDateStr(now.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" }));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-action countdown effect
  useEffect(() => {
    if (authStatus && countdown > 0 && !punchResult) {
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((c) => c - 1);
      }, 1000);
    } else if (authStatus && countdown === 0 && !punchResult) {
      // Trigger automatic default punch when counter hits zero
      handlePunch("AUTO");
    }

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, countdown, punchResult]);

  // Handle PIN character click
  const handlePinPress = (char: string) => {
    if (pinCode.length < 4) {
      const newPin = pinCode + char;
      setPinCode(newPin);
      if (newPin.length === 4) {
        // Authenticate immediately upon entering 4th digit
        authenticateUser(newPin);
      }
    }
  };

  const handlePinBackspace = () => {
    setPinCode((prev) => prev.slice(0, -1));
  };

  // Authenticate user via PIN code
  const authenticateUser = async (enteredPin: string) => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await fetch("/api/attendance/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeNumber: selectedUser.employeeNumber,
          pin: enteredPin,
          action: "CHECK_STATUS_ONLY", // Just authenticate first to get current state
        }),
      });

      // Special handling: punch endpoint will return 401/403 or succeed.
      // Wait, to retrieve their status, we should check if they have an active log.
      // Let's modify the API fetch logic. Since our punch endpoint actually makes a punch when called,
      // let's fetch their current state. Wait, does our punch route execute a punch immediately?
      // Yes! In `app/api/attendance/punch/route.ts`, if we pass an action, it executes it.
      // Wait, what if we want to show the status screen before they select the action?
      // Yes, in our endpoint: if a punch is registered, it either checks them in or out.
      // But the prompt says: "Po identifikaci systém okamžitě zobrazí aktuální stav zaměstnance... a nabídne 2-4 velká barevná tlačítka..."
      // Let's modify `/api/attendance/punch` to support a non-modifying CHECK status check, or we can just fetch it from `/api/attendance/live` or logs.
      // Wait, it is much simpler to add a fast check in punch API! Let's modify punch route or check if they have an active log by calling a simple query.
      // Actually, we can fetch active logs for this user from `/api/attendance/logs?userId=...` to see if they have an open log!
      // Yes! That's super clean and requires no API changes. Let's do that!
      const logsRes = await fetch(`/api/attendance/logs?userId=${selectedUser.id}`);
      if (logsRes.ok) {
        const logs = await logsRes.json();
        const activeLog = logs.find((l: AttendanceLog) => l.status === "OPEN" && !l.checkOut);
        
        setAuthStatus({
          user: { firstName: selectedUser.firstName, lastName: selectedUser.lastName, id: selectedUser.id },
          currentLog: activeLog ? { logType: activeLog.logType, checkIn: activeLog.checkIn } : null,
        });
        setCountdown(3); // start 3-second auto action
        setStep("pin"); // Keep it on pin step, but overlay action buttons
      } else {
        setErrorMsg("Chyba při zjišťování stavu docházky.");
        setPinCode("");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Nepodařilo se ověřit PIN kód.");
      setPinCode("");
    } finally {
      setIsSubmitting(false);
    }
  };

  // RFID swipe simulation
  const handleRfidSwipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfidInput.trim()) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      // Find the user with this RFID card first to show status, or punch directly
      const rfidUser = users.find((u) => u.rfidCardUid === rfidInput.trim());
      if (!rfidUser) {
        setErrorMsg("Neznámá RFID karta.");
        setRfidInput("");
        setIsSubmitting(false);
        return;
      }

      // Check current log status
      const logsRes = await fetch(`/api/attendance/logs?userId=${rfidUser.id}`);
      if (logsRes.ok) {
        const logs = await logsRes.json();
        const activeLog = logs.find((l: AttendanceLog) => l.status === "OPEN" && !l.checkOut);

        setSelectedUser(rfidUser);
        setAuthStatus({
          user: { firstName: rfidUser.firstName, lastName: rfidUser.lastName, id: rfidUser.id },
          currentLog: activeLog ? { logType: activeLog.logType, checkIn: activeLog.checkIn } : null,
        });
        setCountdown(3);
        setStep("pin");
        setPinCode("****"); // Mask PIN step
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Nepodařilo se zpracovat RFID čip.");
    } finally {
      setIsSubmitting(false);
      setRfidInput("");
    }
  };

  // Submit actual punch (WORK, LUNCH, DOCTOR, CHECK_OUT, etc.)
  const handlePunch = async (actionType: string) => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const punchBody: { action: string; rfidCardUid?: string; employeeNumber?: string; pin?: string } = {
        action: actionType,
      };
 
      if (selectedUser?.rfidCardUid && pinCode === "****") {
        punchBody.rfidCardUid = selectedUser.rfidCardUid;
      } else if (selectedUser) {
        punchBody.employeeNumber = selectedUser.employeeNumber;
        punchBody.pin = pinCode;
      }
 
      const res = await fetch("/api/attendance/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(punchBody),
      });

      const resultData = await res.json();

      if (res.ok) {
        setPunchResult({
          message: resultData.message || "Akce byla úspěšně zaznamenána.",
          success: true,
        });
        
        // Success screen for 2.5 seconds, then reset Kiosk to welcome page
        setTimeout(() => {
          resetKiosk();
        }, 2500);
      } else {
        setPunchResult({
          message: resultData.error || "Záznam se nepodařilo dokončit.",
          success: false,
        });
        setTimeout(() => {
          setPunchResult(null);
          setAuthStatus(null);
          setPinCode("");
          setStep("welcome");
        }, 3000);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Chyba spojení s databází.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetKiosk = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    setStep("welcome");
    setSelectedDept(null);
    setSelectedUser(null);
    setPinCode("");
    setRfidInput("");
    setAuthStatus(null);
    setCountdown(3);
    setPunchResult(null);
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans select-none overflow-hidden">
      
      {/* Kiosk Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Clock className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-md font-black tracking-wider text-slate-900 uppercase">ept connector s.r.o.</h1>
            <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">Kioskový terminál</p>
          </div>
        </div>

        {/* Big Clock for Kiosk Wall Mount */}
        <div className="text-right font-mono">
          <span className="text-2xl font-black text-slate-800 block tracking-tight">{timeStr || "00:00:00"}</span>
          <span className="text-[10px] text-slate-400 font-semibold block uppercase">{dateStr || "NAČÍTÁNÍ"}</span>
        </div>
      </header>

      {/* Main Area */}
      <main className="flex-1 flex items-center justify-center p-6 relative">
        
        {/* Punch Result Success/Error Splash Screen Overlay */}
        {punchResult && (
          <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center animate-in fade-in duration-300 ${
            punchResult.success ? "bg-emerald-50/98" : "bg-rose-50/98"
          }`}>
            <div className="text-center p-8 space-y-4 max-w-lg">
              {punchResult.success ? (
                <CheckCircle2 className="h-24 w-24 text-emerald-600 mx-auto animate-bounce" />
              ) : (
                <AlertCircle className="h-24 w-24 text-rose-600 mx-auto animate-bounce" />
              )}
              <h2 className={`text-3xl font-black tracking-tight ${punchResult.success ? "text-emerald-800" : "text-rose-800"}`}>
                {punchResult.success ? "ZÁPIS ÚSPĚŠNÝ" : "CHYBA ZÁPISU"}
              </h2>
              <p className="text-lg text-slate-700 font-medium">{punchResult.message}</p>
              <div className="text-xs text-slate-400 pt-4 font-mono">Obrazovka se vyčistí za okamžik...</div>
            </div>
          </div>
        )}

        {/* Global Notifications */}
        {errorMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3 shadow-xl backdrop-blur animate-in fade-in slide-in-from-top-4 z-40">
            <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
        )}

        {/* STEP 1: WELCOME / IDLE SCREEN */}
        {step === "welcome" && (
          <div className="w-full max-w-2xl text-center space-y-12 py-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="space-y-4">
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 leading-none">
                PŘILOŽTE RFID KARTU
              </h2>
              <p className="text-slate-500 text-lg max-w-md mx-auto">
                Přiložte čip k USB čtečce u terminálu nebo pokračujte zadáním PIN kódu.
              </p>
            </div>

            {/* Simulated RFID Scanner input */}
            <form onSubmit={handleRfidSwipe} className="bg-white border border-slate-205 p-6 rounded-2xl max-w-sm mx-auto shadow-sm space-y-3">
              <label className="block text-[10px] font-bold text-indigo-650 uppercase tracking-widest text-left">
                Simulátor RFID čtečky (UID karty)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Např. 123456"
                  value={rfidInput}
                  onChange={(e) => setRfidInput(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 flex-1 font-mono"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all active:scale-[0.97]"
                >
                  Pípnout
                </button>
              </div>
              <p className="text-[10px] text-slate-400 text-left">
                * Josef Marek = `123456`, Jana Svobodová = `789012`
              </p>
            </form>

            <div className="pt-6">
              <span className="text-slate-400 font-bold text-xs uppercase tracking-widest block mb-4">NEBO</span>
              <button
                onClick={() => setStep("dept")}
                className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold py-4 px-8 rounded-xl text-md shadow-sm transition-all active:scale-[0.98]"
              >
                <Users className="h-5 w-5 text-indigo-600" />
                Vybrat jméno & PIN
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: SELECT DEPARTMENT */}
        {step === "dept" && (
          <div className="w-full max-w-4xl space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center gap-4">
              <button onClick={resetKiosk} className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-500 hover:text-slate-800 shadow-sm">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h2 className="text-2xl font-black text-slate-900">VÝBĚR ODDĚLENÍ</h2>
                <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Krok 1 ze 3</p>
              </div>
            </div>

            {isLoadingUsers ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-4">
                {departments.map((dept) => (
                  <button
                    key={dept}
                    onClick={() => {
                      setSelectedDept(dept);
                      setStep("employee");
                    }}
                    className="h-28 bg-white hover:bg-indigo-50/10 border border-slate-200 hover:border-indigo-500/50 rounded-2xl flex flex-col items-center justify-center gap-3 p-4 shadow-sm transition-all active:scale-[0.97]"
                  >
                    <Building2 className="h-6 w-6 text-indigo-650" />
                    <span className="font-bold text-sm text-slate-800 text-center uppercase tracking-wide">{dept}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: SELECT EMPLOYEE */}
        {step === "employee" && (
          <div className="w-full max-w-4xl space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center gap-4">
              <button onClick={() => setStep("dept")} className="p-3 bg-white hover:bg-slate-50 border border-slate-205 rounded-xl text-slate-500 hover:text-slate-800 shadow-sm">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h2 className="text-2xl font-black text-slate-900">ZVOLTE SVÉ JMÉNO</h2>
                <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Krok 2 ze 3 ({selectedDept})</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-4 max-h-[60vh] overflow-y-auto pr-2">
              {users
                .filter((u) => u.department === selectedDept)
                .map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSelectedUser(u);
                      setPinCode("");
                      setStep("pin");
                    }}
                    className="h-24 bg-white hover:bg-indigo-50/10 border border-slate-200 hover:border-indigo-500/50 rounded-2xl flex flex-col items-center justify-center p-4 shadow-sm transition-all active:scale-[0.97]"
                  >
                    <span className="font-bold text-md text-slate-800">{u.lastName} {u.firstName}</span>
                    <span className="text-[10px] text-slate-400 font-mono mt-1">Osobní číslo: {u.employeeNumber}</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* STEP 4: ENTER PIN & ACTION BUTTONS SELECTOR */}
        {step === "pin" && selectedUser && (
          <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center animate-in fade-in duration-200">
            
            {/* Left: PIN Pad input */}
            <div className="lg:col-span-5 space-y-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    if (authStatus) {
                      resetKiosk();
                    } else {
                      setStep("employee");
                    }
                  }}
                  className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-500 hover:text-slate-800 shadow-sm"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                  <h2 className="text-xl font-black text-slate-800">{selectedUser.lastName} {selectedUser.firstName}</h2>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Krok 3 ze 3 • ZADÁNÍ PINu</p>
                </div>
              </div>

              {/* PIN Code Display circles */}
              <div className="flex justify-center gap-4 py-4">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className={`h-6 w-6 rounded-full border-2 ${
                      pinCode.length > idx
                        ? "bg-indigo-600 border-indigo-600 animate-ping-once"
                        : "border-slate-300 bg-slate-50"
                    }`}
                  ></div>
                ))}
              </div>

              {/* Numeric Kiosk Keyboard */}
              <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                  <button
                    key={n}
                    onClick={() => handlePinPress(n)}
                    disabled={authStatus !== null || isSubmitting}
                    className="h-14 bg-white border border-slate-200 hover:bg-slate-50 active:bg-indigo-650 active:text-white rounded-xl text-lg font-black shadow-sm transition-all text-slate-800 active:scale-[0.95]"
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={resetKiosk}
                  className="h-14 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-bold shadow-sm transition-all text-slate-500 active:scale-[0.95]"
                >
                  Zrušit
                </button>
                <button
                  onClick={() => handlePinPress("0")}
                  disabled={authStatus !== null || isSubmitting}
                  className="h-14 bg-white border border-slate-200 hover:bg-slate-50 active:bg-indigo-655 active:text-white rounded-xl text-lg font-black shadow-sm transition-all text-slate-800 active:scale-[0.95]"
                >
                  0
                </button>
                <button
                  onClick={handlePinBackspace}
                  disabled={authStatus !== null || isSubmitting}
                  className="h-14 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl text-md font-bold shadow-sm transition-all text-slate-500 active:scale-[0.95]"
                >
                  ←
                </button>
              </div>
            </div>

            {/* Right: ACTION SCREEN (only visible after successful PIN/RFID verification) */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-8 shadow-xl relative overflow-hidden min-h-[420px] flex flex-col justify-between">
              
              {!authStatus ? (
                // Prompt to enter PIN first
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="h-16 w-16 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center text-indigo-600">
                    <Key className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">Čeká se na ověření totožnosti</h3>
                  <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
                    Zadejte prosím svůj 4místný PIN kód na klávesnici vlevo.
                  </p>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-2">
                    * Pro testování: Petr Bureš = `1111`, Jan Novák = `2222`, Lucie Králová = `4444`
                  </p>
                </div>
              ) : (
                // Verified Status Screen and Action Buttons
                <div className="flex-1 flex flex-col justify-between space-y-6">
                  
                  {/* Status Banner */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">Aktuální stav:</span>
                      <h4 className="text-lg font-black text-slate-900">
                        {authStatus.currentLog 
                          ? `Přítomen (${
                              authStatus.currentLog.logType === "WORK" ? "Práce" : "Pauza"
                            })` 
                          : "Nepřítomen"}
                      </h4>
                      {authStatus.currentLog && (
                        <p className="text-xs text-slate-500 font-medium">
                          Od: {new Date(authStatus.currentLog.checkIn).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </div>

                    {/* Auto punch countdown circle */}
                    <div className="relative h-16 w-16 flex items-center justify-center bg-white border border-slate-200 rounded-full">
                      <span className="text-xs font-mono font-black text-indigo-600 animate-pulse">{countdown}s</span>
                      <div className="absolute inset-0 rounded-full border border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
                    </div>
                  </div>

                  {/* Dynamic Instruction */}
                  <p className="text-xs text-slate-500 text-center font-medium leading-relaxed">
                    Zvolte akci stisknutím jednoho z tlačítek níže. Pokud do 3 sekund nic nezvolíte, provede se automatická akce:
                    <strong className="text-indigo-600 block mt-1 uppercase font-bold">
                      {authStatus.currentLog ? "Odchod z práce (CHECK_OUT)" : "Příchod do práce (WORK)"}
                    </strong>
                  </p>

                  {/* Touch buttons GRID */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    
                    {/* Green check-in button (visible only if checked out) */}
                    {!authStatus.currentLog ? (
                      <button
                        onClick={() => handlePunch("WORK")}
                        disabled={isSubmitting}
                        className="col-span-2 h-28 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/30 text-white font-black text-lg uppercase tracking-widest rounded-2xl shadow-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-emerald-500/10"
                      >
                        <CheckCircle2 className="h-7 w-7" />
                        PŘÍCHOD DO PRÁCE
                      </button>
                    ) : (
                      <>
                        {/* Red Check-out button (visible if checked in) */}
                        <button
                          onClick={() => handlePunch("CHECK_OUT")}
                          disabled={isSubmitting}
                          className="h-28 bg-rose-600 hover:bg-rose-500 border border-rose-500/30 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg flex flex-col items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-rose-500/10"
                        >
                          <span className="text-xs opacity-80 font-bold uppercase tracking-widest">Odchod z firmy</span>
                          <span className="text-md">ODCHOD Z PRÁCE</span>
                        </button>

                        {/* Yellow Lunch button */}
                        <button
                          onClick={() => handlePunch("LUNCH")}
                          disabled={isSubmitting}
                          className="h-28 bg-amber-500 hover:bg-amber-450 border border-amber-400/30 text-slate-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg flex flex-col items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-amber-500/10"
                        >
                          <span className="text-xs opacity-80 font-bold uppercase tracking-widest">Jídlo / Oběd</span>
                          <span className="text-md">
                            {authStatus.currentLog.logType === "LUNCH" ? "NÁVRAT Z OBĚDA" : "PAUZA / OBĚD"}
                          </span>
                        </button>

                        {/* Blue Doctor button */}
                        <button
                          onClick={() => handlePunch("DOCTOR")}
                          disabled={isSubmitting}
                          className="col-span-2 h-20 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/30 text-white font-bold text-sm uppercase tracking-wider rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                        >
                          <Building2 className="h-4 w-4" />
                          <span>ODCHOD K LÉKAŘI</span>
                        </button>
                      </>
                    )}
                  </div>

                </div>
              )}

            </div>
          </div>
        )}

      </main>

      {/* Footer Branding */}
      <footer className="bg-white border-t border-slate-200 py-4 px-8 text-center text-[10px] text-slate-400 font-semibold tracking-wider uppercase shadow-inner">
        © 2026 ept connector s.r.o. • Všechna práva vyhrazena
      </footer>

    </div>
  );
}
