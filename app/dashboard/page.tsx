"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Activity,
  FileCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Loader2,
  CalendarPlus,
  UserPlus,
  Trash2,
  Users2,
  Eye,
  EyeOff,
  Copy,
  Check,
  X,
  KeyRound,
  Camera,
  Building2,
  UserCheck,
  Users,
} from "lucide-react";
import { createWorker } from "tesseract.js";

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

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatMonthLabel = (monthValue: string) => {
  const [year, month] = monthValue.split("-").map(Number);
  if (!year || !month) return monthValue;

  return new Date(year, month - 1, 1).toLocaleDateString("cs-CZ", {
    month: "long",
    year: "numeric",
  });
};

const formatShiftDateKey = (dateValue: string) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return getLocalDateKey(date);
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

const DEMO_ASSIGNED_SHIFTS_KEY = "checkni-demo-assigned-shifts";

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

interface LiveOccupant {
  id: string;
  type: string; // employee or visitor
  firstName: string;
  lastName: string;
  department?: string;
  organization?: string;
  checkIn: string;
  checkOut: string | null;
  status: string;
  employeeNumber?: string;
  spz?: string | null;
}

interface User {
  id: number;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  department: string;
  role: string;
  hourlyFund: number;
}

interface AttendanceLog {
  id: number;
  userId: number;
  checkIn: string;
  checkOut: string | null;
  logType: string; // WORK, LUNCH, DOCTOR
  status: string; // OK, OPEN, ERROR, MANUALLY_EDITED
  note: string | null;
  originalCheckIn: string | null;
  originalCheckOut: string | null;
  user: User;
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
  user: User;
}

interface Shift {
  id: number;
  userId: number;
  date: string;
  startTime: string;
  endTime: string;
  note: string | null;
  user?: { firstName: string; lastName: string };
}

interface CredentialUser {
  username: string;
  displayName: string;
  role: string;
  employeeNumber: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  email?: string;
  pin?: string;
  hourlyFund?: number;
}

// ============================================
// DEMO MODE MOCK DATA & GENERATORS
// ============================================
const getTodayAtTime = (timeStr: string) => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
};

const demoEmployees: LiveOccupant[] = [
  {
    id: "demo-e-1",
    type: "employee",
    employeeNumber: "2001",
    firstName: "Jan",
    lastName: "Novák",
    department: "Habartov - Výroba",
    checkIn: getTodayAtTime("06:15"),
    checkOut: null,
    status: "Pracuje",
  },
  {
    id: "demo-e-2",
    type: "employee",
    employeeNumber: "2002",
    firstName: "Martin",
    lastName: "Dvořák",
    department: "Svatava - Sklad",
    checkIn: getTodayAtTime("07:30"),
    checkOut: null,
    status: "Na obědě",
  },
  {
    id: "demo-e-3",
    type: "employee",
    employeeNumber: "3001",
    firstName: "Lucie",
    lastName: "Králová",
    department: "Habartov - THP",
    checkIn: getTodayAtTime("08:00"),
    checkOut: null,
    status: "U lékaře",
  },
  {
    id: "demo-e-4",
    type: "employee",
    employeeNumber: "4001",
    firstName: "Josef",
    lastName: "Marek",
    department: "Svatava - Výroba",
    checkIn: getTodayAtTime("06:45"),
    checkOut: null,
    status: "Na přestávce",
  },
  {
    id: "demo-e-5",
    type: "employee",
    employeeNumber: "4002",
    firstName: "Jana",
    lastName: "Svobodová",
    department: "Habartov - Výroba",
    checkIn: getTodayAtTime("07:15"),
    checkOut: null,
    status: "Služební cesta",
  }
];

const demoVisitors: LiveOccupant[] = [
  {
    id: "demo-v-1",
    type: "visitor",
    firstName: "Pavel",
    lastName: "Horák",
    organization: "Servisní partner",
    spz: "1A2 3456",
    checkIn: getTodayAtTime("09:00"),
    checkOut: null,
    status: "V budově",
  },
  {
    id: "demo-v-2",
    type: "visitor",
    firstName: "Milan",
    lastName: "Svoboda",
    organization: "Dopravce",
    spz: "2B4 5678",
    checkIn: getTodayAtTime("08:30"),
    checkOut: null,
    status: "V budově",
  }
];

const demoCredentialUsersSeed: CredentialUser[] = [
  {
    username: "jnovak",
    password: "novak123",
    pin: "2001",
    displayName: "Jan Novák",
    role: "EMPLOYEE",
    employeeNumber: "2001",
    firstName: "Jan",
    lastName: "Novák",
    department: "Habartov - Výroba",
    email: "jan.novak@firma.cz",
    hourlyFund: 40,
  },
  {
    username: "mdvorak",
    password: "dvorak123",
    pin: "2002",
    displayName: "Martin Dvořák",
    role: "EMPLOYEE",
    employeeNumber: "2002",
    firstName: "Martin",
    lastName: "Dvořák",
    department: "Svatava - Sklad",
    email: "martin.dvorak@firma.cz",
    hourlyFund: 40,
  },
  {
    username: "lkralova",
    password: "kralova123",
    pin: "3001",
    displayName: "Lucie Králová",
    role: "MANAGER",
    employeeNumber: "3001",
    firstName: "Lucie",
    lastName: "Králová",
    department: "Habartov - THP",
    email: "lucie.kralova@firma.cz",
    hourlyFund: 40,
  },
  {
    username: "jmarek",
    password: "marek123",
    pin: "4001",
    displayName: "Josef Marek",
    role: "EMPLOYEE",
    employeeNumber: "4001",
    firstName: "Josef",
    lastName: "Marek",
    department: "Svatava - Výroba",
    email: "josef.marek@firma.cz",
    hourlyFund: 40,
  },
  {
    username: "jsvobodova",
    password: "svobodova123",
    pin: "4002",
    displayName: "Jana Svobodová",
    role: "EMPLOYEE",
    employeeNumber: "4002",
    firstName: "Jana",
    lastName: "Svobodová",
    department: "Habartov - Výroba",
    email: "jana.svobodova@firma.cz",
    hourlyFund: 40,
  },
];

const demoRequests: CorrectionRequest[] = [
  {
    id: 9991,
    userId: 9992001,
    attendanceLogId: null,
    requestedCheckIn: new Date("2026-06-19T06:00:00.000Z").toISOString(),
    requestedCheckOut: new Date("2026-06-19T14:30:00.000Z").toISOString(),
    requestedLogType: "WORK",
    reason: "Zapomněl jsem si čip doma, ale normálně jsem odpracoval ranní směnu.",
    status: "PENDING",
    createdAt: new Date("2026-06-19T15:00:00.000Z").toISOString(),
    user: {
      id: 9992001,
      employeeNumber: "2001",
      firstName: "Jan",
      lastName: "Novák",
      department: "Habartov - Výroba",
      role: "EMPLOYEE",
      hourlyFund: 40.0
    }
  },
  {
    id: 9992,
    userId: 9994001,
    attendanceLogId: 8999,
    requestedCheckIn: new Date("2026-06-18T06:45:00.000Z").toISOString(),
    requestedCheckOut: new Date("2026-06-18T15:15:00.000Z").toISOString(),
    requestedLogType: "WORK",
    reason: "Při odchodu nefungoval terminál (vybitá baterie/chyba sítě), odcházel jsem v 15:15.",
    status: "PENDING",
    createdAt: new Date("2026-06-18T16:00:00.000Z").toISOString(),
    user: {
      id: 9994001,
      employeeNumber: "4001",
      firstName: "Josef",
      lastName: "Marek",
      department: "Svatava - Výroba",
      role: "EMPLOYEE",
      hourlyFund: 40.0
    }
  }
];

const generateDemoLogs = (usersList: User[], selectedMonthStr: string) => {
  const [year, month] = selectedMonthStr.split("-").map(Number);
  const demoLogsList: AttendanceLog[] = [];
  let logIdCounter = 8000;

  usersList.forEach(user => {
    if (user.role === "CEO") return;

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
            user,
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
            user,
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
        user,
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
          user,
        });
      }
    }
  });

  return demoLogsList;
};

