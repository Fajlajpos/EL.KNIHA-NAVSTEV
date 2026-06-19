"use client";

import { useState, useEffect, useRef } from "react";
import {
  Calendar,
  AlertTriangle,
  Send,
  Loader2,
  CheckCircle,
  XCircle,
  HelpCircle,
  FileText,
  PlusCircle,
  Bot,
  X,
} from "lucide-react";

interface Employee {
  id: number;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  department: string;
  role: string;
  hourlyFund: number;
}

interface PortalShift {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  note: string | null;
}

interface AttendanceLog {
  id: number;
  userId: number;
  checkIn: string;
  checkOut: string | null;
  logType: string;
  status: string; // OK, OPEN, ERROR, MANUALLY_EDITED
  note: string | null;
  originalCheckIn: string | null;
  originalCheckOut: string | null;
}

interface CorrectionRequest {
  id: number;
  userId: number;
  attendanceLogId: number | null;
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  requestedLogType: string;
  reason: string;
  status: string; // PENDING, APPROVED, REJECTED
  createdAt: string;
}

export default function PortalPage() {
  const [isAuthorized, setIsAuthorized] = useState(false);

  // AI Chatbot States
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: "Ahoj! Jsem Váš inteligentní asistent **CHECKNI TO AI**.\n\nJsem propojen s Vaším osobním profilem docházky. Můžete se mě zeptat na cokoliv ohledně Vašich dnešních směn, odpracovaných hodin, přesčasů nebo plánu na další dny.\n\n*Vyzkoušejte rychlé dotazy dole!*" }
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

      // Check bullet list
      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        const rawContent = line.replace(/^[-*]\s+/, "");
        let itemContent: React.ReactNode = rawContent;
        if (rawContent.includes("**")) {
          const parts = rawContent.split("**");
          itemContent = parts.map((part, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="font-bold text-slate-900">{part}</strong> : part);
        }
        content = (
          <li key={idx} className="list-disc list-inside ml-1 my-0.5 text-slate-700">
            {itemContent}
          </li>
        );
      } else if (typeof content === "string" && content.includes("**")) {
        const parts = content.split("**");
        content = parts.map((part, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="font-bold text-slate-955">{part}</strong> : part);
      }

      return <div key={idx} className="min-h-[1.25em]">{content}</div>;
    });
  };
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeEmployee, setActiveEmployee] = useState<Employee | null>(null);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [shifts, setShifts] = useState<PortalShift[]>([]);
  const [activeTab, setActiveTab] = useState<"attendance" | "shifts">("attendance");

  const [loggedInEmployeeNumber, setLoggedInEmployeeNumber] = useState<string | null>(null);
  const [loggedInRole, setLoggedInRole] = useState<string | null>(null);

  // Auth Verification
  useEffect(() => {
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(";").shift();
      return null;
    };

    const role = getCookie("userRole") || sessionStorage.getItem("userRole");
    const empNum = getCookie("userEmployeeNumber") || sessionStorage.getItem("userEmployeeNumber");
    if (role === "EMPLOYEE" || role === "CEO") {
      setIsAuthorized(true);
      setLoggedInRole(role);
      setLoggedInEmployeeNumber(empNum || null);
    } else {
      window.location.replace("/login?redirect=/portal");
    }
  }, []);

  // Form State
  const [requestMode, setRequestMode] = useState<"new" | "edit">("new");
  const [selectedLogId, setSelectedLogId] = useState<string>("");
  const [reqDate, setReqDate] = useState("");
  const [reqCheckInTime, setReqCheckInTime] = useState("");
  const [reqCheckOutTime, setReqCheckOutTime] = useState("");
  const [reqType, setReqType] = useState("WORK");
  const [reqReason, setReqReason] = useState("");

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; success: boolean } | null>(null);

  // Load employee directory
  const loadEmployees = async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
        // Auto-select logged-in employee by employeeNumber
        if (loggedInEmployeeNumber) {
          const me = data.find((e: Employee) => e.employeeNumber === loggedInEmployeeNumber);
          if (me) {
            setActiveEmployee(me);
            return;
          }
        }
        if (data.length > 0) {
          setActiveEmployee(data[0]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Load data for active employee
  const loadEmployeeData = async () => {
    if (!activeEmployee) return;
    setIsLoading(true);
    try {
      // 1. Fetch attendance logs
      const logsRes = await fetch(`/api/attendance/logs?userId=${activeEmployee.id}`);
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData);
      }

      // 2. Fetch correction requests
      const requestsRes = await fetch(`/api/portal/requests?userId=${activeEmployee.id}`);
      if (requestsRes.ok) {
        const reqData = await requestsRes.json();
        setRequests(reqData);
      }

      // 3. Fetch shifts
      const shiftsRes = await fetch(`/api/shifts?userId=${activeEmployee.id}`);
      if (shiftsRes.ok) {
        const shiftsData = await shiftsRes.json();
        setShifts(shiftsData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isAuthorized) loadEmployees();
  }, [isAuthorized, loggedInEmployeeNumber]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadEmployeeData();
    // Reset form fields
    setSelectedLogId("");
    setReqDate("");
    setReqCheckInTime("");
    setReqCheckOutTime("");
    setReqReason("");
    setFeedback(null);
  }, [activeEmployee]);

  // Submit Correction Request
  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEmployee) return;
    if (!reqReason.trim()) {
      setFeedback({ msg: "Důvod opravy je povinný.", success: false });
      return;
    }

    let requestedCheckIn = null;
    let requestedCheckOut = null;

    if (requestMode === "new") {
      if (!reqDate || !reqCheckInTime) {
        setFeedback({ msg: "Zadejte datum a čas příchodu.", success: false });
        return;
      }
      requestedCheckIn = new Date(`${reqDate}T${reqCheckInTime}`).toISOString();
      if (reqCheckOutTime) {
        requestedCheckOut = new Date(`${reqDate}T${reqCheckOutTime}`).toISOString();
      }
    } else {
      // Edit mode
      const targetLog = logs.find((l) => l.id === parseInt(selectedLogId, 10));
      if (!targetLog) {
        setFeedback({ msg: "Zvolte platný záznam k opravě.", success: false });
        return;
      }
      const baseDate = new Date(targetLog.checkIn).toISOString().split("T")[0];
      if (reqCheckInTime) {
        requestedCheckIn = new Date(`${baseDate}T${reqCheckInTime}`).toISOString();
      }
      if (reqCheckOutTime) {
        requestedCheckOut = new Date(`${baseDate}T${reqCheckOutTime}`).toISOString();
      }
    }

    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/portal/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: activeEmployee.id,
          attendanceLogId: requestMode === "edit" ? parseInt(selectedLogId, 10) : null,
          requestedCheckIn,
          requestedCheckOut,
          requestedLogType: reqType,
          reason: reqReason,
        }),
      });

      if (res.ok) {
        setFeedback({ msg: "Žádost o opravu byla odeslána ke schválení.", success: true });
        setReqDate("");
        setReqCheckInTime("");
        setReqCheckOutTime("");
        setReqReason("");
        setSelectedLogId("");
        loadEmployeeData();
      } else {
        const errorData = await res.json();
        setFeedback({ msg: errorData.error || "Chyba při odesílání žádosti.", success: false });
      }
    } catch (err) {
      console.error(err);
      setFeedback({ msg: "Chyba spojení se serverem.", success: false });
    } finally {
      setIsLoading(false);
    }
  };

  // Pre-fill form values when editing a log
  const handleSelectLogChange = (logIdVal: string) => {
    setSelectedLogId(logIdVal);
    if (!logIdVal) {
      setReqCheckInTime("");
      setReqCheckOutTime("");
      return;
    }
    const log = logs.find((l) => l.id === parseInt(logIdVal, 10));
    if (log) {
      const inTime = new Date(log.checkIn).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
      const outTime = log.checkOut 
        ? new Date(log.checkOut).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }) 
        : "";
      setReqCheckInTime(inTime);
      setReqCheckOutTime(outTime);
      setReqType(log.logType);
    }
  };

  // Hour tracking calculations
  const calculateTotalHours = () => {
    let totalMs = 0;
    logs.forEach((log) => {
      if (log.checkOut && log.status !== "ERROR") {
        const diff = new Date(log.checkOut).getTime() - new Date(log.checkIn).getTime();
        // Lunch breaks are separate logs in our system, so we don't count LUNCH logs as work hours!
        if (log.logType === "WORK") {
          totalMs += diff;
        }
      }
    });
    return parseFloat((totalMs / (1000 * 60 * 60)).toFixed(2));
  };

  const monthlyFundTarget = activeEmployee ? activeEmployee.hourlyFund * 4 : 160.0;
  const hoursWorked = calculateTotalHours();
  const balance = hoursWorked - monthlyFundTarget;
  const progressPercent = Math.min(100, Math.max(0, (hoursWorked / monthlyFundTarget) * 100));

  // Helper date formatter
  const formatDateCzech = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" });
  };

  const formatTimeCzech = (isoString: string | null) => {
    if (!isoString) return "--:--";
    return new Date(isoString).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
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
      
      {/* Header Info Panel */}
      <header className="bg-white border-b border-slate-200 px-6 py-6 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img 
              src="/logo.png" 
              alt="Logo CHECKNI TO" 
              className="h-9 w-auto object-contain" 
            />
            <div className="h-6 w-[1px] bg-slate-200 hidden sm:block"></div>
            <div>
              <h1 className="text-md font-black text-slate-900 uppercase tracking-wide">Zaměstnanecký portál</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Přehled docházky a plánování</p>
            </div>
          </div>

          {/* Employee identity */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl self-start sm:self-auto">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Přihlášen jako:</span>
            {loggedInRole === "CEO" ? (
              <select
                value={activeEmployee?.id || ""}
                onChange={(e) => {
                  const emp = employees.find((emp) => emp.id === parseInt(e.target.value, 10));
                  if (emp) setActiveEmployee(emp);
                }}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id} className="bg-white text-slate-800">
                    {emp.lastName} {emp.firstName} ({emp.department})
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-bold text-slate-800">
                {activeEmployee ? `${activeEmployee.lastName} ${activeEmployee.firstName}` : "..."}
              </span>
            )}
          </div>
        </div>
      </header>

      {activeEmployee && (
        <main className="max-w-6xl mx-auto px-4 mt-8 space-y-8">

          {/* Main Tab Selector */}
          <div className="flex border-b border-slate-200 gap-6">
            <button
              onClick={() => setActiveTab("attendance")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                activeTab === "attendance"
                  ? "border-indigo-600 text-indigo-600 font-black"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Přehled docházky
            </button>
            <button
              onClick={() => setActiveTab("shifts")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                activeTab === "shifts"
                  ? "border-indigo-600 text-indigo-600 font-black"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Můj plán směn ({shifts.length})
            </button>
          </div>

          {activeTab === "attendance" ? (
            <>
              {/* STATS TILES: Hours tracking progress */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch">
            
            {/* Hours Fund Card */}
            <div className="md:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600"></div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Plnění fondu (Aktuální měsíc)</h3>
                  <span className="text-xs font-bold text-slate-500 font-mono">
                    {hoursWorked} / {monthlyFundTarget} hod ({progressPercent.toFixed(1)}%)
                  </span>
                </div>
                {/* Progress bar container */}
                <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                  <div
                    style={{ width: `${progressPercent}%` }}
                    className={`h-full transition-all duration-500 ${
                      progressPercent >= 100 
                        ? "bg-emerald-500" 
                        : progressPercent > 50 
                        ? "bg-indigo-600" 
                        : "bg-amber-500"
                    }`}
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-200 mt-6 text-center font-mono">
                <div>
                  <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest">Odpracováno</span>
                  <span className="text-lg font-black text-slate-900">{hoursWorked}h</span>
                </div>
                <div className="border-x border-slate-200">
                  <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest">Měsíční Fond</span>
                  <span className="text-lg font-black text-slate-700">{monthlyFundTarget}h</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 font-bold uppercase tracking-widest">Saldo / Přesčasy</span>
                  <span className={`text-lg font-black ${balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {balance >= 0 ? `+${balance.toFixed(2)}h` : `${balance.toFixed(2)}h`}
                  </span>
                </div>
              </div>
            </div>

            {/* Profile info card */}
            <div className="md:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600"></div>
              
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Zaměstnanec</span>
                <h2 className="text-xl font-black text-slate-900 leading-tight">
                  {activeEmployee.firstName} {activeEmployee.lastName}
                </h2>
                <div className="mt-4 space-y-2 text-xs font-mono text-slate-600">
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span>Osobní číslo:</span>
                    <strong className="text-slate-800">{activeEmployee.employeeNumber}</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span>Oddělení:</span>
                    <strong className="text-slate-800">{activeEmployee.department}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Role:</span>
                    <strong className="text-slate-800">{activeEmployee.role}</strong>
                  </div>
                </div>
              </div>
              
              <div className="text-[10px] text-slate-650 bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-center font-medium mt-4">
                Týdenní úvazek: {activeEmployee.hourlyFund} hodin
              </div>
            </div>
          </div>

          {/* TWO COLUMN CONTENT AREA */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT: Attendance logs for month */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600"></div>
              
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-650" />
                Historie zápisů (Aktuální měsíc)
              </h2>

              {isLoading && logs.length === 0 ? (
                <div className="flex justify-center items-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                </div>
              ) : logs.length === 0 ? (
                <div className="py-20 text-center text-slate-500 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider">
                  Žádné docházkové zápisy v tomto období.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-2">
                  {logs.map((log) => {
                    const isLunch = log.logType === "LUNCH";
                    const isDoctor = log.logType === "DOCTOR";
                    const isTrip = log.logType === "BUSINESS_TRIP";
                    const isError = log.status === "ERROR";
                    const isEdited = log.status === "MANUALLY_EDITED";

                    let durationStr = "--";
                    if (log.checkOut) {
                      const ms = new Date(log.checkOut).getTime() - new Date(log.checkIn).getTime();
                      const totalMins = Math.floor(ms / 60000);
                      const hrs = Math.floor(totalMins / 60);
                      const mins = totalMins % 60;
                      durationStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
                    }

                    return (
                      <div key={log.id} className="py-3 flex items-center justify-between gap-4 text-xs font-mono">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">{formatDateCzech(log.checkIn)}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isLunch 
                                ? "bg-amber-50 border border-amber-200 text-amber-800" 
                                : isDoctor 
                                ? "bg-sky-50 border border-sky-200 text-sky-850"
                                : isTrip
                                ? "bg-purple-50 border border-purple-200 text-purple-800"
                                : "bg-slate-100 border border-slate-250 text-slate-700"
                            }`}>
                              {log.logType}
                            </span>
                            {isError && (
                              <span className="bg-rose-50 border border-rose-200 text-rose-700 px-2 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5">
                                <AlertTriangle className="h-3 w-3 text-rose-600" />
                                CHYBA
                              </span>
                            )}
                            {isEdited && (
                              <span className="bg-indigo-550/10 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded text-[9px] font-bold" title={log.note || "Upraveno"}>
                                KOREKCE
                              </span>
                            )}
                          </div>
                          <div className="text-slate-500 font-sans">
                            Příchod: <strong className="text-slate-800 font-mono">{formatTimeCzech(log.checkIn)}</strong>
                            {" • "}
                            Odchod: <strong className="text-slate-800 font-mono">{formatTimeCzech(log.checkOut)}</strong>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="block font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-[10px]">
                            {durationStr}
                          </span>
                          {log.note && (
                            <span className="block text-[9px] text-slate-400 mt-1 text-right max-w-[120px] truncate" title={log.note}>
                              {log.note}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT: Correction request form & History */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Form Block */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600"></div>
                
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <PlusCircle className="h-4 w-4 text-indigo-650" />
                  Žádost o opravu docházky
                </h2>

                {feedback && (
                  <div className={`mb-4 p-3 rounded-xl border text-xs flex items-center gap-2.5 font-medium animate-in fade-in ${
                    feedback.success 
                      ? "bg-emerald-550/10 border-emerald-200 text-emerald-800" 
                      : "bg-rose-50 border-rose-200 text-rose-800"
                  }`}>
                    {feedback.success ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-650" />}
                    <span>{feedback.msg}</span>
                  </div>
                )}

                <form onSubmit={handleSubmitCorrection} className="space-y-4">
                  
                  {/* Mode Selector */}
                  <div className="flex bg-slate-100 border border-slate-200 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setRequestMode("new");
                        setSelectedLogId("");
                      }}
                      className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase rounded-md transition-colors ${
                        requestMode === "new" ? "bg-white text-slate-800 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Zadat nový den
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequestMode("edit")}
                      className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase rounded-md transition-colors ${
                        requestMode === "edit" ? "bg-white text-slate-800 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Opravit existující
                    </button>
                  </div>

                  {requestMode === "edit" ? (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                        Záznam k opravě
                      </label>
                      <select
                        value={selectedLogId}
                        onChange={(e) => handleSelectLogChange(e.target.value)}
                        required={requestMode === "edit"}
                        className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
                      >
                        <option value="" className="text-slate-500">-- Vyberte chybný záznam --</option>
                        {logs.map((log) => (
                          <option key={log.id} value={log.id} className="text-slate-800">
                            {formatDateCzech(log.checkIn)} ({log.logType}) | Od: {formatTimeCzech(log.checkIn)} {log.checkOut ? `do ${formatTimeCzech(log.checkOut)}` : "(Otevřený)"}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                        Datum zápisu
                      </label>
                      <input
                        type="date"
                        value={reqDate}
                        onChange={(e) => setReqDate(e.target.value)}
                        required={requestMode === "new"}
                        className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                        Nový Příchod
                      </label>
                      <input
                        type="time"
                        value={reqCheckInTime}
                        onChange={(e) => setReqCheckInTime(e.target.value)}
                        required={requestMode === "new"}
                        className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                        Nový Odchod
                      </label>
                      <input
                        type="time"
                        value={reqCheckOutTime}
                        onChange={(e) => setReqCheckOutTime(e.target.value)}
                        className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                        Typ práce
                      </label>
                      <select
                        value={reqType}
                        onChange={(e) => setReqType(e.target.value)}
                        className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
                      >
                        <option value="WORK" className="text-slate-800">WORK (Práce)</option>
                        <option value="LUNCH" className="text-slate-800">LUNCH (Oběd)</option>
                        <option value="DOCTOR" className="text-slate-800">DOCTOR (Lékař)</option>
                        <option value="BUSINESS_TRIP" className="text-slate-800">SLUŽEBNÍ CESTA</option>
                        <option value="BREAK" className="text-slate-800">PAUZA (Přestávka)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                      Důvod opravy / Poznámka
                    </label>
                    <textarea
                      placeholder="Např. Zapomněl jsem se odhlásit při odchodu z práce domů..."
                      value={reqReason}
                      onChange={(e) => setReqReason(e.target.value)}
                      required
                      rows={2}
                      className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500 resize-none placeholder-slate-400"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-4 rounded-xl text-xs uppercase tracking-widest shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        Odeslat žádost
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Requests History Block */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600"></div>
                
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-650" />
                  Stav podaných žádostí
                </h2>

                {requests.length === 0 ? (
                  <div className="py-6 text-center text-slate-500 text-xs italic font-bold uppercase tracking-wider bg-slate-50 border border-slate-200 rounded-xl">
                    Nebyly odeslány žádné žádosti o korekci.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[220px] overflow-y-auto pr-2 space-y-2">
                    {requests.map((req) => {
                      const isPending = req.status === "PENDING";
                      const isApproved = req.status === "APPROVED";
                      const isRejected = req.status === "REJECTED";

                      return (
                        <div key={req.id} className="py-2.5 first:pt-0 last:pb-0 text-xs font-mono">
                          <div className="flex justify-between items-start gap-2">
                            <span className="font-bold text-slate-800">Oprava: {req.requestedLogType}</span>
                            
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${
                              isApproved 
                                ? "bg-emerald-50 border border-emerald-200 text-emerald-800" 
                                : isRejected 
                                ? "bg-rose-50 border border-rose-200 text-rose-800" 
                                : "bg-slate-100 border border-slate-205 text-slate-650"
                            }`}>
                              {isApproved && <CheckCircle className="h-2.5 w-2.5" />}
                              {isRejected && <XCircle className="h-2.5 w-2.5" />}
                              {isPending && <HelpCircle className="h-2.5 w-2.5" />}
                              {req.status}
                            </span>
                          </div>

                          <div className="text-[10px] text-slate-600 mt-1 space-y-0.5 leading-normal">
                            <div>Příchod: {formatTimeCzech(req.requestedCheckIn)}</div>
                            <div>Odchod: {formatTimeCzech(req.requestedCheckOut)}</div>
                            <div className="text-slate-500 italic font-medium border-l-2 border-slate-200 pl-1.5 mt-1">
                              &quot;{req.reason}&quot;
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

          </div>
          </>
          ) : (
            /* SHIFTS TAB CONTENT */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* LEFT: Scheduled Shifts list */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden animate-in fade-in duration-200">
                <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600"></div>
                
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">
                  Rozpis plánovaných směn
                </h2>

                {shifts.length === 0 ? (
                  <div className="py-20 text-center text-slate-500 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider">
                    Na tento měsíc nejsou naplánovány žádné směny.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto pr-2">
                    {shifts.map((shift) => {
                      const startParts = shift.startTime.split(":");
                      const endParts = shift.endTime.split(":");
                      const startMins = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
                      const endMins = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);
                      let diffHours = (endMins - startMins) / 60;
                      if (diffHours < 0) diffHours += 24;
                      const netHours = diffHours > 6.0 ? diffHours - 0.5 : diffHours;

                      return (
                        <div key={shift.id} className="py-4 flex items-center justify-between gap-4 text-xs font-mono">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800">
                                {new Date(shift.date).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" })}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700">
                                Směna
                              </span>
                            </div>
                            <div className="text-slate-555 font-sans">
                              Rozsah: <strong className="text-slate-800 font-mono">{shift.startTime} - {shift.endTime}</strong>
                              {shift.note && (
                                <span className="text-slate-400 block text-[10px] mt-0.5"> Poznámka: {shift.note}</span>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="block font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-[10px]">
                              {netHours.toFixed(1)} hod (čistý)
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* RIGHT: Shift schedule stats summary */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600"></div>
                  
                  <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">
                    Souhrn směn (Měsíc)
                  </h2>

                  <div className="space-y-4">
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs text-slate-500">Celkem směn:</span>
                      <strong className="text-xs font-bold text-slate-800">{shifts.length}</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs text-slate-500">Naplánované hodiny (Netto):</span>
                      <strong className="text-xs font-bold text-slate-800">
                        {shifts.reduce((acc, shift) => {
                          const startParts = shift.startTime.split(":");
                          const endParts = shift.endTime.split(":");
                          const startMins = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
                          const endMins = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);
                          let diffHours = (endMins - startMins) / 60;
                          if (diffHours < 0) diffHours += 24;
                          const netHours = diffHours > 6.0 ? diffHours - 0.5 : diffHours;
                          return acc + netHours;
                        }, 0).toFixed(1)} hod
                      </strong>
                    </div>
                    <p className="text-[10px] text-slate-400 italic leading-relaxed">
                      * Plán směn je sestavován vedením společnosti. V případě dotazů nebo nesrovnalostí kontaktujte prosím CEO.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* Floating Chatbot Widget */}
      <div className="fixed bottom-6 right-6 z-50 font-sans">
        {isChatOpen ? (
          <div className="bg-white/95 backdrop-blur-md w-80 sm:w-96 h-[500px] rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-200">
            {/* Header */}
            <div className="bg-indigo-600 px-4 py-3 text-white flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-indigo-100 animate-pulse" />
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider">CHECKNI TO AI</h4>
                  <span className="text-[9px] text-indigo-200 font-bold block">Online asistent docházky</span>
                </div>
              </div>
              <button 
                onClick={() => setIsChatOpen(false)}
                className="text-white/80 hover:text-white hover:bg-indigo-700/50 p-1 rounded-lg transition-colors"
                aria-label="Zavřít chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages Viewport */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
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
                          ? "bg-indigo-600 text-white rounded-tr-none animate-in fade-in duration-200" 
                          : "bg-white border border-slate-200 text-slate-800 rounded-tl-none animate-in fade-in duration-200"
                      }`}
                    >
                      {isUser ? msg.content : renderMarkdown(msg.content)}
                    </div>
                  </div>
                );
              })}
              
              {isChatLoading && (
                <div className="flex items-center gap-2 text-slate-400 bg-white border border-slate-150 px-3 py-2 rounded-2xl rounded-tl-none max-w-[50%] shadow-sm self-start text-[11px] font-medium animate-pulse">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                  <span>AI píše...</span>
                </div>
              )}

              {chatError && (
                <div className="bg-rose-50 border border-rose-250 text-rose-800 px-3 py-2 rounded-xl text-[10px] font-bold leading-normal">
                  Chyba: {chatError}
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Quick Prompts Panel */}
            <div className="px-3 py-2 border-t border-slate-100 bg-white flex flex-wrap gap-1.5 shrink-0 select-none">
              {[
                "Do kolika dnes musím být v práci?",
                "Kolik mám přesčasů?",
                "Kdy mám další směnu?"
              ].map((promptText) => (
                <button
                  key={promptText}
                  type="button"
                  disabled={isChatLoading}
                  onClick={() => handleSendChatMessage(promptText)}
                  className="bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 font-bold px-2 py-1 rounded-lg text-[9px] uppercase tracking-wide transition-all active:scale-[0.96] disabled:opacity-50"
                >
                  {promptText}
                </button>
              ))}
            </div>

            {/* Input Form */}
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSendChatMessage(); }}
              className="p-3 border-t border-slate-200 bg-white flex gap-2 items-center shrink-0"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isChatLoading}
                placeholder="Zeptejte se asistenta..."
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] placeholder-slate-400 focus:outline-none focus:border-indigo-500 text-slate-800"
              />
              <button
                type="submit"
                disabled={isChatLoading || !chatInput.trim()}
                className="bg-indigo-650 hover:bg-indigo-600 disabled:opacity-40 text-white p-2.5 rounded-xl transition-all active:scale-[0.96] flex items-center justify-center shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        ) : (
          <button
            onClick={() => setIsChatOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-4 hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center gap-2 font-bold text-xs uppercase tracking-wider z-50 relative group"
          >
            <Bot className="h-5 w-5 animate-pulse" />
            <span>AI Asistent</span>
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-rose-500 rounded-full border-2 border-white animate-bounce"></span>
          </button>
        )}
      </div>

    </div>
  );
}
