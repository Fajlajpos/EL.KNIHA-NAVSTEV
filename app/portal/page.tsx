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

// ============================================
// DEMO MODE MOCK DATA & GENERATORS
// ============================================

const generateDemoLogsForUser = (user: { id: number; employeeNumber: string }) => {
  const demoLogsList: AttendanceLog[] = [];
  const year = 2026;
  const month = 6;
  let logIdCounter = 8000;

  for (let day = 1; day <= 26; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const date = new Date(dateStr);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    if (isWeekend) continue; // Skip weekends

    let checkInHour = 6;
    let checkOutHour = 14.5; // 8.5 hours total (8.0h work net)
    const logType = "WORK";
    let status = "OK";

    if (user.employeeNumber === "2001") {
      // Jan Novak (Fund 160h, target +4.5h balance -> 164.5h)
      if (day === 5) {
        // Forgotten check-out anomaly (excluded from calculations because status is ERROR)
        checkInHour = 6;
        checkOutHour = 21;
        status = "ERROR";
      } else if (day >= 16 && day <= 22) {
        // 5 weekdays (16, 17, 18, 19, 22) are 10.5h net (11.0h shift)
        checkInHour = 6;
        checkOutHour = 17;
      } else {
        // 14 weekdays are 8.0h net (8.5h shift)
        checkInHour = 6;
        checkOutHour = 14.5;
      }
    } else if (user.employeeNumber === "2002") {
      // Martin Dvorak (Fund 160h, target 0.0h balance -> 160.0h)
      if (day === 10) {
        // Overlapping logs anomaly: 4.0h net + 5.0h net = 9.0h net
        demoLogsList.push({
          id: logIdCounter++,
          userId: user.id,
          checkIn: new Date(`${dateStr}T08:00:00`).toISOString(),
          checkOut: new Date(`${dateStr}T12:00:00`).toISOString(),
          logType: "WORK",
          status: "OK",
          note: null,
          originalCheckIn: null,
          originalCheckOut: null,
        });
        demoLogsList.push({
          id: logIdCounter++,
          userId: user.id,
          checkIn: new Date(`${dateStr}T11:00:00`).toISOString(),
          checkOut: new Date(`${dateStr}T16:00:00`).toISOString(),
          logType: "WORK",
          status: "OK",
          note: null,
          originalCheckIn: null,
          originalCheckOut: null,
        });
        continue;
      } else if (day === 1) {
        // Day 1 is 7.0h net (7.5h shift: 07:30 - 15:00)
        checkInHour = 7.5;
        checkOutHour = 15;
      } else {
        // 18 weekdays are 8.0h net (8.5h shift)
        checkInHour = 6;
        checkOutHour = 14.5;
      }
    } else if (user.employeeNumber === "3001") {
      // Lucie Kralova (Fund 150h, target +4.5h balance -> 154.5h)
      checkInHour = 8;
      if (day >= 18 && day <= 22) {
        // 3 weekdays (18, 19, 22) are 9.0h net (9.5h shift: 08:00 - 17:30)
        checkOutHour = 17.5;
      } else {
        // 17 weekdays are 7.5h net (8.0h shift: 08:00 - 16:00)
        checkOutHour = 16;
      }
    } else {
      // Josef Marek (4001) & Jana Svobodova (4002) (Fund 160h, target 0.0h balance -> 160.0h)
      // 20 weekdays of 8.0h net (8.5h shift)
      checkInHour = 6;
      checkOutHour = 14.5;
    }

    const checkInISO = new Date(`${dateStr}T${String(Math.floor(checkInHour)).padStart(2, "0")}:${checkInHour % 1 === 0.5 ? "30" : "00"}:00`).toISOString();
    const checkOutISO = new Date(`${dateStr}T${String(Math.floor(checkOutHour)).padStart(2, "0")}:${checkOutHour % 1 === 0.5 ? "30" : "00"}:00`).toISOString();

    demoLogsList.push({
      id: logIdCounter++,
      userId: user.id,
      checkIn: checkInISO,
      checkOut: checkOutISO,
      logType,
      status,
      note: null,
      originalCheckIn: null,
      originalCheckOut: null,
    });

    if (day % 4 === 0) {
      demoLogsList.push({
        id: logIdCounter++,
        userId: user.id,
        checkIn: new Date(`${dateStr}T11:30:00`).toISOString(),
        checkOut: new Date(`${dateStr}T12:00:00`).toISOString(),
        logType: "LUNCH",
        status: "OK",
        note: null,
        originalCheckIn: null,
        originalCheckOut: null,
      });
    }
  }
  return demoLogsList;
};