export default function DashboardPage() {
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Demo Mode States
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [processedDemoReqs, setProcessedDemoReqs] = useState<number[]>([]);

  const [liveOccupants, setLiveOccupants] = useState<{ visitors: LiveOccupant[]; employees: LiveOccupant[] }>({
    visitors: [],
    employees: [],
  });
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);

  // Shift planning states
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [demoAssignedShifts, setDemoAssignedShifts] = useState<Shift[]>([]);
  const [newShiftUserId, setNewShiftUserId] = useState("");
  const [newShiftDate, setNewShiftDate] = useState("");
  const [newShiftEndDate, setNewShiftEndDate] = useState("");
  const [newShiftStartTime, setNewShiftStartTime] = useState("08:00");
  const [newShiftEndTime, setNewShiftEndTime] = useState("16:30");
  const [newShiftNote, setNewShiftNote] = useState("");
  // Inline shift editing states
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [editShiftDate, setEditShiftDate] = useState("");
  const [editShiftStartTime, setEditShiftStartTime] = useState("");
  const [editShiftEndTime, setEditShiftEndTime] = useState("");
  const [editShiftNote, setEditShiftNote] = useState("");
  // Shift list filters
  const [shiftFilterUserId, setShiftFilterUserId] = useState("");
  const [shiftFilterDate, setShiftFilterDate] = useState("");
  const [activeTab, setActiveTab] = useState<"presence_approvals" | "payroll" | "shifts" | "employees_mgmt">("presence_approvals");

  // Reusable shift presets (start/end). Lunch auto-deducted later for shifts > 6h.
  const SHIFT_PRESETS = [
    { label: "Ranní", start: "06:00", end: "14:30" },
    { label: "Odpolední", start: "14:00", end: "22:30" },
    { label: "Denní", start: "08:00", end: "16:30" },
    { label: "Noční", start: "22:00", end: "06:00" },
  ];

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DEMO_ASSIGNED_SHIFTS_KEY);
      if (stored) {
        setDemoAssignedShifts(JSON.parse(stored));
      }
    } catch {
      setDemoAssignedShifts([]);
    }
  }, []);

  // Employee management states
  const [credentialUsers, setCredentialUsers] = useState<CredentialUser[]>([]);
  const [demoCredentialUsers, setDemoCredentialUsers] = useState<CredentialUser[]>(demoCredentialUsersSeed);
  const [selectedCredential, setSelectedCredential] = useState<CredentialUser | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [newEmpUsername, setNewEmpUsername] = useState("");
  const [newEmpPassword, setNewEmpPassword] = useState("");
  const [newEmpRole, setNewEmpRole] = useState("EMPLOYEE");
  const [newEmpFirstName, setNewEmpFirstName] = useState("");
  const [newEmpLastName, setNewEmpLastName] = useState("");
  const [newEmpDepartment, setNewEmpDepartment] = useState("");
  const [newEmpEmail, setNewEmpEmail] = useState("");
  const [newEmpPin, setNewEmpPin] = useState("");

  // Stavy pro nahrávání občanského průkazu (OCR přes Tesseract.js)
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      window.location.replace("/login?redirect=/dashboard");
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
  
  // UI filter states
  const [selectedMonth, setSelectedMonth] = useState("2026-06");
  const [searchQuery, setSearchQuery] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; error: boolean } | null>(null);

  // Load all dashboard datasets
  const loadDashboardData = async () => {
    setIsUpdating(true);
    setStatusMsg(null);
    try {
      // 1. Live occupants
      const liveRes = await fetch("/api/attendance/live");
      if (liveRes.ok) {
        const liveData = await liveRes.json();
        setLiveOccupants(liveData);
      }

      // 2. Users directory
      const usersRes = await fetch("/api/users");
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData);
      }

      // 3. Correction requests
      const reqsRes = await fetch("/api/portal/requests?status=PENDING");
      if (reqsRes.ok) {
        const reqsData = await reqsRes.json();
        setRequests(reqsData);
      }

      // 4. Logs for current month
      const logsRes = await fetch(`/api/attendance/logs?month=${selectedMonth}`);
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData);
      }

      // 5. Fetch shifts
      const shiftsRes = await fetch("/api/shifts");
      if (shiftsRes.ok) {
        const shiftsData = await shiftsRes.json();
        setAllShifts(shiftsData);
      }

      // 6. Fetch credential users
      const credRes = await fetch("/api/auth/employees");
      if (credRes.ok) {
        const credData = await credRes.json();
        setCredentialUsers(credData);
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ text: "Chyba při komunikaci s API.", error: true });
    } finally {
      setIsUpdating(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadDashboardData();
  }, [selectedMonth]);

  // Handle correction approval/rejection
  const handleProcessRequest = async (requestId: number, approve: boolean) => {
    if (isDemoMode && (requestId === 9991 || requestId === 9992)) {
      setStatusMsg({ text: `Žádost úspěšně ${approve ? "schválena" : "zamítnuta"}.`, error: false });
      setProcessedDemoReqs(prev => [...prev, requestId]);
      return;
    }
    setIsUpdating(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/portal/requests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          status: approve ? "APPROVED" : "REJECTED",
          approvedById: 1001, // Simulate Petr Bureš (CEO) as approver
        }),
      });

      if (res.ok) {
        setStatusMsg({ text: `Žádost úspěšně ${approve ? "schválena" : "zamítnuta"}.`, error: false });
        loadDashboardData();
      } else {
        const err = await res.json();
        setStatusMsg({ text: err.error || "Chyba zpracování žádosti.", error: true });
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ text: "Spojení se nezdařilo.", error: true });
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle creating a new shift
  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShiftUserId || !newShiftDate || !newShiftStartTime || !newShiftEndTime) {
      setStatusMsg({ text: "Vyplňte prosím všechna povinná pole.", error: true });
      return;
    }

    const startDate = new Date(newShiftDate);
    const endDate = newShiftEndDate ? new Date(newShiftEndDate) : startDate;
    if (endDate < startDate) {
      setStatusMsg({ text: "Datum do nesmí být před datem od.", error: true });
      return;
    }

    if (isDemoMode) {
      const selectedUser = users.find((u) => u.id === parseInt(newShiftUserId, 10));
      if (!selectedUser) {
        setStatusMsg({ text: "Vyberte platného zaměstnance.", error: true });
        return;
      }

      const createdDates: Date[] = [];
      const cursor = new Date(startDate);
      while (cursor <= endDate) {
        createdDates.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }

      const createdShifts: Shift[] = createdDates.map((shiftDate, index) => ({
        id: Date.now() + index,
        userId: selectedUser.id,
        date: getLocalDateKey(shiftDate),
        startTime: newShiftStartTime,
        endTime: newShiftEndTime,
        note: newShiftNote.trim() || null,
        user: {
          firstName: selectedUser.firstName,
          lastName: selectedUser.lastName,
        },
      }));

      const nextShifts = [...demoAssignedShifts, ...createdShifts];
      setDemoAssignedShifts(nextShifts);
      window.localStorage.setItem(DEMO_ASSIGNED_SHIFTS_KEY, JSON.stringify(nextShifts));
      setStatusMsg({
        text: createdShifts.length === 1 ? "Směna byla úspěšně naplánována." : `Naplánováno směn: ${createdShifts.length}.`,
        error: false,
      });
      setNewShiftDate("");
      setNewShiftEndDate("");
      setNewShiftNote("");
      return;
    }

    setIsUpdating(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: parseInt(newShiftUserId, 10),
          date: newShiftDate,
          dateTo: newShiftEndDate || newShiftDate,
          startTime: newShiftStartTime,
          endTime: newShiftEndTime,
          note: newShiftNote,
        }),
      });
      if (res.ok) {
        setStatusMsg({ text: "Směna byla úspěšně naplánována.", error: false });
        setNewShiftDate("");
        setNewShiftEndDate("");
        setNewShiftNote("");
        loadDashboardData();
      } else {
        const data = await res.json();
        setStatusMsg({ text: data.error || "Chyba při plánování směny.", error: true });
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ text: "Nepodařilo se odeslat data.", error: true });
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle deleting a shift
  const handleDeleteShift = async (shiftId: number) => {
    if (!confirm("Opravdu chcete smazat tuto směnu?")) return;

    if (isDemoMode) {
      const nextShifts = demoAssignedShifts.filter((shift) => shift.id !== shiftId);
      setDemoAssignedShifts(nextShifts);
      window.localStorage.setItem(DEMO_ASSIGNED_SHIFTS_KEY, JSON.stringify(nextShifts));
      setStatusMsg({ text: "Směna byla úspěšně smazána.", error: false });
      return;
    }

    setIsUpdating(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/shifts?id=${shiftId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setStatusMsg({ text: "Směna byla úspěšně smazána.", error: false });
        loadDashboardData();
      } else {
        const data = await res.json();
        setStatusMsg({ text: data.error || "Chyba při mazání směny.", error: true });
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ text: "Chyba při komunikaci se serverem.", error: true });
    } finally {
      setIsUpdating(false);
    }
  };

  // Enter inline edit mode for a shift, pre-filling the editable fields
  const handleStartEditShift = (shift: Shift) => {
    setEditingShiftId(shift.id);
    // Normalize date to YYYY-MM-DD for the date input
    setEditShiftDate(formatShiftDateKey(shift.date));
    setEditShiftStartTime(shift.startTime);
    setEditShiftEndTime(shift.endTime);
    setEditShiftNote(shift.note || "");
    setStatusMsg(null);
  };

  const handleCancelEditShift = () => {
    setEditingShiftId(null);
  };

  // Save edits to an existing shift via PATCH
  const handleUpdateShift = async (shiftId: number) => {
    if (!editShiftDate || !editShiftStartTime || !editShiftEndTime) {
      setStatusMsg({ text: "Vyplňte prosím datum, začátek i konec směny.", error: true });
      return;
    }
    if (editShiftStartTime === editShiftEndTime) {
      setStatusMsg({ text: "Začátek a konec směny nesmí být shodné.", error: true });
      return;
    }

    if (isDemoMode) {
      const nextShifts = demoAssignedShifts.map((shift) => (
        shift.id === shiftId
          ? {
              ...shift,
              date: editShiftDate,
              startTime: editShiftStartTime,
              endTime: editShiftEndTime,
              note: editShiftNote.trim() || null,
            }
          : shift
      ));
      setDemoAssignedShifts(nextShifts);
      window.localStorage.setItem(DEMO_ASSIGNED_SHIFTS_KEY, JSON.stringify(nextShifts));
      setStatusMsg({ text: "Směna byla úspěšně upravena.", error: false });
      setEditingShiftId(null);
      return;
    }

    setIsUpdating(true);
    setStatusMsg(null);
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
        setStatusMsg({ text: "Směna byla úspěšně upravena.", error: false });
        setEditingShiftId(null);
        loadDashboardData();
      } else {
        const data = await res.json();
        setStatusMsg({ text: data.error || "Chyba při úpravě směny.", error: true });
      }
    } catch (err) {
      console.error(err);
      setStatusMsg({ text: "Nepodařilo se odeslat data.", error: true });
    } finally {
      setIsUpdating(false);
    }
  };

  // Compute net hours (auto -30 min lunch deduction for shifts over 6h) from HH:MM strings
  const computeNetHours = (startTime: string, endTime: string) => {
    const [sh, sm] = startTime.split(":").map((n) => parseInt(n, 10));
    const [eh, em] = endTime.split(":").map((n) => parseInt(n, 10));
    if ([sh, sm, eh, em].some((n) => isNaN(n))) return 0;
    let diffHours = (eh * 60 + em - (sh * 60 + sm)) / 60;
    if (diffHours < 0) diffHours += 24;
    return diffHours > 6.0 ? diffHours - 0.5 : diffHours;
  };

  const payrollLogs = useMemo(
    () => isDemoMode ? [...logs, ...generateDemoLogs(users, selectedMonth)] : logs,
    [isDemoMode, logs, selectedMonth, users]
  );

  // Precise Shift & Bonus Calculator (Afternoon 5%, Night 15%, Weekend 15%, Overtime, Auto Lunch Breaks)
  const calculateEmployeeStats = (empId: number) => {
    const empLogs = payrollLogs.filter((l) => l.userId === empId);
    let totalWorkHours = 0;
    let afternoonHours = 0;
    let nightHours = 0;
    let weekendHours = 0;
    let hasAnomaly = false;
    let overlapsCount = 0;

    empLogs.forEach((log) => {
      if (log.status === "ERROR") hasAnomaly = true;
    });

    // Detect overlapping work logs. Lunch/doctor records can intentionally sit inside a work shift.
    const workLogs = empLogs.filter((log) => log.logType === "WORK" && log.status !== "ERROR" && log.checkOut);
    workLogs.forEach((logA, idxA) => {
      const startA = new Date(logA.checkIn).getTime();
      const endA = new Date(logA.checkOut as string).getTime();

      workLogs.slice(idxA + 1).forEach((logB) => {
        const startB = new Date(logB.checkIn).getTime();
        const endB = new Date(logB.checkOut as string).getTime();
        if (startA < endB && startB < endA) {
          overlapsCount++;
        }
      });
    });

    // Compute logs
    empLogs.forEach((log) => {
      if (log.checkOut && log.logType === "WORK" && log.status !== "ERROR") {
        const checkIn = new Date(log.checkIn);
        const checkOut = new Date(log.checkOut);
        
        const shiftMs = checkOut.getTime() - checkIn.getTime();
        let shiftHours = shiftMs / (1000 * 60 * 60);

        // Law-regulated Auto Lunch Break subtraction: if working continuously > 6 hours, deduct 30 minutes
        if (shiftHours > 6.0) {
          shiftHours -= 0.5;
        }

        totalWorkHours += shiftHours;

        // Differential bonus checks
        const cursor = new Date(checkIn);
        const stepMs = 15 * 60 * 1000; // 15-minute resolution checks
        const stepHr = 0.25;

        while (cursor < checkOut) {
          const hr = cursor.getHours() + cursor.getMinutes() / 60;
          const day = cursor.getDay();
          const isWknd = day === 0 || day === 6;

          if (isWknd) {
            weekendHours += stepHr;
          }
          if (hr >= 22 || hr < 6) {
            nightHours += stepHr;
          } else if (hr >= 14 && hr < 22) {
            afternoonHours += stepHr;
          }

          cursor.setTime(cursor.getTime() + stepMs);
        }
      }
    });

    const user = users.find((u) => u.id === empId);
    const fund = user ? user.hourlyFund * 4 : 160.0;
    const balance = totalWorkHours - fund;

    return {
      total: parseFloat(totalWorkHours.toFixed(2)),
      afternoon: parseFloat(afternoonHours.toFixed(2)),
      night: parseFloat(nightHours.toFixed(2)),
      weekend: parseFloat(weekendHours.toFixed(2)),
      balance: parseFloat(balance.toFixed(2)),
      hasAnomaly,
      hasOverlap: overlapsCount > 0,
    };
  };

  // OCR zpracování souboru (OP/Pas) shodné s Kartou příchodu
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIdCardFile(file);
    setIsScanning(true);
    setScanProgress(0);
    setStatusMsg(null);

    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

    try {
      const img = await loadImage(file);
      const canvas = preprocessImage(img);

      // Fáze 1: Čtení MRZ (Machine Readable Zone) na zadní straně
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
        if (mrzData.jmeno) setNewEmpFirstName(mrzData.jmeno);
        if (mrzData.prijmeni) setNewEmpLastName(mrzData.prijmeni);
        setStatusMsg({ text: "Občanský průkaz načten ze zadní strany (MRZ).", error: false });
        setScanProgress(100);
        return;
      }

      // Fáze 2: Čtení přední strany (ces+eng)
      worker = await createWorker("ces+eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing") {
            setScanProgress(50 + Math.round(m.progress * 50));
          }
        },
      });

      const { data: { text: fallbackText } } = await worker.recognize(canvas);
      const fallbackData = parseFallback(fallbackText);

      if (fallbackData.jmeno) setNewEmpFirstName(fallbackData.jmeno);
      if (fallbackData.prijmeni) setNewEmpLastName(fallbackData.prijmeni);

      if (fallbackData.jmeno || fallbackData.prijmeni) {
        setStatusMsg({ text: "Občanský průkaz načten z přední strany.", error: false });
      } else {
        setStatusMsg({ text: "Na dokladu nebyly rozpoznány čitelné údaje. Zadejte jméno ručně.", error: true });
      }
      setScanProgress(100);
    } catch (err) {
      console.error(err);
      setStatusMsg({ text: "Chyba při OCR zpracování. Vyplňte údaje ručně.", error: true });
    } finally {
      if (worker) {
        await worker.terminate();
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsScanning(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idCardFile) {
      setStatusMsg({ text: "Pro přidání nového zaměstnance musíte nahrát občanský průkaz.", error: true });
      return;
    }
    if (!newEmpUsername || !newEmpPassword || !newEmpFirstName || !newEmpLastName || !newEmpDepartment) {
      setStatusMsg({ text: "Vyplňte všechna povinná pole.", error: true });
      return;
    }

    if (isDemoMode) {
      const displayName = `${newEmpFirstName} ${newEmpLastName}`;
      const nextEmployeeNumber = String(5000 + demoCredentialUsers.length + 1);
      setDemoCredentialUsers((prev) => [
        ...prev,
        {
          username: newEmpUsername,
          password: newEmpPassword,
          displayName,
          role: newEmpRole,
          employeeNumber: nextEmployeeNumber,
          firstName: newEmpFirstName,
          lastName: newEmpLastName,
          department: newEmpDepartment,
          email: newEmpEmail || undefined,
          pin: newEmpPin || undefined,
          hourlyFund: 40,
        },
      ]);
      setStatusMsg({ text: `Zaměstnanec ${displayName} byl přidán.`, error: false });
      setNewEmpUsername("");
      setNewEmpPassword("");
      setNewEmpRole("EMPLOYEE");
      setNewEmpFirstName("");
      setNewEmpLastName("");
      setNewEmpDepartment("");
      setNewEmpEmail("");
      setNewEmpPin("");
      setIdCardFile(null);
      return;
    }

    setIsUpdating(true);
    setStatusMsg(null);
    try {
      const displayName = `${newEmpFirstName} ${newEmpLastName}`;
      const res = await fetch("/api/auth/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newEmpUsername,
          password: newEmpPassword,
          displayName,
          role: newEmpRole,
          firstName: newEmpFirstName,
          lastName: newEmpLastName,
          department: newEmpDepartment,
          email: newEmpEmail || null,
          pin: newEmpPin || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg({ text: `Zaměstnanec ${displayName} byl přidán do systému i databáze.`, error: false });
        setNewEmpUsername("");
        setNewEmpPassword("");
        setNewEmpRole("EMPLOYEE");
        setNewEmpFirstName("");
        setNewEmpLastName("");
        setNewEmpDepartment("");
        setNewEmpEmail("");
        setNewEmpPin("");
        setIdCardFile(null);
        loadDashboardData();
      } else {
        setStatusMsg({ text: data.error || "Chyba při přidávání.", error: true });
      }
    } catch {
      setStatusMsg({ text: "Chyba spojení se serverem.", error: true });
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle removing an employee credential
  const handleRemoveEmployee = async (username: string, displayName: string) => {
    if (!confirm(`Opravdu chcete odebrat zaměstnance ${displayName} (${username})?`)) return;

    if (isDemoMode) {
      setDemoCredentialUsers((prev) => prev.filter((cred) => cred.username !== username));
      if (selectedCredential?.username === username) {
        setSelectedCredential(null);
      }
      setStatusMsg({ text: `Zaměstnanec ${displayName} byl odebrán.`, error: false });
      return;
    }

    setIsUpdating(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/auth/employees?username=${encodeURIComponent(username)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg({ text: `Zaměstnanec ${displayName} byl odebrán.`, error: false });
        loadDashboardData();
      } else {
        setStatusMsg({ text: data.error || "Chyba při odebírání.", error: true });
      }
    } catch {
      setStatusMsg({ text: "Chyba spojení se serverem.", error: true });
    } finally {
      setIsUpdating(false);
    }
  };

  // Open the detail panel for one employee.
  const handleSelectEmployee = async (username: string) => {
    setShowPassword(false);
    setCopiedField(null);
    setDetailLoading(true);
    setSelectedCredential({ username, displayName: "", role: "", employeeNumber: "" });

    if (isDemoMode) {
      const credential = demoCredentialUsers.find((cred) => cred.username === username);
      if (credential) {
        setSelectedCredential(credential);
      } else {
        setStatusMsg({ text: "Detail se nepodařilo načíst.", error: true });
        setSelectedCredential(null);
      }
      setDetailLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/auth/employees?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedCredential(data);
      } else {
        setStatusMsg({ text: data.error || "Detail se nepodařilo načíst.", error: true });
        setSelectedCredential(null);
      }
    } catch {
      setStatusMsg({ text: "Chyba spojení se serverem.", error: true });
      setSelectedCredential(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // Copy a value to clipboard and flash a confirmation on that field
  const handleCopy = async (field: string, value?: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  // Get active occupants counts
  const currentEmployees = isDemoMode
    ? [...liveOccupants.employees, ...demoEmployees]
    : liveOccupants.employees;
  const currentVisitors = isDemoMode
    ? [...liveOccupants.visitors, ...demoVisitors]
    : liveOccupants.visitors;

  const activeEmployeeList = currentEmployees.filter((e) => !e.checkOut);
  const activeVisitorList = currentVisitors.filter((v) => !v.checkOut);
  const totalInsideCount = activeVisitorList.length + activeEmployeeList.length;
  const employeesInsideCount = activeEmployeeList.length;
  const visitorsInsideCount = activeVisitorList.length;

  const activeRequests = isDemoMode
    ? [...requests, ...demoRequests.filter(req => !processedDemoReqs.includes(req.id))]
    : requests;
  const activeCredentialUsers = isDemoMode ? demoCredentialUsers : credentialUsers;

  // Payroll CSV Generator
  const handleExportPayroll = () => {
    const csvHeaders = ["Osobní číslo", "Příjmení", "Jméno", "Oddělení", "Odpracované hodiny (Čisté)", "Odpolední hodiny (5%)", "Noční hodiny (15%)", "Víkendové hodiny (15%)", "Měsíční Fond", "Saldo (Přesčasy)", "Anomálie v docházce"];
    
    const rows = users.filter((user) => user.role !== "CEO").map((user) => {
      const stats = calculateEmployeeStats(user.id);
      const fund = user.hourlyFund * 4;
      return [
        user.employeeNumber,
        user.lastName,
        user.firstName,
        user.department,
        stats.total,
        stats.afternoon,
        stats.night,
        stats.weekend,
        fund,
        stats.balance,
        stats.hasAnomaly || stats.hasOverlap ? "ANO (Zkontrolujte)" : "NE",
      ];
    });

    const csvContent = [
      csvHeaders.join(","),
      ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mzdy-ept-connector-${selectedMonth}.csv`;
    link.click();
  };

  // Filtered employees listing
  const filteredUsers = users.filter((u) => {
    if (u.role === "CEO") return false;
    const query = searchQuery.toLowerCase();
    return (
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(query) ||
      u.employeeNumber.includes(query) ||
      u.department.toLowerCase().includes(query)
    );
  });

  const payrollRows = filteredUsers.map((user) => ({
    user,
    stats: calculateEmployeeStats(user.id),
  }));
  const payrollOverviewRows = users
    .filter((user) => user.role !== "CEO")
    .map((user) => ({
      user,
      stats: calculateEmployeeStats(user.id),
    }));
  const payrollWarningCount = payrollOverviewRows.filter(({ stats }) => stats.hasAnomaly || stats.hasOverlap).length;
  const negativeBalanceCount = payrollOverviewRows.filter(({ stats }) => stats.balance < 0).length;
  const overtimeCount = payrollOverviewRows.filter(({ stats }) => stats.balance > 0).length;
  const payrollTotalHours = payrollOverviewRows.reduce((sum, { stats }) => sum + stats.total, 0);
  const scheduledShifts = isDemoMode ? demoAssignedShifts : allShifts;
  const todayKey = getLocalDateKey();
  const selectedMonthLabel = formatMonthLabel(selectedMonth);
  const todaysShifts = scheduledShifts.filter((shift) => formatShiftDateKey(shift.date) === todayKey);
  const upcomingShifts = scheduledShifts
    .filter((shift) => formatShiftDateKey(shift.date) >= todayKey)
    .sort((a, b) => `${formatShiftDateKey(a.date)} ${a.startTime}`.localeCompare(`${formatShiftDateKey(b.date)} ${b.startTime}`));
  const presenceSummary = totalInsideCount === 0
    ? "Budova je prázdná"
    : `${totalInsideCount} osob uvnitř`;
  const openShiftPlanner = (employee?: User | null) => {
    const nextWeek = getWeekRange(1);

    setActiveTab("shifts");
    setNewShiftDate(nextWeek.start);
    setNewShiftEndDate(nextWeek.end);

    if (employee) {
      const userId = String(employee.id);
      setNewShiftUserId(userId);
      setShiftFilterUserId(userId);
    }
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

      <header className="lg:sticky lg:top-0 z-30 glass-bar border-b border-black/[0.08] px-6 py-5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <p className="eyebrow">Management</p>
              <h1 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">Provozní dashboard</h1>
              <p className="text-xs font-semibold text-[#6e6e73] mt-1">
                {presenceSummary} · {selectedMonthLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => openShiftPlanner()}
              className="btn-primary !py-2 !px-4"
            >
              <CalendarPlus className="h-4 w-4" />
              Přidat směnu
            </button>

            {/* Date month selector */}
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="input !w-auto !py-2 font-mono font-bold text-xs"
            />

            <button
              onClick={loadDashboardData}
              disabled={isUpdating}
              className="btn-ghost !px-2.5 !py-2.5"
            >
              <RefreshCw className={`h-4 w-4 ${isUpdating ? "animate-spin" : ""}`} />
            </button>

          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 lg:px-6 mt-8 space-y-8">
        
        {/* Status messages */}
        {statusMsg && (
          <div className={`p-4 rounded-xl border text-sm font-semibold flex items-center gap-2.5 shadow-sm animate-in fade-in ${
            statusMsg.error ? "bg-rose-500/15 border-rose-500/30 text-rose-700" : "bg-emerald-500/15 border-emerald-500/30 text-emerald-700"
          }`}>
            {statusMsg.error ? <AlertTriangle className="h-5 w-5 text-rose-600" /> : <CheckCircle className="h-5 w-5 text-emerald-600" />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* TILES TICKERS: Real-time counts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">

          <button
            type="button"
            onClick={() => setActiveTab("presence_approvals")}
            className="stat-card animate-rise text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0071e3]/20"
          >
            <div className="flex items-start justify-between">
              <span className="eyebrow">Osob v budově celkem</span>
              <span className="stat-icon bg-black/[0.04] text-[#6e6e73]"><Users className="h-5 w-5" /></span>
            </div>
            <div className="flex items-baseline gap-2">
              <strong className="text-4xl font-bold text-[#1d1d1f] tabular-nums">{totalInsideCount}</strong>
              <span className="text-[11px] font-bold text-[#86868b]">aktuální stav</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("presence_approvals")}
            className="stat-card animate-rise text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0071e3]/20"
            style={{ animationDelay: "40ms" }}
          >
            <div className="flex items-start justify-between">
              <span className="eyebrow">Zaměstnanci uvnitř</span>
              <span className="stat-icon bg-emerald-500/15 text-emerald-600"><UserCheck className="h-5 w-5" /></span>
            </div>
            <div className="flex items-baseline gap-2">
              <strong className="text-4xl font-bold text-emerald-600 tabular-nums">{employeesInsideCount}</strong>
              <span className="text-[11px] font-bold text-[#86868b]">příchody logovány</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("presence_approvals")}
            className="stat-card animate-rise text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0071e3]/20"
            style={{ animationDelay: "80ms" }}
          >
            <div className="flex items-start justify-between">
              <span className="eyebrow">Zákazníci / Hosté</span>
              <span className="stat-icon bg-amber-500/15 text-amber-600"><Building2 className="h-5 w-5" /></span>
            </div>
            <div className="flex items-baseline gap-2">
              <strong className="text-4xl font-bold text-amber-600 tabular-nums">{visitorsInsideCount}</strong>
              <span className="text-[11px] font-bold text-[#86868b]">kniha návštěv</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("presence_approvals")}
            className="stat-card animate-rise text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0071e3]/20"
            style={{ animationDelay: "120ms" }}
          >
            <div className="flex items-start justify-between">
              <span className="eyebrow">Nevyřízené korekce</span>
              <span className={`stat-icon ${activeRequests.length > 0 ? "bg-rose-500/15 text-rose-600" : "bg-black/[0.06] text-[#86868b]"}`}><FileCheck className="h-5 w-5" /></span>
            </div>
            <div className="flex items-baseline gap-2">
              <strong className={`text-4xl font-bold tabular-nums ${activeRequests.length > 0 ? "text-rose-600" : "text-[#86868b]"}`}>
                {activeRequests.length}
              </strong>
              <span className="text-[11px] font-bold text-[#86868b]">žádostí ke schválení</span>
            </div>
          </button>

        </div>

        {/* Tab Selector */}
        <div className="flex flex-wrap gap-2 rounded-2xl border border-white/80 bg-white/45 p-1 shadow-sm">
          {[
            { id: "presence_approvals", label: "Přítomnost", count: totalInsideCount + activeRequests.length },
            { id: "payroll", label: "Mzdy", count: payrollWarningCount > 0 ? payrollWarningCount : payrollOverviewRows.length },
            { id: "shifts", label: "Směny", count: scheduledShifts.length },
            { id: "employees_mgmt", label: "Zaměstnanci", count: activeCredentialUsers.length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-white text-[#1d1d1f] shadow-sm"
                  : "text-[#6e6e73] hover:bg-white/60 hover:text-[#1d1d1f]"
              }`}
            >
              {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                activeTab === tab.id ? "bg-[#0071e3]/10 text-[#0071e3]" : "bg-black/[0.04] text-[#86868b]"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {activeTab === "presence_approvals" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-200">
            
            {/* LEFT COLUMN: LIVE presence list */}
            <div className="lg:col-span-6 space-y-8">
              <div className="surface card-accent text-[#1d1d1f] p-5">

                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#1d1d1f] flex items-center gap-1.5">
                    Kdo je aktuálně ve firmě
                  </h3>
                </div>

                {totalInsideCount === 0 ? (
                  <p className="py-8 text-center text-xs text-[#6e6e73] font-semibold italic">Budova je prázdná.</p>
                ) : (
                  <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1 premium-scroll">
                    
                    {/* Active Employees */}
                    {activeEmployeeList.map((occ) => (
                      <div key={occ.id} className="bg-black/[0.04] border border-black/[0.08] rounded-xl p-3 text-xs flex justify-between items-center gap-4">
                        <div>
                          <div className="font-bold text-[#1d1d1f]">{occ.lastName} {occ.firstName}</div>
                          <div className="text-[10px] text-[#6e6e73] mt-0.5">{occ.department}</div>
                          <div className="text-[9px] text-[#6e6e73] font-mono mt-1">Příchod: {new Date(occ.checkIn).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-[6px] text-[9px] font-bold uppercase tracking-wider ${
                          occ.status === "Na obědě" 
                            ? "bg-amber-500/15 border border-amber-500/30 text-amber-700" 
                            : occ.status === "U lékaře" 
                            ? "bg-sky-500/15 border border-sky-500/30 text-sky-700"
                            : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-700"
                        }`}>
                          {occ.status}
                        </span>
                      </div>
                    ))}

                    {/* Active Visitors */}
                    {activeVisitorList.map((occ) => (
                      <div key={occ.id} className="bg-black/[0.04] border border-black/[0.08] rounded-xl p-3 text-xs flex justify-between items-center gap-4">
                        <div>
                          <div className="font-bold text-amber-700">Host: {occ.lastName} {occ.firstName}</div>
                          <div className="text-[10px] text-[#6e6e73] mt-0.5">Firma: {occ.organization}</div>
                          <div className="text-[9px] text-amber-600 font-mono mt-1">Příchod: {new Date(occ.checkIn).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                        <span className="bg-amber-500/15 border border-amber-500/30 text-amber-700 px-2 py-0.5 rounded-[6px] text-[9px] font-bold uppercase tracking-wider">
                          Zakázka / Host
                        </span>
                      </div>
                    ))}

                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Correction approvals */}
            <div className="lg:col-span-6">
              <div className="surface card-accent p-5">
                
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#1d1d1f] mb-4 flex items-center gap-1.5">
                  <FileCheck className="h-4 w-4 text-[#6e6e73]" />
                  Schvalování oprav docházky
                </h3>

                {activeRequests.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#6e6e73] italic bg-black/[0.04] border border-black/[0.08] rounded-xl font-bold uppercase tracking-wider">
                    Žádné žádosti k vyřízení.
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1 premium-scroll">
                    {activeRequests.map((req) => (
                      <div key={req.id} className="bg-black/[0.04] border border-black/[0.08] rounded-xl p-3.5 space-y-3">
                        
                        <div className="text-xs font-mono">
                          <strong className="text-[#1d1d1f] block">{req.user.lastName} {req.user.firstName}</strong>
                          <span className="text-[10px] text-[#6e6e73]">{req.user.department}</span>
                        </div>

                        <div className="bg-white border border-black/[0.08] rounded-lg p-2.5 text-[10px] font-mono space-y-1 text-[#1d1d1f]">
                          <div className="text-[#6e6e73] font-bold">Typ: {req.requestedLogType}</div>
                          <div>Změna: {req.requestedCheckIn ? new Date(req.requestedCheckIn).toLocaleDateString("cs-CZ") : ""}</div>
                          <div>Příchod: {req.requestedCheckIn ? new Date(req.requestedCheckIn).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</div>
                          <div>Odchod: {req.requestedCheckOut ? new Date(req.requestedCheckOut).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</div>
                          
                          <div className="italic text-[#6e6e73] border-l border-black/[0.08] pl-1.5 mt-2 max-h-[50px] overflow-y-auto font-sans leading-relaxed">
                            &quot;{req.reason}&quot;
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            onClick={() => handleProcessRequest(req.id, true)}
                            disabled={isUpdating}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 rounded-lg text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all active:scale-[0.98] w-full"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Schválit
                          </button>
                          <button
                            onClick={() => handleProcessRequest(req.id, false)}
                            disabled={isUpdating}
                            className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-1.5 rounded-lg text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all active:scale-[0.98] w-full"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Zamítnout
                          </button>
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {activeTab === "payroll" && (
          <div className="animate-in fade-in duration-200">
            {/* Payroll Wages table & Anomaly panel */}
            <div className="surface card-accent p-6">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-sm font-bold text-[#1d1d1f] uppercase tracking-widest">
                    Zpracování mezd & Podklady
                  </h3>
                  <p className="text-[10px] text-[#6e6e73] font-bold uppercase tracking-widest mt-0.5">Autom. odečten oběd (-30 min) u směn nad 6h</p>
                </div>
                
                <button
                  onClick={handleExportPayroll}
                  disabled={users.length === 0}
                  className="inline-flex items-center justify-center gap-2 bg-[#0071e3] hover:bg-[#0077ed] text-white py-2.5 px-4 rounded-xl text-xs font-bold shadow-md transition-all active:scale-[0.99] uppercase tracking-wider"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Stáhnout podklady (CSV)
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="rounded-xl border border-black/[0.08] bg-black/[0.03] p-3">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#6e6e73]">
                    <Activity className="h-3.5 w-3.5" />
                    Odpracováno
                  </span>
                  <strong className="mt-1 block text-lg font-bold text-[#1d1d1f]">{payrollTotalHours.toFixed(1)}h</strong>
                </div>
                <div className="rounded-xl border border-black/[0.08] bg-black/[0.03] p-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#6e6e73]">Přesčas</span>
                  <strong className="mt-1 block text-lg font-bold text-emerald-600">{overtimeCount}</strong>
                </div>
                <div className="rounded-xl border border-black/[0.08] bg-black/[0.03] p-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#6e6e73]">Pod fondem</span>
                  <strong className={`mt-1 block text-lg font-bold ${negativeBalanceCount > 0 ? "text-rose-600" : "text-[#86868b]"}`}>
                    {negativeBalanceCount}
                  </strong>
                </div>
                <div className="rounded-xl border border-black/[0.08] bg-black/[0.03] p-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#6e6e73]">Varování</span>
                  <strong className={`mt-1 block text-lg font-bold ${payrollWarningCount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {payrollWarningCount}
                  </strong>
                </div>
              </div>

              {/* Filters search */}
              <div className="relative mb-6">
                <Search className="absolute left-3 top-3 h-4 w-4 text-[#6e6e73]" />
                <input
                  type="text"
                  placeholder="Hledat podle jména, osobního čísla nebo oddělení..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-9 pr-4 py-2 bg-black/[0.04] border border-black/[0.08] rounded-xl text-xs placeholder-[#86868b] focus:outline-none focus:border-[#0071e3] text-[#1d1d1f]"
                />
              </div>

              {/* Wage summary list view */}
              <div className="overflow-x-auto border border-black/[0.08] rounded-xl">
                <table className="w-full min-w-[750px] text-left text-xs font-mono divide-y divide-black/[0.08]">
                  <thead className="bg-black/[0.04] text-[10px] text-[#6e6e73] uppercase tracking-wider font-bold border-b border-black/[0.08]">
                    <tr>
                      <th className="px-4 py-3 font-sans">Jméno / ID</th>
                      <th className="px-3 py-3 text-center">Čisté hod.</th>
                      <th className="px-3 py-3 text-center">Odpolední (5%)</th>
                      <th className="px-3 py-3 text-center">Noční (15%)</th>
                      <th className="px-3 py-3 text-center">Víkend (15%)</th>
                      <th className="px-3 py-3 text-center">Saldo</th>
                      <th className="px-4 py-3 text-center font-sans">Varování</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 bg-white text-[#1d1d1f]">
                    {payrollRows.map(({ user, stats }) => {
                      const isOvertime = stats.balance >= 0;

                      return (
                        <tr key={user.id} className="hover-rounded cursor-pointer">
                          <td className="px-4 py-3.5 font-sans">
                            <span className="font-bold text-[#1d1d1f] block">{user.lastName} {user.firstName}</span>
                            <span className="text-[10px] text-[#6e6e73] block font-mono">Číslo: {user.employeeNumber} • {user.department}</span>
                          </td>
                          <td className="px-3 py-3.5 text-center font-bold text-[#1d1d1f]">{stats.total}h</td>
                          <td className="px-3 py-3.5 text-center text-[#6e6e73]">{stats.afternoon}h</td>
                          <td className="px-3 py-3.5 text-center text-[#6e6e73]">{stats.night}h</td>
                          <td className="px-3 py-3.5 text-center text-[#6e6e73]">{stats.weekend}h</td>
                          <td className={`px-3 py-3.5 text-center font-bold ${
                            isOvertime ? "text-emerald-600" : "text-rose-600"
                          }`}>
                            {isOvertime ? `+${stats.balance}` : stats.balance}h
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {stats.hasAnomaly && (
                                <span className="bg-rose-500/15 text-rose-700 border border-rose-500/30 font-sans font-bold px-2 py-0.5 rounded text-[9px]" title="Zapomenutý odchod (detekován log >14 hodin)">
                                  Log chyba
                                </span>
                              )}
                              {stats.hasOverlap && (
                                <span className="bg-amber-500/15 text-amber-700 border border-amber-500/30 font-sans font-bold px-2 py-0.5 rounded text-[9px]" title="Detekována časová kolize mezi dvěma pracovními záznamy.">
                                  KOLIZE
                                </span>
                              )}
                              {!stats.hasAnomaly && !stats.hasOverlap && (
                                <span className="text-emerald-600 text-xs font-bold">✔ OK</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        )}

        {activeTab === "shifts" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-200">
            
            {/* LEFT: New Shift Scheduler Form */}
            <div className="lg:col-span-4 surface card-accent p-6">
              
              <div className="mb-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-[#1d1d1f]">
                  Přidat směnu zaměstnanci
                </h3>
                <p className="text-[10px] text-[#6e6e73] font-bold uppercase tracking-widest mt-1">
                  Jednotlivý den nebo celý pracovní týden
                </p>
              </div>

              <form onSubmit={handleCreateShift} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                    Zaměstnanec
                  </label>
                  <select
                    value={newShiftUserId}
                    onChange={(e) => {
                      setNewShiftUserId(e.target.value);
                      setShiftFilterUserId(e.target.value);
                    }}
                    required
                    className="block w-full p-2.5 bg-black/[0.04] border border-black/[0.08] rounded-xl text-xs font-semibold text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                  >
                    <option value="">-- Vyberte zaměstnance --</option>
                    {users.filter(u => u.role !== "CEO").map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.lastName} {u.firstName} ({u.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                    Rychlé nastavení období
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Tento týden", offset: 0 },
                      { label: "Příští týden", offset: 1 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          const range = getWeekRange(preset.offset);
                          setNewShiftDate(range.start);
                          setNewShiftEndDate(range.end);
                        }}
                        className="rounded-xl border border-black/[0.08] bg-black/[0.04] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[#1d1d1f] transition-all hover:bg-black/[0.06] active:scale-[0.98]"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                      Datum od
                    </label>
                    <input
                      type="date"
                      value={newShiftDate}
                      onChange={(e) => {
                        setNewShiftDate(e.target.value);
                        if (!newShiftEndDate) setNewShiftEndDate(e.target.value);
                      }}
                      required
                      className="block w-full p-2.5 bg-black/[0.04] border border-black/[0.08] rounded-xl text-xs font-mono text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                      Datum do
                    </label>
                    <input
                      type="date"
                      value={newShiftEndDate}
                      min={newShiftDate || undefined}
                      onChange={(e) => setNewShiftEndDate(e.target.value)}
                      className="block w-full p-2.5 bg-black/[0.04] border border-black/[0.08] rounded-xl text-xs font-mono text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                      Začátek směny
                    </label>
                    <input
                      type="time"
                      value={newShiftStartTime}
                      onChange={(e) => setNewShiftStartTime(e.target.value)}
                      required
                      className="block w-full p-2.5 bg-black/[0.04] border border-black/[0.08] rounded-xl text-xs font-mono text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                      Konec směny
                    </label>
                    <input
                      type="time"
                      value={newShiftEndTime}
                      onChange={(e) => setNewShiftEndTime(e.target.value)}
                      required
                      className="block w-full p-2.5 bg-black/[0.04] border border-black/[0.08] rounded-xl text-xs font-mono text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                    Rychlé předvolby
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {SHIFT_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setNewShiftStartTime(p.start);
                          setNewShiftEndTime(p.end);
                          if (!newShiftNote.trim()) setNewShiftNote(`${p.label} směna`);
                        }}
                        className="bg-black/[0.04] hover:bg-black/[0.04] border border-black/[0.08] hover:border-black/10 text-[#1d1d1f] hover:text-[#6e6e73] font-bold px-2.5 py-1.5 rounded-lg text-[10px] uppercase tracking-wide transition-all active:scale-[0.96]"
                      >
                        {p.label}
                        <span className="block text-[9px] font-mono font-normal text-[#86868b]">{p.start}–{p.end}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1.5">
                    Poznámka / Název směny
                  </label>
                  <input
                    type="text"
                    placeholder="Např. Ranní směna, Záskok..."
                    value={newShiftNote}
                    onChange={(e) => setNewShiftNote(e.target.value)}
                    className="block w-full p-2.5 bg-black/[0.04] border border-black/[0.08] rounded-xl text-xs text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isUpdating}
                  className="w-full bg-[#0071e3] hover:bg-[#0077ed] text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  Naplánovat směnu
                </button>
              </form>
            </div>

            {/* RIGHT: Scheduled Shifts list with Delete buttons */}
            <div className="lg:col-span-8 surface card-accent p-6">
              
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-[#1d1d1f]">
                    Rozpis směn
                  </h3>
                  <p className="text-[10px] text-[#6e6e73] font-bold uppercase tracking-widest mt-0.5">
                    Dnes {todaysShifts.length} · Budoucí {upcomingShifts.length} · Celkem {scheduledShifts.length}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={shiftFilterUserId}
                    onChange={(e) => {
                      setShiftFilterUserId(e.target.value);
                      if (e.target.value) setNewShiftUserId(e.target.value);
                    }}
                    className="p-2 bg-black/[0.04] border border-black/[0.08] rounded-lg text-[11px] font-semibold text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                  >
                    <option value="">Všichni zaměstnanci</option>
                    {users.filter(u => u.role !== "CEO").map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.lastName} {u.firstName}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={shiftFilterDate}
                    onChange={(e) => setShiftFilterDate(e.target.value)}
                    className="p-2 bg-black/[0.04] border border-black/[0.08] rounded-lg text-[11px] font-mono text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                  />
                  {(shiftFilterUserId || shiftFilterDate) && (
                    <button
                      type="button"
                      onClick={() => { setShiftFilterUserId(""); setShiftFilterDate(""); }}
                      className="bg-black/[0.06] hover:bg-black/[0.08] border border-black/[0.08] text-[#6e6e73] font-bold px-2.5 py-2 rounded-lg text-[10px] uppercase tracking-wide transition-all"
                    >
                      Zrušit filtr
                    </button>
                  )}
                </div>
              </div>

              {(() => {
                const filteredShifts = scheduledShifts.filter((s) => {
                  if (shiftFilterUserId && s.userId !== parseInt(shiftFilterUserId, 10)) return false;
                  if (shiftFilterDate && formatShiftDateKey(s.date) !== shiftFilterDate) return false;
                  return true;
                }).sort((a, b) => `${formatShiftDateKey(a.date)} ${a.startTime}`.localeCompare(`${formatShiftDateKey(b.date)} ${b.startTime}`));

                if (scheduledShifts.length === 0) {
                  return (
                    <div className="py-20 text-center text-[#6e6e73] bg-black/[0.04] border border-black/[0.08] rounded-xl font-bold text-xs uppercase tracking-wider">
                      Žádné naplánované směny v systému.
                    </div>
                  );
                }

                if (filteredShifts.length === 0) {
                  return (
                    <div className="py-20 text-center text-[#6e6e73] bg-black/[0.04] border border-black/[0.08] rounded-xl font-bold text-xs uppercase tracking-wider">
                      Žádné směny neodpovídají zvolenému filtru.
                    </div>
                  );
                }

                return (
                <div className="divide-y divide-black/5 max-h-[550px] overflow-y-auto px-2 premium-scroll">
                  {filteredShifts.map((shift) => {
                    const isEditing = editingShiftId === shift.id;
                    const netHours = isEditing
                      ? computeNetHours(editShiftStartTime, editShiftEndTime)
                      : computeNetHours(shift.startTime, shift.endTime);

                    const shiftUser = shift.user || users.find((u) => u.id === shift.userId);
                    const userName = shiftUser
                      ? `${shiftUser.lastName} ${shiftUser.firstName}`
                      : `Uživatel #${shift.userId}`;

                    if (isEditing) {
                      return (
                        <div key={shift.id} className="py-3 bg-black/[0.04] px-3.5 rounded-xl">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/[0.06] border border-black/[0.08] text-[#6e6e73]">
                              {userName}
                            </span>
                            <span className="text-[10px] font-bold text-[#6e6e73] uppercase tracking-wide">Úprava směny</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                            <div>
                              <label className="block text-[9px] font-bold text-[#6e6e73] uppercase tracking-wide mb-1">Datum</label>
                              <input
                                type="date"
                                value={editShiftDate}
                                onChange={(e) => setEditShiftDate(e.target.value)}
                                className="block w-full p-2 bg-white border border-black/[0.08] rounded-lg text-[11px] font-mono text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-[#6e6e73] uppercase tracking-wide mb-1">Začátek</label>
                              <input
                                type="time"
                                value={editShiftStartTime}
                                onChange={(e) => setEditShiftStartTime(e.target.value)}
                                className="block w-full p-2 bg-white border border-black/[0.08] rounded-lg text-[11px] font-mono text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-[#6e6e73] uppercase tracking-wide mb-1">Konec</label>
                              <input
                                type="time"
                                value={editShiftEndTime}
                                onChange={(e) => setEditShiftEndTime(e.target.value)}
                                className="block w-full p-2 bg-white border border-black/[0.08] rounded-lg text-[11px] font-mono text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                              />
                            </div>
                            <div className="flex flex-col justify-end">
                              <span className="text-[9px] font-bold text-[#6e6e73] uppercase tracking-wide mb-1">Čistý</span>
                              <span className="font-bold text-[#6e6e73] bg-black/[0.04] border border-black/[0.08] px-2 py-2 rounded-lg text-[11px] font-mono text-center">
                                {netHours.toFixed(1)} hod
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {SHIFT_PRESETS.map((p) => (
                              <button
                                key={p.label}
                                type="button"
                                onClick={() => { setEditShiftStartTime(p.start); setEditShiftEndTime(p.end); }}
                                className="bg-white hover:bg-black/[0.04] border border-black/[0.08] hover:border-black/10 text-[#6e6e73] hover:text-[#6e6e73] font-bold px-2 py-1 rounded text-[9px] uppercase tracking-wide transition-all"
                              >
                                {p.label} {p.start}–{p.end}
                              </button>
                            ))}
                          </div>
                          <input
                            type="text"
                            placeholder="Poznámka / název směny"
                            value={editShiftNote}
                            onChange={(e) => setEditShiftNote(e.target.value)}
                            className="block w-full p-2 bg-white border border-black/[0.08] rounded-lg text-[11px] text-[#1d1d1f] outline-none focus:border-[#0071e3] mb-2"
                          />
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              type="button"
                              onClick={handleCancelEditShift}
                              className="bg-black/[0.06] hover:bg-black/[0.08] border border-black/[0.08] text-[#6e6e73] font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wide transition-all"
                            >
                              Zrušit
                            </button>
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => handleUpdateShift(shift.id)}
                              className="bg-[#0071e3] hover:bg-[#0077ed] text-white font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wide transition-all active:scale-[0.97] disabled:opacity-50"
                            >
                              Uložit změny
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={shift.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 hover:bg-black/[0.04] px-3.5 rounded-xl transition-all cursor-pointer">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#1d1d1f]">
                              {new Date(shift.date).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" })}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/[0.04] border border-black/[0.08] text-[#6e6e73] font-sans">
                              {userName}
                            </span>
                          </div>
                          <div className="text-[#6e6e73] font-sans">
                            Rozsah: <strong className="text-[#1d1d1f] font-mono">{shift.startTime} - {shift.endTime}</strong>
                            {shift.note && (
                              <span className="text-[#86868b] block text-[10px] mt-0.5"> Poznámka: {shift.note}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-auto flex-wrap justify-end">
                          <span className="font-bold text-[#6e6e73] bg-black/[0.04] border border-black/[0.08] px-2 py-0.5 rounded text-[10px]">
                            {netHours.toFixed(1)} hod (čistý)
                          </span>
                          <button
                            onClick={() => handleStartEditShift(shift)}
                            className="bg-black/[0.04] hover:bg-black/[0.06] border border-black/[0.08] text-[#6e6e73] font-bold px-2 py-1 rounded text-[10px] uppercase font-sans tracking-wide transition-all active:scale-[0.96]"
                          >
                            Upravit
                          </button>
                          <button
                            onClick={() => handleDeleteShift(shift.id)}
                            className="bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-700 font-bold px-2 py-1 rounded text-[10px] uppercase font-sans tracking-wide transition-all active:scale-[0.96]"
                          >
                            Smazat
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                );
              })()}
            </div>

          </div>
        )}

        {activeTab === "employees_mgmt" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-200">

            {/* LEFT: Add new employee form */}
            <div className="lg:col-span-4 surface card-accent p-6">

              <h3 className="text-sm font-bold uppercase tracking-widest text-[#1d1d1f] mb-4 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-[#6e6e73]" />
                Přidat zaměstnance
              </h3>

              <form onSubmit={handleAddEmployee} className="space-y-3">
                {/* Nahrávání občanského průkazu shodné s Kartou příchodu */}
                <div className="border-2 border-dashed border-black/[0.08] hover:border-black/10 rounded-2xl p-4 text-center bg-black/[0.04] transition-all">
                  {isScanning ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-3">
                      <Loader2 className="h-5 w-5 animate-spin text-[#6e6e73]" />
                      <span className="text-[10px] font-mono font-bold text-[#6e6e73] uppercase tracking-wider animate-pulse">
                        Vytěžuji doklad... {scanProgress}%
                      </span>
                    </div>
                  ) : idCardFile ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold text-xs">
                        <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                        <span>Občanský průkaz připraven</span>
                      </div>
                      <p className="text-[10px] text-[#86868b] font-mono truncate max-w-[250px] mx-auto">
                        {idCardFile.name}
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-[10px] text-[#6e6e73] hover:text-[#6e6e73] font-bold underline"
                      >
                        Změnit soubor
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[10px] text-[#6e6e73] font-bold uppercase tracking-wider">
                        Občanský průkaz (foto/sken) *
                      </p>
                      <p className="text-[9px] text-[#86868b] leading-normal">
                        Vyfoťte nebo nahrajte doklad pro automatické vyplnění jména.
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center justify-center gap-1.5 bg-[#0071e3] hover:bg-[#0077ed] text-white font-bold py-2 px-3 rounded-xl text-[10px] uppercase tracking-wider transition-all w-full active:scale-[0.98]"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        Nahrát / Vyfotit doklad
                      </button>
                    </div>
                  )}

                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1">
                      Jméno *
                    </label>
                    <input
                      type="text"
                      value={newEmpFirstName}
                      onChange={(e) => setNewEmpFirstName(e.target.value)}
                      placeholder="Jan"
                      required
                      className="block w-full p-2.5 bg-black/[0.04] border border-black/[0.08] rounded-xl text-xs text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1">
                      Příjmení *
                    </label>
                    <input
                      type="text"
                      value={newEmpLastName}
                      onChange={(e) => setNewEmpLastName(e.target.value)}
                      placeholder="Novák"
                      required
                      className="block w-full p-2.5 bg-black/[0.04] border border-black/[0.08] rounded-xl text-xs text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                    />
                  </div>
                </div>


                <div>
                  <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1">
                    Oddělení *
                  </label>
                  <input
                    type="text"
                    value={newEmpDepartment}
                    onChange={(e) => setNewEmpDepartment(e.target.value)}
                    placeholder="Např. Habartov - Výroba"
                    required
                    className="block w-full p-2.5 bg-black/[0.04] border border-black/[0.08] rounded-xl text-xs text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={newEmpEmail}
                    onChange={(e) => setNewEmpEmail(e.target.value)}
                    placeholder="novak@ept-connector.cz"
                    className="block w-full p-2.5 bg-black/[0.04] border border-black/[0.08] rounded-xl text-xs text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                  />
                </div>

                <div className="border-t border-black/[0.08] pt-3 mt-1">
                  <p className="text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-2">Přihlašovací údaje</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1">
                      Username (login) *
                    </label>
                    <input
                      type="text"
                      value={newEmpUsername}
                      onChange={(e) => setNewEmpUsername(e.target.value)}
                      placeholder="jnovak"
                      required
                      className="block w-full p-2.5 bg-black/[0.04] border border-black/[0.08] rounded-xl text-xs font-mono text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1">
                      Heslo *
                    </label>
                    <input
                      type="text"
                      value={newEmpPassword}
                      onChange={(e) => setNewEmpPassword(e.target.value)}
                      placeholder="novak123"
                      required
                      className="block w-full p-2.5 bg-black/[0.04] border border-black/[0.08] rounded-xl text-xs font-mono text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1">
                      PIN (kiosek)
                    </label>
                    <input
                      type="text"
                      value={newEmpPin}
                      onChange={(e) => setNewEmpPin(e.target.value)}
                      placeholder="1234"
                      maxLength={6}
                      className="block w-full p-2.5 bg-black/[0.04] border border-black/[0.08] rounded-xl text-xs font-mono text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#6e6e73] uppercase tracking-widest mb-1">
                      Role
                    </label>
                    <select
                      value={newEmpRole}
                      onChange={(e) => setNewEmpRole(e.target.value)}
                      className="block w-full p-2.5 bg-black/[0.04] border border-black/[0.08] rounded-xl text-xs font-semibold text-[#1d1d1f] outline-none focus:border-[#0071e3]"
                    >
                      <option value="EMPLOYEE">Zaměstnanec</option>
                      <option value="MANAGER">Manažer</option>
                      <option value="CEO">Ředitel (CEO)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isUpdating || isScanning}
                  className="w-full bg-[#0071e3] hover:bg-[#0077ed] text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Přidat zaměstnance
                </button>
              </form>

              <div className="mt-4 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-[10px] text-emerald-700 font-medium leading-relaxed">
                <strong>Info:</strong> Po přidání může zaměstnanec používat portál, docházku i přístup přes PIN.
              </div>
            </div>

            {/* RIGHT: Current employees list */}
            <div className="lg:col-span-8 surface card-accent p-6">

              <h3 className="text-sm font-bold uppercase tracking-widest text-[#1d1d1f] mb-4 flex items-center gap-2">
                <Users2 className="h-4 w-4 text-[#6e6e73]" />
                Registrovaní zaměstnanci ({activeCredentialUsers.length})
              </h3>

              {activeCredentialUsers.length === 0 ? (
                <div className="py-20 text-center text-[#6e6e73] bg-black/[0.04] border border-black/[0.08] rounded-xl font-bold text-xs uppercase tracking-wider">
                  Žádní registrovaní zaměstnanci.
                </div>
              ) : (
                <div className="divide-y divide-black/5 max-h-[550px] overflow-y-auto px-2">
                  {activeCredentialUsers.map((cred) => {
                    const dbUser = users.find((u) => u.employeeNumber === cred.employeeNumber);
                    const department = isDemoMode ? cred.department : dbUser?.department;
                    return (
                      <div
                        key={cred.username}
                        onClick={() => handleSelectEmployee(cred.username)}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 text-xs cursor-pointer hover:bg-black/[0.06] px-3.5 rounded-xl transition-all"
                        title="Zobrazit přihlašovací údaje"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-[#1d1d1f]">{cred.displayName}</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                              cred.role === "CEO"
                                ? "bg-amber-500/15 border border-amber-500/30 text-amber-700"
                                : cred.role === "MANAGER"
                                ? "bg-sky-500/15 border border-sky-500/30 text-sky-700"
                                : "bg-black/[0.06] border border-black/[0.08] text-[#6e6e73]"
                            }`}>
                              {cred.role}
                            </span>
                            {department && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-black/[0.04] border border-black/[0.08] text-[#6e6e73]">
                                {department}
                              </span>
                            )}
                            {!isDemoMode && dbUser && (
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                                true ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-700" : "bg-rose-500/15 border border-rose-500/30 text-rose-700"
                              }`}>
                                V databázi
                              </span>
                            )}
                            {!isDemoMode && !dbUser && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-rose-500/15 border border-rose-500/30 text-rose-700">
                                Chybí v DB
                              </span>
                            )}
                          </div>
                          <div className="text-[#6e6e73] font-mono text-[11px]">
                            Login: <strong className="text-[#1d1d1f]">{cred.username}</strong>
                            <span className="text-[#86868b] mx-2">|</span>
                            Osobní č.: <strong className="text-[#1d1d1f]">{cred.employeeNumber}</strong>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 self-end sm:self-auto justify-end shrink-0">
                          {dbUser && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openShiftPlanner(dbUser);
                              }}
                              className="inline-flex items-center gap-1 bg-[#0071e3]/10 hover:bg-[#0071e3]/15 border border-[#0071e3]/25 text-[#0071e3] font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wide transition-all active:scale-[0.96]"
                            >
                              <CalendarPlus className="h-3 w-3" />
                              Směna
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveEmployee(cred.username, cred.displayName);
                            }}
                            disabled={isUpdating}
                            className="inline-flex items-center gap-1 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-700 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wide transition-all active:scale-[0.96] disabled:opacity-50"
                          >
                            <Trash2 className="h-3 w-3" />
                            Odebrat
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

      </main>

      {/* Employee credential detail modal (CEO only) */}
      {selectedCredential && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
          onClick={() => setSelectedCredential(null)}
        >
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1 bg-[#0071e3]" />
            <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-black/5">
              <div>
                <h3 className="text-base font-bold text-[#1d1d1f]">
                  {selectedCredential.displayName || selectedCredential.username}
                </h3>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#6e6e73] mt-0.5">
                  Přihlašovací údaje
                </p>
              </div>
              <button
                onClick={() => setSelectedCredential(null)}
                className="text-[#86868b] hover:text-[#1d1d1f] transition-colors shrink-0"
                aria-label="Zavřít"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="py-16 flex items-center justify-center text-[#86868b]">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="px-6 py-5 space-y-3">
                {[
                  { key: "username", label: "Login / username", value: selectedCredential.username, copy: true },
                  { key: "password", label: "Heslo", value: selectedCredential.password, copy: true, secret: true },
                  { key: "pin", label: "PIN (kiosek)", value: selectedCredential.pin, copy: true, secret: true },
                  { key: "role", label: "Role", value: selectedCredential.role },
                  { key: "employeeNumber", label: "Osobní číslo", value: selectedCredential.employeeNumber, copy: true },
                  { key: "department", label: "Oddělení", value: selectedCredential.department },
                  { key: "email", label: "E-mail", value: selectedCredential.email, copy: true },
                  {
                    key: "hourlyFund",
                    label: "Týdenní fond (h)",
                    value:
                      selectedCredential.hourlyFund !== undefined && selectedCredential.hourlyFund !== null
                        ? String(selectedCredential.hourlyFund)
                        : undefined,
                  },
                ].map((field) => (
                  <div key={field.key} className="flex items-center gap-3">
                    <div className="w-32 shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#86868b]">
                      {field.label}
                    </div>
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <span className="font-mono text-sm text-[#1d1d1f] truncate">
                        {field.value
                          ? field.secret && !showPassword
                            ? "•".repeat(Math.max(6, field.value.length))
                            : field.value
                          : <span className="text-[#86868b]">—</span>}
                      </span>
                      {field.secret && field.value && (
                        <button
                          onClick={() => setShowPassword((v) => !v)}
                          className="text-[#86868b] hover:text-[#6e6e73] transition-colors shrink-0"
                          aria-label={showPassword ? "Skrýt" : "Zobrazit"}
                        >
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      {field.copy && field.value && (
                        <button
                          onClick={() => handleCopy(field.key, field.value)}
                          className="text-[#86868b] hover:text-[#6e6e73] transition-colors shrink-0"
                          aria-label="Kopírovat"
                        >
                          {copiedField === field.key ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="px-6 py-4 bg-black/[0.04] border-t border-black/5 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                <KeyRound className="h-3 w-3" />
                Citlivé údaje
              </span>
              <button
                onClick={() => setSelectedCredential(null)}
                className="bg-black/[0.06] hover:bg-black/[0.08] border border-black/[0.08] text-[#1d1d1f] font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wide transition-all active:scale-[0.97]"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}



    </div>
  );
}
