"use client";

import { useState, useEffect, useRef } from "react";
import {
  Calendar,
  AlertTriangle,
  Coffee,
  Send,
  Loader2,
  CalendarPlus,
  CheckCircle,
  XCircle,
  HelpCircle,
  FileText,
  PlusCircle,
  Bot,
  Pencil,
  PlayCircle,
  StopCircle,
  Trash2,
  Utensils,
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
  userId?: number;
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

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getWeekRange = (weekOffset: number) => {
  const today = new Date();
  const day = today.getDay();
  const distanceToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + distanceToMonday + weekOffset * 7);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  return {
    start: getLocalDateKey(monday),
    end: getLocalDateKey(friday),
  };
};

const formatShiftDateKey = (dateValue: string) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return getLocalDateKey(date);
};

const calculateShiftNetHours = (startTime: string, endTime: string) => {
  const [startHour, startMinute] = startTime.split(":").map((part) => parseInt(part, 10));
  const [endHour, endMinute] = endTime.split(":").map((part) => parseInt(part, 10));
  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) return 0;

  let diffHours = ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60;
  if (diffHours < 0) diffHours += 24;
  return diffHours > 6.0 ? diffHours - 0.5 : diffHours;
};

const getLogTypeLabel = (type: string) => {
  switch (type) {
    case "WORK":
      return "Práce";
    case "LUNCH":
      return "Oběd";
    case "BREAK":
      return "Přestávka";
    case "DOCTOR":
      return "Lékař";
    case "BUSINESS_TRIP":
      return "Služební cesta";
    default:
      return type;
  }
};

const DEMO_ASSIGNED_SHIFTS_KEY = "checkni-demo-assigned-shifts";
const DEMO_DELETED_SHIFTS_KEY = "checkni-demo-deleted-shifts";

const SHIFT_PRESETS = [
  { label: "Ranní", start: "06:00", end: "14:30" },
  { label: "Odpolední", start: "14:00", end: "22:30" },
  { label: "Denní", start: "08:00", end: "16:30" },
  { label: "Noční", start: "22:00", end: "06:00" },
];

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