const generateDemoShiftsForUser = () => {
  const year = 2026;
  const list: PortalShift[] = [
    { id: 7001, date: `${year}-06-01`, startTime: "06:00", endTime: "14:30", note: "Ranní směna" },
    { id: 7002, date: `${year}-06-02`, startTime: "06:00", endTime: "14:30", note: "Ranní směna" },
    { id: 7003, date: `${year}-06-03`, startTime: "06:00", endTime: "14:30", note: "Ranní" },
    { id: 7004, date: `${year}-06-04`, startTime: "06:00", endTime: "14:30", note: "Ranní" },
    { id: 7005, date: `${year}-06-05`, startTime: "06:00", endTime: "14:30", note: "Ranní" }
  ];
  return list;
};

const generateDemoRequestsForUser = (user: { id: number }) => {
  const list: CorrectionRequest[] = [
    {
      id: 9991,
      userId: user.id,
      attendanceLogId: null,
      requestedCheckIn: new Date("2026-06-19T06:00:00.000Z").toISOString(),
      requestedCheckOut: new Date("2026-06-19T14:30:00.000Z").toISOString(),
      requestedLogType: "WORK",
      reason: "Zapomněl jsem si čip doma, ale normálně jsem odpracoval ranní směnu.",
      status: "PENDING",
      createdAt: new Date("2026-06-19T15:00:00.000Z").toISOString()
    }
  ];
  return list;
};

export default function PortalPage() {
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Demo Mode States
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [processedDemoReqs] = useState<number[]>([]);

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
          itemContent = parts.map((part, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="font-bold text-[#1d1d1f]">{part}</strong> : part);
        }
        content = (
          <li key={idx} className="list-disc list-inside ml-1 my-0.5 text-[#1d1d1f]">
            {itemContent}
          </li>
        );
      } else if (typeof content === "string" && content.includes("**")) {
        const parts = content.split("**");
        content = parts.map((part, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="font-bold text-[#1d1d1f]">{part}</strong> : part);
      }

      return <div key={idx} className="min-h-[1.25em]">{content}</div>;
    });
  };
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeEmployee, setActiveEmployee] = useState<Employee | null>(null);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [shifts, setShifts] = useState<PortalShift[]>([]);

  const activeLogs = isDemoMode && activeEmployee
    ? generateDemoLogsForUser(activeEmployee)
    : logs;

  const activeShifts = isDemoMode && activeEmployee
    ? generateDemoShiftsForUser()
    : shifts;

  const activeRequests = isDemoMode && activeEmployee
    ? [
        ...requests,
        ...generateDemoRequestsForUser(activeEmployee).filter(req => !processedDemoReqs.includes(req.id))
      ]
    : requests;
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

  // Keyboard Shortcut Event Hook for Demo Mode (Shift + D + E)
  useEffect(() => {
    const pressedKeys = new Set<string>();

    const handleKeyDown = (e: KeyboardEvent) => {
      pressedKeys.add(e.key.toLowerCase());

      if (
        pressedKeys.has("shift") &&
        pressedKeys.has("d") &&
        pressedKeys.has("e")
      ) {
        setIsDemoMode((prev) => !prev);
        pressedKeys.clear();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      pressedKeys.delete(e.key.toLowerCase());
    };

    const handleBlur = () => {
      pressedKeys.clear();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
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

    if (isDemoMode) {
      setFeedback({ msg: "Žádost o opravu byla odeslána ke schválení.", success: true });
      setReqDate("");
      setReqCheckInTime("");
      setReqCheckOutTime("");
      setReqReason("");
      setSelectedLogId("");
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
      const targetLog = activeLogs.find((l) => l.id === parseInt(selectedLogId, 10));
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
    const log = activeLogs.find((l) => l.id === parseInt(logIdVal, 10));
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
    let totalHours = 0;
    activeLogs.forEach((log) => {
      if (log.checkOut && log.status !== "ERROR") {
        if (log.logType === "WORK") {
          const diffMs = new Date(log.checkOut).getTime() - new Date(log.checkIn).getTime();
          let shiftHours = diffMs / (1000 * 60 * 60);
          // Law-regulated Auto Lunch Break subtraction: if working continuously > 6 hours, deduct 30 minutes
          if (shiftHours > 6.0) {
            shiftHours -= 0.5;
          }
          totalHours += shiftHours;
        }
      }
    });
    return parseFloat(totalHours.toFixed(2));
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
      <div className="min-h-screen bg-black/[0.04] flex flex-col items-center justify-center text-[#6e6e73] font-sans text-xs uppercase tracking-widest gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-[#6e6e73]" />
        <span>Ověřování přístupu...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-[#1d1d1f] pb-16 font-sans antialiased selection:bg-black/[0.06]">

      {/* Header Info Panel */}
      <header className="lg:sticky lg:top-0 z-30 glass-bar border-b border-black/[0.08] px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <p className="eyebrow">Můj prostor</p>
              <h1 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">Zaměstnanecký portál</h1>
            </div>
          </div>

          {/* Employee identity */}
          <div className="flex items-center gap-2 bg-white/50 border border-black/[0.08] px-3 py-2 rounded-2xl self-start sm:self-auto shadow-sm">
            <span className="text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest font-mono">Přihlášen jako:</span>
            {loggedInRole === "CEO" ? (
              <select
                value={activeEmployee?.id || ""}
                onChange={(e) => {
                  const emp = employees.find((emp) => emp.id === parseInt(e.target.value, 10));
                  if (emp) setActiveEmployee(emp);
                }}
                className="bg-transparent text-xs font-bold text-[#1d1d1f] outline-none cursor-pointer"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id} className="bg-white text-[#1d1d1f]">
                    {emp.lastName} {emp.firstName} ({emp.department})
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-bold text-[#1d1d1f]">
                {activeEmployee ? `${activeEmployee.lastName} ${activeEmployee.firstName}` : "..."}
              </span>
            )}
          </div>
        </div>
      </header>

      {activeEmployee && (
        <main className="max-w-7xl mx-auto px-4 lg:px-6 mt-8 space-y-8">

          {/* Main Tab Selector */}
          <div className="flex border-b border-black/[0.08] gap-6">
            <button onClick={() => setActiveTab("attendance")} className={`tab ${activeTab === "attendance" ? "tab-active" : ""}`}>
              Přehled docházky
            </button>
            <button onClick={() => setActiveTab("shifts")} className={`tab ${activeTab === "shifts" ? "tab-active" : ""}`}>
              Můj plán směn ({activeShifts.length})
            </button>
          </div>

          {activeTab === "attendance" ? (
            <>
              {/* STATS TILES: Hours tracking progress */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch">
            
            {/* Hours Fund Card */}
            <div className="md:col-span-8 surface card-accent p-6 flex flex-col justify-between">
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-[#6e6e73] uppercase tracking-widest">Plnění fondu (Aktuální měsíc)</h3>
                  <span className="text-xs font-bold text-[#6e6e73] font-mono">
                    {hoursWorked} / {monthlyFundTarget} hod ({progressPercent.toFixed(1)}%)
                  </span>
                </div>
                {/* Progress bar container */}
                <div className="h-4 w-full bg-black/[0.06] rounded-full overflow-hidden border border-black/[0.08]">
                  <div
                    style={{ width: `${progressPercent}%` }}
                    className={`h-full transition-all duration-500 ${
                      progressPercent >= 100 
                        ? "bg-emerald-500" 
                        : progressPercent > 50 
                        ? "bg-[#0071e3]" 
                        : "bg-amber-500"
                    }`}
                  ></div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 sm:gap-4 pt-6 border-t border-black/[0.08] mt-6 text-center font-mono">
                <div>
                  <span className="block text-[9px] sm:text-[10px] text-[#6e6e73] font-bold uppercase tracking-widest truncate" title="Odpracováno">Odpracováno</span>
                  <span className="text-sm sm:text-lg font-bold text-[#1d1d1f]">{hoursWorked}h</span>
                </div>
                <div className="border-x border-black/[0.08] px-1">
                  <span className="block text-[9px] sm:text-[10px] text-[#6e6e73] font-bold uppercase tracking-widest truncate" title="Měsíční Fond">Měsíční Fond</span>
                  <span className="text-sm sm:text-lg font-bold text-[#1d1d1f]">{monthlyFundTarget}h</span>
                </div>
                <div>
                  <span className="block text-[9px] sm:text-[10px] text-[#6e6e73] font-bold uppercase tracking-widest truncate" title="Saldo / Přesčasy">Saldo / Přesčasy</span>
                  <span className={`text-sm sm:text-lg font-bold ${balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {balance >= 0 ? `+${balance.toFixed(2)}h` : `${balance.toFixed(2)}h`}
                  </span>
                </div>
              </div>
            </div>

            {/* Profile info card */}
            <div className="md:col-span-4 surface card-accent p-6 flex flex-col justify-between">
              
              <div>
                <span className="text-[10px] text-[#6e6e73] font-bold uppercase tracking-widest block">Zaměstnanec</span>
                <h2 className="text-xl font-bold text-[#1d1d1f] leading-tight">
                  {activeEmployee.firstName} {activeEmployee.lastName}
                </h2>
                <div className="mt-4 space-y-2 text-xs font-mono text-[#6e6e73]">
                  <div className="flex justify-between border-b border-black/5 pb-1">
                    <span>Osobní číslo:</span>
                    <strong className="text-[#1d1d1f]">{activeEmployee.employeeNumber}</strong>
                  </div>
                  <div className="flex justify-between border-b border-black/5 pb-1">
                    <span>Oddělení:</span>
                    <strong className="text-[#1d1d1f]">{activeEmployee.department}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Role:</span>
                    <strong className="text-[#1d1d1f]">{activeEmployee.role}</strong>
                  </div>
                </div>
              </div>
              
              <div className="text-[10px] text-[#6e6e73] bg-black/[0.04] border border-black/[0.08] p-2.5 rounded-lg text-center font-medium mt-4">
                Týdenní úvazek: {activeEmployee.hourlyFund} hodin
              </div>
            </div>
          </div>

          {/* TWO COLUMN CONTENT AREA */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT: Attendance logs for month */}
            <div className="lg:col-span-7 surface card-accent p-6">
              
              <h2 className="text-sm font-bold text-[#1d1d1f] uppercase tracking-widest mb-4 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#6e6e73]" />
                Historie zápisů (Aktuální měsíc)
              </h2>

              {isLoading && activeLogs.length === 0 ? (
                <div className="flex justify-center items-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-[#6e6e73]" />
                </div>
              ) : activeLogs.length === 0 ? (
                <div className="py-20 text-center text-[#6e6e73] bg-black/[0.04] border border-black/[0.08] rounded-xl font-bold text-xs uppercase tracking-wider">
                  Žádné docházkové zápisy v tomto období.
                </div>
              ) : (
                <div className="divide-y divide-black/5 max-h-[500px] overflow-y-auto pr-2 premium-scroll">
                  {activeLogs.map((log) => {
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
                      <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 text-xs font-mono">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-[#1d1d1f]">{formatDateCzech(log.checkIn)}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isLunch 
                                ? "bg-amber-500/15 border border-amber-500/30 text-amber-700" 
                                : isDoctor 
                                ? "bg-sky-500/15 border border-sky-500/30 text-sky-700"
                                : isTrip
                                ? "bg-purple-500/15 border border-purple-500/30 text-purple-700"
                                : "bg-black/[0.06] border border-black/[0.08] text-[#1d1d1f]"
                            }`}>
                              {log.logType}
                            </span>
                            {isError && (
                              <span className="bg-rose-500/15 border border-rose-500/30 text-rose-700 px-2 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5">
                                <AlertTriangle className="h-3 w-3 text-rose-600" />
                                CHYBA
                              </span>
                            )}
                            {isEdited && (
                              <span className="bg-black/[0.04] border border-black/[0.08] text-[#6e6e73] px-2 py-0.5 rounded text-[9px] font-bold" title={log.note || "Upraveno"}>
                                KOREKCE
                              </span>
                            )}
                          </div>
                          <div className="text-[#6e6e73] font-sans">
                            Příchod: <strong className="text-[#1d1d1f] font-mono">{formatTimeCzech(log.checkIn)}</strong>
                            {" • "}
                            Odchod: <strong className="text-[#1d1d1f] font-mono">{formatTimeCzech(log.checkOut)}</strong>
                          </div>
                        </div>

                        <div className="text-right self-end sm:self-auto">
                          <span className="block font-bold text-[#6e6e73] bg-black/[0.04] border border-black/[0.08] px-2 py-0.5 rounded text-[10px] w-fit ml-auto sm:ml-0">
                            {durationStr}
                          </span>
                          {log.note && (
                            <span className="block text-[9px] text-[#86868b] mt-1 text-right max-w-[150px] truncate" title={log.note}>
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
              <div className="surface card-accent p-6">
                
                <h2 className="text-sm font-bold text-[#1d1d1f] uppercase tracking-widest mb-4 flex items-center gap-2">
                  <PlusCircle className="h-4 w-4 text-[#6e6e73]" />
                  Žádost o opravu docházky
                </h2>

                {feedback && (
                  <div className={`mb-4 p-3 rounded-xl border text-xs flex items-center gap-2.5 font-medium animate-in fade-in ${
                    feedback.success 
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700" 
                      : "bg-rose-500/15 border-rose-500/30 text-rose-700"
                  }`}>
                    {feedback.success ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}
                    <span>{feedback.msg}</span>
                  </div>
                )}

                <form onSubmit={handleSubmitCorrection} className="space-y-4">
                  
                  {/* Mode Selector */}
                  <div className="flex bg-black/[0.02] border border-black/[0.06] p-1 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => {
                        setRequestMode("new");
                        setSelectedLogId("");
                      }}
                      className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase rounded-xl transition-colors ${
                        requestMode === "new" ? "bg-white text-[#1d1d1f] shadow-sm border border-black/[0.08]" : "text-[#6e6e73] hover:text-[#1d1d1f]"
                      }`}
                    >
                      Zadat nový den
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequestMode("edit")}
                      className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase rounded-xl transition-colors ${
                        requestMode === "edit" ? "bg-white text-[#1d1d1f] shadow-sm border border-black/[0.08]" : "text-[#6e6e73] hover:text-[#1d1d1f]"
                      }`}
                    >
                      Opravit existující
                    </button>
                  </div>

                  {requestMode === "edit" ? (
                    <div>
                      <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                        Záznam k opravě
                      </label>
                      <select
                        value={selectedLogId}
                        onChange={(e) => handleSelectLogChange(e.target.value)}
                        required={requestMode === "edit"}
                        className="select text-xs font-semibold"
                      >
                        <option value="" className="text-[#6e6e73]">-- Vyberte chybný záznam --</option>
                        {activeLogs.map((log) => (
                          <option key={log.id} value={log.id} className="text-[#1d1d1f]">
                            {formatDateCzech(log.checkIn)} ({log.logType}) | Od: {formatTimeCzech(log.checkIn)} {log.checkOut ? `do ${formatTimeCzech(log.checkOut)}` : "(Otevřený)"}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                        Datum zápisu
                      </label>
                      <input
                        type="date"
                        value={reqDate}
                        onChange={(e) => setReqDate(e.target.value)}
                        required={requestMode === "new"}
                        className="input text-xs font-mono"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                        Nový Příchod
                      </label>
                      <input
                        type="time"
                        value={reqCheckInTime}
                        onChange={(e) => setReqCheckInTime(e.target.value)}
                        required={requestMode === "new"}
                        className="input text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                        Nový Odchod
                      </label>
                      <input
                        type="time"
                        value={reqCheckOutTime}
                        onChange={(e) => setReqCheckOutTime(e.target.value)}
                        className="input text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                        Typ práce
                      </label>
                      <select
                        value={reqType}
                        onChange={(e) => setReqType(e.target.value)}
                        className="select text-xs font-semibold"
                      >
                        <option value="WORK" className="text-[#1d1d1f]">WORK (Práce)</option>
                        <option value="LUNCH" className="text-[#1d1d1f]">LUNCH (Oběd)</option>
                        <option value="DOCTOR" className="text-[#1d1d1f]">DOCTOR (Lékař)</option>
                        <option value="BUSINESS_TRIP" className="text-[#1d1d1f]">SLUŽEBNÍ CESTA</option>
                        <option value="BREAK" className="text-[#1d1d1f]">PAUZA (Přestávka)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                      Důvod opravy / Poznámka
                    </label>
                    <textarea
                      placeholder="Např. Zapomněl jsem se odhlásit při odchodu z práce domů..."
                      value={reqReason}
                      onChange={(e) => setReqReason(e.target.value)}
                      required
                      rows={2}
                      className="input resize-none h-20 placeholder-[#86868b]"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="btn-primary w-full py-3.5"
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
              <div className="surface card-accent p-6">
                
                <h2 className="text-sm font-bold text-[#1d1d1f] uppercase tracking-widest mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#6e6e73]" />
                  Stav podaných žádostí
                </h2>

                {activeRequests.length === 0 ? (
                  <div className="py-6 text-center text-[#6e6e73] text-xs italic font-bold uppercase tracking-wider bg-black/[0.04] border border-black/[0.08] rounded-xl">
                    Nebyly odeslány žádné žádosti o korekci.
                  </div>
                ) : (
                  <div className="divide-y divide-black/5 max-h-[220px] overflow-y-auto pr-2 space-y-2 premium-scroll">
                    {activeRequests.map((req) => {
                      const isPending = req.status === "PENDING";
                      const isApproved = req.status === "APPROVED";
                      const isRejected = req.status === "REJECTED";

                      return (
                        <div key={req.id} className="py-2.5 first:pt-0 last:pb-0 text-xs font-mono">
                          <div className="flex justify-between items-start gap-2">
                            <span className="font-bold text-[#1d1d1f]">Oprava: {req.requestedLogType}</span>
                            
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                              isApproved 
                                ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-700" 
                                : isRejected 
                                ? "bg-rose-500/15 border border-rose-500/30 text-rose-700" 
                                : "bg-black/[0.06] border border-black/[0.08] text-[#6e6e73]"
                            }`}>
                              {isApproved && <CheckCircle className="h-2.5 w-2.5" />}
                              {isRejected && <XCircle className="h-2.5 w-2.5" />}
                              {isPending && <HelpCircle className="h-2.5 w-2.5" />}
                              {req.status}
                            </span>
                          </div>

                          <div className="text-[10px] text-[#6e6e73] mt-1 space-y-0.5 leading-normal">
                            <div>Příchod: {formatTimeCzech(req.requestedCheckIn)}</div>
                            <div>Odchod: {formatTimeCzech(req.requestedCheckOut)}</div>
                            <div className="text-[#6e6e73] italic font-medium border-l-2 border-black/[0.08] pl-1.5 mt-1">
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
              <div className="lg:col-span-8 surface card-accent p-6 animate-in fade-in duration-200">
                
                <h2 className="text-sm font-bold text-[#1d1d1f] uppercase tracking-widest mb-4">
                  Rozpis plánovaných směn
                </h2>

                {activeShifts.length === 0 ? (
                  <div className="py-20 text-center text-[#6e6e73] bg-black/[0.04] border border-black/[0.08] rounded-xl font-bold text-xs uppercase tracking-wider">
                    Na tento měsíc nejsou naplánovány žádné směny.
                  </div>
                ) : (
                  <div className="divide-y divide-black/5 max-h-[600px] overflow-y-auto pr-2 premium-scroll">
                    {activeShifts.map((shift) => {
                      const startParts = shift.startTime.split(":");
                      const endParts = shift.endTime.split(":");
                      const startMins = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
                      const endMins = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);
                      let diffHours = (endMins - startMins) / 60;
                      if (diffHours < 0) diffHours += 24;
                      const netHours = diffHours > 6.0 ? diffHours - 0.5 : diffHours;

                      return (
                        <div key={shift.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 text-xs font-mono">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#1d1d1f]">
                                {new Date(shift.date).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" })}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/[0.04] border border-black/[0.08] text-[#6e6e73]">
                                Směna
                              </span>
                            </div>
                            <div className="text-[#6e6e73] font-sans">
                              Rozsah: <strong className="text-[#1d1d1f] font-mono">{shift.startTime} - {shift.endTime}</strong>
                              {shift.note && (
                                <span className="text-[#86868b] block text-[10px] mt-0.5"> Poznámka: {shift.note}</span>
                              )}
                            </div>
                          </div>

                          <div className="text-right self-end sm:self-auto">
                            <span className="block font-bold text-[#6e6e73] bg-black/[0.04] border border-black/[0.08] px-2 py-0.5 rounded text-[10px] w-fit ml-auto sm:ml-0">
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
                <div className="surface card-accent p-6">
                  
                  <h2 className="text-xs font-bold text-[#1d1d1f] uppercase tracking-widest mb-4">
                    Souhrn směn (Měsíc)
                  </h2>

                  <div className="space-y-4">
                    <div className="flex justify-between border-b border-black/5 pb-2">
                      <span className="text-xs text-[#6e6e73]">Celkem směn:</span>
                      <strong className="text-xs font-bold text-[#1d1d1f]">{activeShifts.length}</strong>
                    </div>
                    <div className="flex justify-between border-b border-black/5 pb-2">
                      <span className="text-xs text-[#6e6e73]">Naplánované hodiny (Netto):</span>
                      <strong className="text-xs font-bold text-[#1d1d1f]">
                        {activeShifts.reduce((acc, shift) => {
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
                    <p className="text-[10px] text-[#86868b] italic leading-relaxed">
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
      {loggedInRole !== "CEO" && (
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
                  "Do kolika dnes musím být v práci?",
                  "Kolik mám přesčasů?",
                  "Kdy mám další směnu?"
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