const generateDemoShiftsForUser = (user: { id: number }) => {
  const today = new Date();
  const list: PortalShift[] = [];
  const baseId = 700000 + user.id * 100;

  for (let offset = 0; offset < 10; offset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const day = date.getDay();
    if (offset !== 0 && (day === 0 || day === 6)) continue;

    list.push({
      id: baseId + list.length + 1,
      userId: user.id,
      date: getLocalDateKey(date),
      startTime: offset % 2 === 0 ? "06:00" : "08:00",
      endTime: offset % 2 === 0 ? "14:30" : "16:30",
      note: offset === 0 ? "Dnešní směna" : offset % 2 === 0 ? "Ranní směna" : "Denní směna",
    });

    if (list.length >= 6) break;
  }

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
  const [demoActionLogs, setDemoActionLogs] = useState<AttendanceLog[]>([]);
  const [demoAssignedShifts, setDemoAssignedShifts] = useState<PortalShift[]>([]);
  const [demoDeletedShiftIds, setDemoDeletedShiftIds] = useState<number[]>([]);

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

  useEffect(() => {
    const loadStoredShifts = () => {
      try {
        const stored = window.localStorage.getItem(DEMO_ASSIGNED_SHIFTS_KEY);
        setDemoAssignedShifts(stored ? JSON.parse(stored) : []);
      } catch {
        setDemoAssignedShifts([]);
      }

      try {
        const storedDeleted = window.localStorage.getItem(DEMO_DELETED_SHIFTS_KEY);
        setDemoDeletedShiftIds(storedDeleted ? JSON.parse(storedDeleted) : []);
      } catch {
        setDemoDeletedShiftIds([]);
      }
    };

    loadStoredShifts();
    window.addEventListener("storage", loadStoredShifts);
    return () => window.removeEventListener("storage", loadStoredShifts);
  }, []);

  const persistDemoAssignedShifts = (nextShifts: PortalShift[]) => {
    setDemoAssignedShifts(nextShifts);
    window.localStorage.setItem(DEMO_ASSIGNED_SHIFTS_KEY, JSON.stringify(nextShifts));
  };

  const persistDemoDeletedShiftIds = (nextIds: number[]) => {
    setDemoDeletedShiftIds(nextIds);
    window.localStorage.setItem(DEMO_DELETED_SHIFTS_KEY, JSON.stringify(nextIds));
  };

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

  const activeDemoAssignedShifts = activeEmployee
    ? demoAssignedShifts.filter((shift) => shift.userId === activeEmployee.id)
    : [];
  const baseDemoShifts = activeEmployee ? generateDemoShiftsForUser(activeEmployee) : [];
  const activeDemoShifts = [
    ...baseDemoShifts
      .filter((shift) => !demoDeletedShiftIds.includes(shift.id))
      .map((shift) => activeDemoAssignedShifts.find((assignedShift) => assignedShift.id === shift.id) || shift),
    ...activeDemoAssignedShifts.filter(
      (shift) => !demoDeletedShiftIds.includes(shift.id) && !baseDemoShifts.some((baseShift) => baseShift.id === shift.id)
    ),
  ].filter((shift) => !demoDeletedShiftIds.includes(shift.id));

  const activeLogs = isDemoMode && activeEmployee
    ? [...generateDemoLogsForUser(activeEmployee), ...demoActionLogs.filter((log) => log.userId === activeEmployee.id)]
        .sort((a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime())
    : logs;

  const activeShifts = (isDemoMode && activeEmployee
    ? activeDemoShifts
    : shifts
  ).slice().sort((a, b) => `${formatShiftDateKey(a.date)} ${a.startTime}`.localeCompare(`${formatShiftDateKey(b.date)} ${b.startTime}`));

  const activeRequests = isDemoMode && activeEmployee
    ? [
        ...requests,
        ...generateDemoRequestsForUser(activeEmployee).filter(req => !processedDemoReqs.includes(req.id))
      ]
    : requests;
  const [activeTab, setActiveTab] = useState<"attendance" | "shifts">("attendance");

  const [portalShiftDate, setPortalShiftDate] = useState("");
  const [portalShiftEndDate, setPortalShiftEndDate] = useState("");
  const [portalShiftStartTime, setPortalShiftStartTime] = useState("08:00");
  const [portalShiftEndTime, setPortalShiftEndTime] = useState("16:30");
  const [portalShiftNote, setPortalShiftNote] = useState("");
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [editShiftDate, setEditShiftDate] = useState("");
  const [editShiftStartTime, setEditShiftStartTime] = useState("");
  const [editShiftEndTime, setEditShiftEndTime] = useState("");
  const [editShiftNote, setEditShiftNote] = useState("");

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
        const selectableEmployees = loggedInRole === "CEO"
          ? data.filter((employee: Employee) => employee.role !== "CEO")
          : data;

        // Auto-select logged-in employee by employeeNumber
        if (loggedInRole !== "CEO" && loggedInEmployeeNumber) {
          const me = data.find((e: Employee) => e.employeeNumber === loggedInEmployeeNumber);
          if (me) {
            setActiveEmployee(me);
            return;
          }
        }
        if (selectableEmployees.length > 0) {
          setActiveEmployee(selectableEmployees[0]);
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
  }, [isAuthorized, loggedInEmployeeNumber, loggedInRole]);

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

  const handleAttendanceAction = async (action: string) => {
    if (!activeEmployee) return;

    const messages: Record<string, string> = {
      START_WORK: "Směna byla zahájena.",
      START_LUNCH: "Obědová pauza byla zahájena.",
      END_LUNCH: "Obědová pauza byla ukončena.",
      START_BREAK: "Přestávka byla zahájena.",
      END_BREAK: "Přestávka byla ukončena.",
      END_SHIFT: "Směna byla ukončena.",
    };

    if (isDemoMode) {
      const now = new Date().toISOString();
      const actionConfig: Record<string, { closeTypes?: string[]; openType?: string; note: string }> = {
        START_WORK: { closeTypes: ["LUNCH", "BREAK"], openType: "WORK", note: "Začátek směny" },
        START_LUNCH: { closeTypes: ["WORK", "BREAK"], openType: "LUNCH", note: "Obědová pauza" },
        END_LUNCH: { closeTypes: ["LUNCH"], openType: "WORK", note: "Návrat z oběda" },
        START_BREAK: { closeTypes: ["WORK"], openType: "BREAK", note: "Přestávka" },
        END_BREAK: { closeTypes: ["BREAK"], openType: "WORK", note: "Návrat z přestávky" },
        END_SHIFT: { closeTypes: ["WORK", "LUNCH", "BREAK", "DOCTOR", "BUSINESS_TRIP"], note: "Konec směny" },
      };
      const config = actionConfig[action];
      if (!config) return;

      setDemoActionLogs((prev) => {
        const updated = prev.map((log) => {
          if (
            log.userId === activeEmployee.id &&
            !log.checkOut &&
            config.closeTypes?.includes(log.logType)
          ) {
            return { ...log, checkOut: now, status: "OK" };
          }
          return log;
        });

        if (!config.openType) return updated;

        const alreadyOpen = updated.some(
          (log) => log.userId === activeEmployee.id && !log.checkOut && log.logType === config.openType
        );
        if (alreadyOpen) return updated;

        return [
          {
            id: Date.now(),
            userId: activeEmployee.id,
            checkIn: now,
            checkOut: null,
            logType: config.openType,
            status: "OPEN",
            note: config.note,
            originalCheckIn: null,
            originalCheckOut: null,
          },
          ...updated,
        ];
      });

      setFeedback({ msg: messages[action] || "Docházka byla zapsána.", success: true });
      return;
    }

    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/attendance/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: activeEmployee.id,
          action,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setFeedback({ msg: data.message || messages[action] || "Docházka byla zapsána.", success: true });
        await loadEmployeeData();
      } else {
        setFeedback({ msg: data.error || "Docházku se nepodařilo zapsat.", success: false });
      }
    } catch (err) {
      console.error(err);
      setFeedback({ msg: "Chyba spojení se serverem.", success: false });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePortalCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEmployee || !portalShiftDate || !portalShiftStartTime || !portalShiftEndTime) {
      setFeedback({ msg: "Vyplňte datum, začátek a konec směny.", success: false });
      return;
    }

    const startDate = new Date(portalShiftDate);
    const endDate = portalShiftEndDate ? new Date(portalShiftEndDate) : startDate;
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setFeedback({ msg: "Zadejte platné datum směny.", success: false });
      return;
    }
    if (endDate < startDate) {
      setFeedback({ msg: "Datum do nesmí být před datem od.", success: false });
      return;
    }
    if (portalShiftStartTime === portalShiftEndTime) {
      setFeedback({ msg: "Začátek a konec směny nesmí být shodný.", success: false });
      return;
    }

    const createdDates: Date[] = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      createdDates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    if (createdDates.length > 62) {
      setFeedback({ msg: "Rozsah směn je příliš dlouhý. Zadejte maximálně 62 dní.", success: false });
      return;
    }

    if (isDemoMode) {
      const createdShifts: PortalShift[] = createdDates.map((shiftDate, index) => ({
        id: Date.now() + index,
        userId: activeEmployee.id,
        date: getLocalDateKey(shiftDate),
        startTime: portalShiftStartTime,
        endTime: portalShiftEndTime,
        note: portalShiftNote.trim() || null,
      }));

      persistDemoAssignedShifts([...demoAssignedShifts, ...createdShifts]);
      setFeedback({
        msg: createdShifts.length === 1 ? "Směna byla naplánována." : `Naplánováno směn: ${createdShifts.length}.`,
        success: true,
      });
      setPortalShiftDate("");
      setPortalShiftEndDate("");
      setPortalShiftNote("");
      setActiveTab("shifts");
      return;
    }

    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: activeEmployee.id,
          date: portalShiftDate,
          dateTo: portalShiftEndDate || portalShiftDate,
          startTime: portalShiftStartTime,
          endTime: portalShiftEndTime,
          note: portalShiftNote,
        }),
      });

      if (res.ok) {
        setFeedback({ msg: "Směna byla naplánována.", success: true });
        setPortalShiftDate("");
        setPortalShiftEndDate("");
        setPortalShiftNote("");
        setActiveTab("shifts");
        await loadEmployeeData();
      } else {
        const data = await res.json();
        setFeedback({ msg: data.error || "Směnu se nepodařilo naplánovat.", success: false });
      }
    } catch (err) {
      console.error(err);
      setFeedback({ msg: "Chyba spojení se serverem.", success: false });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartEditShift = (shift: PortalShift) => {
    setEditingShiftId(shift.id);
    setEditShiftDate(formatShiftDateKey(shift.date));
    setEditShiftStartTime(shift.startTime);
    setEditShiftEndTime(shift.endTime);
    setEditShiftNote(shift.note || "");
    setFeedback(null);
  };

  const handleCancelEditShift = () => {
    setEditingShiftId(null);
  };

  const handleUpdateShift = async (shiftId: number) => {
    if (!activeEmployee) return;
    if (!editShiftDate || !editShiftStartTime || !editShiftEndTime) {
      setFeedback({ msg: "Vyplňte datum, začátek i konec směny.", success: false });
      return;
    }
    if (editShiftStartTime === editShiftEndTime) {
      setFeedback({ msg: "Začátek a konec směny nesmí být shodný.", success: false });
      return;
    }

    if (isDemoMode) {
      const originalShift = activeShifts.find((shift) => shift.id === shiftId);
      if (!originalShift) {
        setFeedback({ msg: "Směnu se nepodařilo najít.", success: false });
        return;
      }

      const editedShift: PortalShift = {
        ...originalShift,
        userId: activeEmployee.id,
        date: editShiftDate,
        startTime: editShiftStartTime,
        endTime: editShiftEndTime,
        note: editShiftNote.trim() || null,
      };
      const alreadyStored = demoAssignedShifts.some(
        (shift) => shift.id === shiftId && shift.userId === activeEmployee.id
      );
      const nextShifts = alreadyStored
        ? demoAssignedShifts.map((shift) => (
            shift.id === shiftId && shift.userId === activeEmployee.id ? editedShift : shift
          ))
        : [...demoAssignedShifts, editedShift];

      persistDemoAssignedShifts(nextShifts);
      persistDemoDeletedShiftIds(demoDeletedShiftIds.filter((id) => id !== shiftId));
      setFeedback({ msg: "Směna byla upravena.", success: true });
      setEditingShiftId(null);
      return;
    }

    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/shifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: shiftId,
          date: editShiftDate,
          startTime: editShiftStartTime,
          endTime: editShiftEndTime,
          note: editShiftNote,
        }),
      });

      if (res.ok) {
        setFeedback({ msg: "Směna byla upravena.", success: true });
        setEditingShiftId(null);
        await loadEmployeeData();
      } else {
        const data = await res.json();
        setFeedback({ msg: data.error || "Směnu se nepodařilo upravit.", success: false });
      }
    } catch (err) {
      console.error(err);
      setFeedback({ msg: "Chyba spojení se serverem.", success: false });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteShift = async (shiftId: number) => {
    if (!confirm("Opravdu chcete smazat tuto směnu?")) return;

    if (isDemoMode) {
      const nextShifts = demoAssignedShifts.filter((shift) => shift.id !== shiftId);
      persistDemoAssignedShifts(nextShifts);
      persistDemoDeletedShiftIds(Array.from(new Set([...demoDeletedShiftIds, shiftId])));
      setFeedback({ msg: "Směna byla smazána.", success: true });
      if (editingShiftId === shiftId) setEditingShiftId(null);
      return;
    }

    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/shifts?id=${shiftId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setFeedback({ msg: "Směna byla smazána.", success: true });
        if (editingShiftId === shiftId) setEditingShiftId(null);
        await loadEmployeeData();
      } else {
        const data = await res.json();
        setFeedback({ msg: data.error || "Směnu se nepodařilo smazat.", success: false });
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
  const todayKey = getLocalDateKey();
  const upcomingShifts = activeShifts
    .filter((shift) => formatShiftDateKey(shift.date) >= todayKey)
    .slice(0, 5);
  const todaysShift = activeShifts.find((shift) => formatShiftDateKey(shift.date) === todayKey) || null;
  const openLogs = activeLogs
    .filter((log) => !log.checkOut && log.status === "OPEN")
    .sort((a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime());
  const currentOpenLog = openLogs[0] || null;
  const openWorkLog = currentOpenLog?.logType === "WORK" ? currentOpenLog : null;
  const activePauseLog = currentOpenLog && ["LUNCH", "BREAK"].includes(currentOpenLog.logType) ? currentOpenLog : null;
  const shiftNetHours = todaysShift ? calculateShiftNetHours(todaysShift.startTime, todaysShift.endTime) : 0;

  // Helper date formatter
  const formatDateCzech = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" });
  };

  const formatTimeCzech = (isoString: string | null) => {
    if (!isoString) return "--:--";
    return new Date(isoString).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  };

  const renderShiftScheduler = () => {
    if (loggedInRole !== "CEO" || !activeEmployee) return null;

    const plannedHours = calculateShiftNetHours(portalShiftStartTime, portalShiftEndTime);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    return (
      <div className="surface card-accent p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#6e6e73]">Přidat směny</p>
            <h2 className="mt-1 text-lg font-bold text-[#1d1d1f] leading-tight">
              {activeEmployee.lastName} {activeEmployee.firstName}
            </h2>
          </div>
          <div className="rounded-xl border border-black/[0.08] bg-black/[0.04] px-3 py-2 text-right">
            <span className="block text-[9px] font-bold uppercase tracking-widest text-[#6e6e73]">Čistý čas</span>
            <strong className="text-sm font-bold text-[#1d1d1f] font-mono">{plannedHours.toFixed(1)} hod</strong>
          </div>
        </div>

        {feedback && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-xs font-semibold ${
            feedback.success
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
              : "bg-rose-500/15 border-rose-500/30 text-rose-700"
          }`}>
            {feedback.msg}
          </div>
        )}

        <form onSubmit={handlePortalCreateShift} className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Dnes", start: todayKey, end: "" },
              { label: "Zítra", start: getLocalDateKey(tomorrow), end: "" },
              { label: "Tento týden", ...getWeekRange(0) },
              { label: "Příští týden", ...getWeekRange(1) },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setPortalShiftDate(preset.start);
                  setPortalShiftEndDate(preset.end);
                }}
                className="rounded-xl border border-black/[0.08] bg-black/[0.04] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[#1d1d1f] transition-all hover:bg-black/[0.06] active:scale-[0.98]"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                Datum od
              </label>
              <input
                type="date"
                value={portalShiftDate}
                onChange={(e) => {
                  setPortalShiftDate(e.target.value);
                  if (!portalShiftEndDate) setPortalShiftEndDate(e.target.value);
                }}
                required
                className="input text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                Datum do
              </label>
              <input
                type="date"
                value={portalShiftEndDate}
                min={portalShiftDate || undefined}
                onChange={(e) => setPortalShiftEndDate(e.target.value)}
                className="input text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                Od
              </label>
              <input
                type="time"
                value={portalShiftStartTime}
                onChange={(e) => setPortalShiftStartTime(e.target.value)}
                required
                className="input text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                Do
              </label>
              <input
                type="time"
                value={portalShiftEndTime}
                onChange={(e) => setPortalShiftEndTime(e.target.value)}
                required
                className="input text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SHIFT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setPortalShiftStartTime(preset.start);
                  setPortalShiftEndTime(preset.end);
                  if (!portalShiftNote.trim()) setPortalShiftNote(`${preset.label} směna`);
                }}
                className={`rounded-xl border px-3 py-2 text-[10px] font-bold uppercase tracking-wide transition-all active:scale-[0.96] ${
                  portalShiftStartTime === preset.start && portalShiftEndTime === preset.end
                    ? "border-[#0071e3]/30 bg-[#0071e3]/10 text-[#0071e3]"
                    : "border-black/[0.08] bg-black/[0.04] text-[#1d1d1f] hover:bg-black/[0.06]"
                }`}
              >
                {preset.label}
                <span className="block text-[9px] font-mono font-normal text-[#86868b]">
                  {preset.start}-{preset.end}
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
            <div>
              <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                Poznámka
              </label>
              <input
                type="text"
                placeholder="Ranní směna, záskok, inventura..."
                value={portalShiftNote}
                onChange={(e) => setPortalShiftNote(e.target.value)}
                className="input text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary h-[42px] self-end px-5"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <CalendarPlus className="h-3.5 w-3.5" />
                  Uložit směny
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    );
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
            <span className="text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest font-mono">
              {loggedInRole === "CEO" ? "Zaměstnanec:" : "Přihlášen jako:"}
            </span>
            {loggedInRole === "CEO" ? (
              <select
                value={activeEmployee?.id || ""}
                onChange={(e) => {
                  const emp = employees.find((emp) => emp.id === parseInt(e.target.value, 10));
                  if (emp) setActiveEmployee(emp);
                }}
                className="bg-transparent text-xs font-bold text-[#1d1d1f] outline-none cursor-pointer"
              >
                {employees.filter((emp) => emp.role !== "CEO").map((emp) => (
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
              {loggedInRole === "CEO" ? "Plán směn" : "Můj plán směn"} ({activeShifts.length})
            </button>
          </div>

          {activeTab === "attendance" ? (
            <>
              <div className="surface card-accent p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#6e6e73]">Nejbližší směny</p>
                    <h2 className="mt-1 text-xl font-bold text-[#1d1d1f]">
                      {upcomingShifts.length > 0
                        ? `${upcomingShifts.length} směn v plánu`
                        : "Nemáte naplánované žádné směny"}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2 w-full lg:w-auto">
                    {upcomingShifts.length > 0 ? (
                      upcomingShifts.map((shift) => (
                        <div
                          key={shift.id}
                          className={`rounded-xl border px-3 py-2 min-w-[120px] ${
                            formatShiftDateKey(shift.date) === todayKey
                              ? "border-[#0071e3]/30 bg-[#0071e3]/10"
                              : "border-black/[0.08] bg-black/[0.03]"
                          }`}
                        >
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-[#6e6e73]">
                            {new Date(shift.date).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" })}
                          </span>
                          <strong className="mt-1 block text-sm font-bold text-[#1d1d1f]">
                            {shift.startTime} - {shift.endTime}
                          </strong>
                        </div>
                      ))
                    ) : (
                      <div className="sm:col-span-3 lg:col-span-5 rounded-xl border border-black/[0.08] bg-black/[0.03] px-4 py-3 text-xs font-semibold text-[#6e6e73]">
                        Rozpis zatím není vyplněný.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {renderShiftScheduler()}

              {loggedInRole !== "CEO" && (
              <div className="surface card-accent p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#6e6e73]">Dnešní směna</p>
                      {todaysShift ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <strong className="text-xl font-bold text-[#1d1d1f]">
                            {todaysShift.startTime} - {todaysShift.endTime}
                          </strong>
                          <span className="rounded-lg border border-black/[0.08] bg-black/[0.04] px-2 py-1 text-[10px] font-bold text-[#6e6e73]">
                            {shiftNetHours.toFixed(1)} hod čistý
                          </span>
                          {todaysShift.note && (
                            <span className="rounded-lg border border-[#0071e3]/20 bg-[#0071e3]/10 px-2 py-1 text-[10px] font-bold text-[#0071e3]">
                              {todaysShift.note}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1 text-sm font-semibold text-[#6e6e73]">
                          Dnes není naplánovaná směna. Pokud pracujete mimo plán, můžete ji zahájit ručně.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-bold ${
                        currentOpenLog
                          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700"
                          : "border-black/[0.08] bg-black/[0.04] text-[#6e6e73]"
                      }`}>
                        <span className={`h-2 w-2 rounded-full ${currentOpenLog ? "bg-emerald-500" : "bg-[#86868b]"}`} />
                        {currentOpenLog ? `Probíhá: ${getLogTypeLabel(currentOpenLog.logType)} od ${formatTimeCzech(currentOpenLog.checkIn)}` : "Momentálně není spuštěný záznam"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:min-w-[560px]">
                    <button
                      type="button"
                      onClick={() => handleAttendanceAction("START_WORK")}
                      disabled={isLoading || Boolean(currentOpenLog)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0071e3] px-3 py-3 text-xs font-bold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <PlayCircle className="h-4 w-4" />
                      Začít směnu
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAttendanceAction(activePauseLog?.logType === "LUNCH" ? "END_LUNCH" : "START_LUNCH")}
                      disabled={isLoading || (!openWorkLog && activePauseLog?.logType !== "LUNCH")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/15 px-3 py-3 text-xs font-bold text-amber-700 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Utensils className="h-4 w-4" />
                      {activePauseLog?.logType === "LUNCH" ? "Konec oběda" : "Oběd"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAttendanceAction(activePauseLog?.logType === "BREAK" ? "END_BREAK" : "START_BREAK")}
                      disabled={isLoading || (!openWorkLog && activePauseLog?.logType !== "BREAK")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/15 px-3 py-3 text-xs font-bold text-sky-700 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Coffee className="h-4 w-4" />
                      {activePauseLog?.logType === "BREAK" ? "Konec pauzy" : "Pauza"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAttendanceAction("END_SHIFT")}
                      disabled={isLoading || !currentOpenLog}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/15 px-3 py-3 text-xs font-bold text-rose-700 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <StopCircle className="h-4 w-4" />
                      Ukončit směnu
                    </button>
                  </div>
                </div>

                {feedback && (
                  <div className={`mt-4 rounded-xl border px-4 py-3 text-xs font-semibold ${
                    feedback.success
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                      : "bg-rose-500/15 border-rose-500/30 text-rose-700"
                  }`}>
                    {feedback.msg}
                  </div>
                )}
              </div>
              )}

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
                              {getLogTypeLabel(log.logType)}
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
                            <span className="font-bold text-[#1d1d1f]">Oprava: {getLogTypeLabel(req.requestedLogType)}</span>
                            
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
                      const netHours = calculateShiftNetHours(shift.startTime, shift.endTime);
                      const isEditing = editingShiftId === shift.id;
                      const canManageShift = loggedInRole === "CEO";
                      const shiftDateKey = formatShiftDateKey(shift.date);
                      const isToday = shiftDateKey === todayKey;
                      const isPast = shiftDateKey < todayKey;
                      const shiftDate = new Date(shift.date);

                      if (canManageShift && isEditing) {
                        const editedNetHours = calculateShiftNetHours(editShiftStartTime, editShiftEndTime);

                        return (
                          <div key={shift.id} className="my-2 rounded-xl border border-[#0071e3]/20 bg-[#0071e3]/5 p-3 text-xs font-mono">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-[#6e6e73]">
                                Úprava směny
                              </span>
                              <span className="rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-[10px] font-bold text-[#6e6e73]">
                                {editedNetHours.toFixed(1)} hod čistý
                              </span>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                              <div>
                                <label className="block text-[9px] font-bold text-[#6e6e73] uppercase tracking-wide mb-1">Datum</label>
                                <input
                                  type="date"
                                  value={editShiftDate}
                                  onChange={(e) => setEditShiftDate(e.target.value)}
                                  className="input bg-white text-[11px] font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-[#6e6e73] uppercase tracking-wide mb-1">Od</label>
                                <input
                                  type="time"
                                  value={editShiftStartTime}
                                  onChange={(e) => setEditShiftStartTime(e.target.value)}
                                  className="input bg-white text-[11px] font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-[#6e6e73] uppercase tracking-wide mb-1">Do</label>
                                <input
                                  type="time"
                                  value={editShiftEndTime}
                                  onChange={(e) => setEditShiftEndTime(e.target.value)}
                                  className="input bg-white text-[11px] font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-[#6e6e73] uppercase tracking-wide mb-1">Poznámka</label>
                                <input
                                  type="text"
                                  value={editShiftNote}
                                  onChange={(e) => setEditShiftNote(e.target.value)}
                                  className="input bg-white text-[11px]"
                                />
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {SHIFT_PRESETS.map((preset) => (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() => {
                                    setEditShiftStartTime(preset.start);
                                    setEditShiftEndTime(preset.end);
                                  }}
                                  className="rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#6e6e73] transition-all hover:bg-black/[0.04]"
                                >
                                  {preset.label} {preset.start}-{preset.end}
                                </button>
                              ))}
                            </div>

                            <div className="mt-3 flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={handleCancelEditShift}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#6e6e73] transition-all hover:bg-black/[0.04]"
                              >
                                <X className="h-3 w-3" />
                                Zrušit
                              </button>
                              <button
                                type="button"
                                disabled={isLoading}
                                onClick={() => handleUpdateShift(shift.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0071e3] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white transition-all active:scale-[0.97] disabled:opacity-50"
                              >
                                <CheckCircle className="h-3 w-3" />
                                Uložit
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={shift.id}
                          className={`py-4 grid grid-cols-[72px_1fr] gap-3 text-xs font-mono sm:grid-cols-[84px_1fr_auto] sm:items-center ${
                            isPast ? "opacity-70" : ""
                          }`}
                        >
                          <div className={`rounded-xl border px-2 py-2 text-center ${
                            isToday
                              ? "border-[#0071e3]/30 bg-[#0071e3]/10"
                              : "border-black/[0.08] bg-black/[0.04]"
                          }`}>
                            <span className="block text-[9px] font-bold uppercase tracking-widest text-[#6e6e73]">
                              {isToday ? "Dnes" : shiftDate.toLocaleDateString("cs-CZ", { weekday: "short" })}
                            </span>
                            <strong className="block text-lg font-bold leading-tight text-[#1d1d1f]">
                              {shiftDate.toLocaleDateString("cs-CZ", { day: "numeric" })}
                            </strong>
                            <span className="block text-[10px] font-bold text-[#6e6e73]">
                              {shiftDate.toLocaleDateString("cs-CZ", { month: "numeric" })}
                            </span>
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className="text-lg font-bold text-[#1d1d1f] font-mono">
                                {shift.startTime} - {shift.endTime}
                              </strong>
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                isToday
                                  ? "bg-[#0071e3]/10 border-[#0071e3]/20 text-[#0071e3]"
                                  : "bg-black/[0.04] border-black/[0.08] text-[#6e6e73]"
                              }`}>
                                Směna
                              </span>
                              {isPast && (
                                <span className="px-2 py-0.5 rounded-lg border border-black/[0.08] bg-black/[0.03] text-[10px] font-bold text-[#86868b]">
                                  Proběhla
                                </span>
                              )}
                            </div>
                            <div className="text-[#6e6e73] font-sans">
                              {shiftDate.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })}
                              {shift.note && (
                                <span className="text-[#86868b] block text-[10px] mt-0.5 truncate">Poznámka: {shift.note}</span>
                              )}
                            </div>
                          </div>

                          <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 self-end sm:col-span-1 sm:self-auto">
                            <span className="font-bold text-[#6e6e73] bg-black/[0.04] border border-black/[0.08] px-2.5 py-1 rounded-lg text-[10px]">
                              {netHours.toFixed(1)} hod (čistý)
                            </span>
                            {canManageShift && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditShift(shift)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-black/[0.08] bg-black/[0.04] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#6e6e73] transition-all hover:bg-black/[0.06] active:scale-[0.96]"
                                >
                                  <Pencil className="h-3 w-3" />
                                  Upravit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteShift(shift.id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-700 transition-all hover:bg-rose-500/25 active:scale-[0.96]"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Smazat
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* RIGHT: Shift schedule stats summary */}
              <div className="lg:col-span-4 space-y-6">
                {renderShiftScheduler()}

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
                          return acc + calculateShiftNetHours(shift.startTime, shift.endTime);
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
