"use client";

import { useState, useEffect } from "react";
import {
  ShieldAlert,
  FileCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Loader2,
  UserPlus,
  Trash2,
  Users2,
  Eye,
  EyeOff,
  Copy,
  Check,
  X,
  KeyRound,
} from "lucide-react";

interface LiveOccupant {
  id: string;
  type: string; // employee or visitor
  firstName: string;
  lastName: string;
  department: string;
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
  user: { firstName: string; lastName: string };
}

export default function DashboardPage() {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [liveOccupants, setLiveOccupants] = useState<{ visitors: LiveOccupant[]; employees: LiveOccupant[] }>({
    visitors: [],
    employees: [],
  });
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);

  // Shift planning states
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [newShiftUserId, setNewShiftUserId] = useState("");
  const [newShiftDate, setNewShiftDate] = useState("");
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
  const [activeTab, setActiveTab] = useState<"evac_approvals" | "payroll" | "shifts" | "employees_mgmt">("evac_approvals");

  // Reusable shift presets (start/end). Lunch auto-deducted later for shifts > 6h.
  const SHIFT_PRESETS = [
    { label: "Ranní", start: "06:00", end: "14:30" },
    { label: "Odpolední", start: "14:00", end: "22:30" },
    { label: "Denní", start: "08:00", end: "16:30" },
    { label: "Noční", start: "22:00", end: "06:00" },
  ];

  // Employee management states
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
  const [credentialUsers, setCredentialUsers] = useState<CredentialUser[]>([]);
  const [selectedCredential, setSelectedCredential] = useState<CredentialUser | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [newEmpUsername, setNewEmpUsername] = useState("");
  const [newEmpPassword, setNewEmpPassword] = useState("");
  const [newEmpDisplayName, setNewEmpDisplayName] = useState("");
  const [newEmpRole, setNewEmpRole] = useState("EMPLOYEE");
  const [newEmpNumber, setNewEmpNumber] = useState("");
  const [newEmpFirstName, setNewEmpFirstName] = useState("");
  const [newEmpLastName, setNewEmpLastName] = useState("");
  const [newEmpDepartment, setNewEmpDepartment] = useState("");
  const [newEmpEmail, setNewEmpEmail] = useState("");
  const [newEmpPin, setNewEmpPin] = useState("");

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
    setIsUpdating(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: parseInt(newShiftUserId, 10),
          date: newShiftDate,
          startTime: newShiftStartTime,
          endTime: newShiftEndTime,
          note: newShiftNote,
        }),
      });
      if (res.ok) {
        setStatusMsg({ text: "Směna byla úspěšně naplánována.", error: false });
        setNewShiftDate("");
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
    setEditShiftDate(new Date(shift.date).toISOString().slice(0, 10));
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

  // Precise Shift & Bonus Calculator (Afternoon 5%, Night 15%, Weekend 15%, Overtime, Auto Lunch Breaks)
  const calculateEmployeeStats = (empId: number) => {
    const empLogs = logs.filter((l) => l.userId === empId);
    let totalWorkHours = 0;
    let afternoonHours = 0;
    let nightHours = 0;
    let weekendHours = 0;
    let hasAnomaly = false;
    let overlapsCount = 0;

    // Detect Overlapping logs (Anti-Cheat check)
    empLogs.forEach((logA, idxA) => {
      if (logA.status === "ERROR") hasAnomaly = true;
      const startA = new Date(logA.checkIn).getTime();
      const endA = logA.checkOut ? new Date(logA.checkOut).getTime() : Date.now();

      empLogs.forEach((logB, idxB) => {
        if (idxA !== idxB) {
          const startB = new Date(logB.checkIn).getTime();
          const endB = logB.checkOut ? new Date(logB.checkOut).getTime() : Date.now();
          // Check intersection
          if (startA < endB && startB < endA) {
            overlapsCount++;
          }
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

  // Handle adding a new employee credential
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpUsername || !newEmpPassword || !newEmpFirstName || !newEmpLastName || !newEmpNumber || !newEmpDepartment) {
      setStatusMsg({ text: "Vyplňte všechna povinná pole.", error: true });
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
          employeeNumber: newEmpNumber,
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
        setNewEmpDisplayName("");
        setNewEmpRole("EMPLOYEE");
        setNewEmpNumber("");
        setNewEmpFirstName("");
        setNewEmpLastName("");
        setNewEmpDepartment("");
        setNewEmpEmail("");
        setNewEmpPin("");
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

  // Open the detail panel for one employee (loads full .env credentials incl. password)
  const handleSelectEmployee = async (username: string) => {
    setShowPassword(false);
    setCopiedField(null);
    setDetailLoading(true);
    setSelectedCredential({ username, displayName: "", role: "", employeeNumber: "" });
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
  const totalInsideCount = liveOccupants.visitors.filter(v => !v.checkOut).length + liveOccupants.employees.filter(e => !e.checkOut).length;
  const employeesInsideCount = liveOccupants.employees.filter(e => !e.checkOut).length;
  const visitorsInsideCount = liveOccupants.visitors.filter(v => !v.checkOut).length;

  // Evacuation Plaintext download
  const handleDownloadEvacuationList = () => {
    const insideV = liveOccupants.visitors.filter((v) => !v.checkOut);
    const insideE = liveOccupants.employees.filter((e) => !e.checkOut);

    let text = `EVAKUAČNÍ PLÁN / SEZNAM PŘÍTOMNÝCH OSOB\n`;
    text += `Datum a čas vygenerování: ${new Date().toLocaleString("cs-CZ")}\n`;
    text += `==========================================================\n\n`;

    text += `ZAMĚSTNANCI (${insideE.length}):\n`;
    text += `----------------------------------------------------------\n`;
    insideE.forEach((e) => {
      text += `[${e.department}] ${e.lastName} ${e.firstName} (Osobní č. ${e.employeeNumber}) | Prachod: ${new Date(e.checkIn).toLocaleTimeString("cs-CZ")} | Stav: ${e.status}\n`;
    });

    text += `\nNÁVŠTĚVY / HOSTÉ (${insideV.length}):\n`;
    text += `----------------------------------------------------------\n`;
    insideV.forEach((v) => {
      text += `[Firma: ${v.organization}] ${v.lastName} ${v.firstName} | SPZ: ${v.spz || "Bez vozidla"} | Prachod: ${new Date(v.checkIn).toLocaleTimeString("cs-CZ")}\n`;
    });

    text += `\n==========================================================\n`;
    text += `V případě požáru či evakuace zkontrolujte všechny osoby na shromaždišti.`;

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `evakuacni-plan-${new Date().toISOString().split("T")[0]}.txt`;
    link.click();
  };

  // Payroll CSV Generator
  const handleExportPayroll = () => {
    const csvHeaders = ["Osobní číslo", "Příjmení", "Jméno", "Oddělení", "Odpracované hodiny (Čisté)", "Odpolední hodiny (5%)", "Noční hodiny (15%)", "Víkendové hodiny (15%)", "Měsíční Fond", "Saldo (Přesčasy)", "Anomálie v docházce"];
    
    const rows = users.map((user) => {
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
    const query = searchQuery.toLowerCase();
    return (
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(query) ||
      u.employeeNumber.includes(query) ||
      u.department.toLowerCase().includes(query)
    );
  });

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
      
      {/* Top Banner Dashboard */}
      <header className="bg-white border-b border-slate-200 px-6 py-5 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img 
              src="/logo.png" 
              alt="Logo CHECKNI TO" 
              className="h-9 w-auto object-contain" 
            />
            <div className="h-6 w-[1px] bg-slate-200 hidden sm:block"></div>
            <div>
              <h1 className="text-md font-black tracking-widest text-slate-900 uppercase">CEO MANAGEMENT DASHBOARD</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">ept connector s.r.o.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            
            {/* Evacuation Alert trigger */}
            <button
              onClick={handleDownloadEvacuationList}
              className="inline-flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 px-4 rounded-xl text-xs shadow-md transition-all active:scale-[0.98] uppercase tracking-wider animate-pulse"
              title="Okamžitě stáhnout seznam osob pro evakuační shromaždiště"
            >
              <ShieldAlert className="h-4 w-4" />
              Evakuační plán
            </button>

            {/* Date month selector */}
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold font-mono outline-none text-slate-800 focus:border-indigo-650"
            />

            <button
              onClick={loadDashboardData}
              disabled={isUpdating}
              className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 border border-slate-200 rounded-xl transition-all"
            >
              <RefreshCw className={`h-4 w-4 ${isUpdating ? "animate-spin" : ""}`} />
            </button>

          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-8 space-y-8">
        
        {/* Status messages */}
        {statusMsg && (
          <div className={`p-4 rounded-xl border text-sm font-semibold flex items-center gap-2.5 shadow-sm animate-in fade-in ${
            statusMsg.error ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-250 text-emerald-800"
          }`}>
            {statusMsg.error ? <AlertTriangle className="h-5 w-5 text-rose-600" /> : <CheckCircle className="h-5 w-5 text-emerald-600" />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* TILES TICKERS: Real-time counts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600"></div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Osob v budově celkem</span>
            <div className="flex justify-between items-baseline mt-2">
              <strong className="text-3xl font-black text-slate-900">{totalInsideCount}</strong>
              <span className="text-xs font-mono font-bold text-slate-400">Evakuační stav</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600"></div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Zaměstnanci uvnitř</span>
            <div className="flex justify-between items-baseline mt-2">
              <strong className="text-3xl font-black text-indigo-600">{employeesInsideCount}</strong>
              <span className="text-xs font-mono font-bold text-slate-400">Příchody logovány</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600"></div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Zákazníci / Hosté</span>
            <div className="flex justify-between items-baseline mt-2">
              <strong className="text-3xl font-black text-amber-600">{visitorsInsideCount}</strong>
              <span className="text-xs font-mono font-bold text-slate-400">Kniha návštěv</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600"></div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Nevyřízené korekce</span>
            <div className="flex justify-between items-baseline mt-2">
              <strong className={`text-3xl font-black ${requests.length > 0 ? "text-rose-600 animate-pulse" : "text-slate-400"}`}>
                {requests.length}
              </strong>
              <span className="text-xs font-mono font-bold text-slate-400">Žádostí ke schválení</span>
            </div>
          </div>

        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 gap-6">
          <button
            onClick={() => setActiveTab("evac_approvals")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === "evac_approvals"
                ? "border-indigo-600 text-indigo-600 font-black"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Přítomnost & Korekce ({totalInsideCount + requests.length})
          </button>
          <button
            onClick={() => setActiveTab("payroll")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === "payroll"
                ? "border-indigo-600 text-indigo-600 font-black"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Zpracování mezd
          </button>
          <button
            onClick={() => setActiveTab("shifts")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === "shifts"
                ? "border-indigo-600 text-indigo-600 font-black"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Plánování směn ({allShifts.length})
          </button>
          <button
            onClick={() => setActiveTab("employees_mgmt")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === "employees_mgmt"
                ? "border-indigo-600 text-indigo-600 font-black"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Správa zaměstnanců ({credentialUsers.length})
          </button>
        </div>

        {activeTab === "evac_approvals" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-200">
            
            {/* LEFT COLUMN: LIVE Evacuation plan list */}
            <div className="lg:col-span-6 space-y-8">
              <div className="bg-white text-slate-900 border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500"></div>
                
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center gap-1.5">
                    <span className="h-2 w-2 bg-rose-500 rounded-full animate-ping"></span>
                    Kdo je aktuálně ve firmě
                  </h3>
                </div>

                {totalInsideCount === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500 font-semibold italic">Budova je prázdná.</p>
                ) : (
                  <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
                    
                    {/* Active Employees */}
                    {liveOccupants.employees.filter(e => !e.checkOut).map((occ) => (
                      <div key={occ.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex justify-between items-center gap-4">
                        <div>
                          <div className="font-bold text-slate-800">{occ.lastName} {occ.firstName}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{occ.department}</div>
                          <div className="text-[9px] text-indigo-600 font-mono mt-1">Příchod: {new Date(occ.checkIn).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-[6px] text-[9px] font-black uppercase tracking-wider ${
                          occ.status === "Na obědě" 
                            ? "bg-amber-50 border border-amber-200 text-amber-800" 
                            : occ.status === "U lékaře" 
                            ? "bg-sky-50 border border-sky-200 text-sky-855"
                            : "bg-emerald-50 border border-emerald-250 text-emerald-800"
                        }`}>
                          {occ.status}
                        </span>
                      </div>
                    ))}

                    {/* Active Visitors */}
                    {liveOccupants.visitors.filter(v => !v.checkOut).map((occ) => (
                      <div key={occ.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs flex justify-between items-center gap-4">
                        <div>
                          <div className="font-bold text-amber-700">Host: {occ.lastName} {occ.firstName}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">Firma: {occ.organization}</div>
                          <div className="text-[9px] text-amber-600 font-mono mt-1">Příchod: {new Date(occ.checkIn).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                        <span className="bg-amber-50 border border-amber-200 text-amber-808 px-2 py-0.5 rounded-[6px] text-[9px] font-black uppercase tracking-wider">
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
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600"></div>
                
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 mb-4 flex items-center gap-1.5">
                  <FileCheck className="h-4 w-4 text-indigo-650" />
                  Schvalování oprav docházky
                </h3>

                {requests.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500 italic bg-slate-50 border border-slate-200 rounded-xl font-bold uppercase tracking-wider">
                    Žádné pending žádosti k vyřízení.
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
                    {requests.map((req) => (
                      <div key={req.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                        
                        <div className="text-xs font-mono">
                          <strong className="text-slate-800 block">{req.user.lastName} {req.user.firstName}</strong>
                          <span className="text-[10px] text-slate-500">{req.user.department}</span>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-[10px] font-mono space-y-1 text-slate-700">
                          <div className="text-indigo-600 font-bold">Typ: {req.requestedLogType}</div>
                          <div>Změna: {req.requestedCheckIn ? new Date(req.requestedCheckIn).toLocaleDateString("cs-CZ") : ""}</div>
                          <div>Příchod: {req.requestedCheckIn ? new Date(req.requestedCheckIn).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</div>
                          <div>Odchod: {req.requestedCheckOut ? new Date(req.requestedCheckOut).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</div>
                          
                          <div className="italic text-slate-500 border-l border-slate-200 pl-1.5 mt-2 max-h-[50px] overflow-y-auto font-sans leading-relaxed">
                            &quot;{req.reason}&quot;
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleProcessRequest(req.id, true)}
                            disabled={isUpdating}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 rounded-lg text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all active:scale-[0.98]"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Schválit
                          </button>
                          <button
                            onClick={() => handleProcessRequest(req.id, false)}
                            disabled={isUpdating}
                            className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-1.5 rounded-lg text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all active:scale-[0.98]"
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
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600"></div>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                    Zpracování mezd & Podklady
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Autom. odečten oběd (-30 min) u směn nad 6h</p>
                </div>
                
                <button
                  onClick={handleExportPayroll}
                  disabled={users.length === 0}
                  className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-xl text-xs font-bold shadow-md transition-all active:scale-[0.99] uppercase tracking-wider"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Stáhnout podklady (CSV)
                </button>
              </div>

              {/* Filters search */}
              <div className="relative mb-6">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Hledat podle jména, osobního čísla nebo oddělení..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-indigo-500 text-slate-800"
                />
              </div>

              {/* Wage summary list view */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs font-mono divide-y divide-slate-200">
                  <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200">
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
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                    {filteredUsers.map((user) => {
                      const stats = calculateEmployeeStats(user.id);
                      const isOvertime = stats.balance >= 0;

                      return (
                        <tr key={user.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3.5 font-sans">
                            <span className="font-bold text-slate-900 block">{user.lastName} {user.firstName}</span>
                            <span className="text-[10px] text-slate-500 block font-mono">Číslo: {user.employeeNumber} • {user.department}</span>
                          </td>
                          <td className="px-3 py-3.5 text-center font-bold text-slate-900">{stats.total}h</td>
                          <td className="px-3 py-3.5 text-center text-slate-500">{stats.afternoon}h</td>
                          <td className="px-3 py-3.5 text-center text-slate-500">{stats.night}h</td>
                          <td className="px-3 py-3.5 text-center text-slate-500">{stats.weekend}h</td>
                          <td className={`px-3 py-3.5 text-center font-bold ${
                            isOvertime ? "text-emerald-600" : "text-rose-600"
                          }`}>
                            {isOvertime ? `+${stats.balance}` : stats.balance}h
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {stats.hasAnomaly && (
                                <span className="bg-rose-50 text-rose-700 border border-rose-200 font-sans font-bold px-2 py-0.5 rounded text-[9px]" title="Zapomenutý odchod (detekován log >14 hodin)">
                                  Log chyba
                                </span>
                              )}
                              {stats.hasOverlap && (
                                <span className="bg-amber-50 text-amber-855 border border-amber-200 font-sans font-bold px-2 py-0.5 rounded text-[9px]" title="Detekována časová kolize (překryvy dvou logů v jeden day!)">
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
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-650"></div>
              
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 mb-4">
                Naplánovat novou směnu
              </h3>

              <form onSubmit={handleCreateShift} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Zaměstnanec
                  </label>
                  <select
                    value={newShiftUserId}
                    onChange={(e) => setNewShiftUserId(e.target.value)}
                    required
                    className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
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
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Datum směny
                  </label>
                  <input
                    type="date"
                    value={newShiftDate}
                    onChange={(e) => setNewShiftDate(e.target.value)}
                    required
                    className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                      Začátek směny
                    </label>
                    <input
                      type="time"
                      value={newShiftStartTime}
                      onChange={(e) => setNewShiftStartTime(e.target.value)}
                      required
                      className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                      Konec směny
                    </label>
                    <input
                      type="time"
                      value={newShiftEndTime}
                      onChange={(e) => setNewShiftEndTime(e.target.value)}
                      required
                      className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
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
                        className="bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 font-bold px-2.5 py-1.5 rounded-lg text-[10px] uppercase tracking-wide transition-all active:scale-[0.96]"
                      >
                        {p.label}
                        <span className="block text-[9px] font-mono font-normal text-slate-400">{p.start}–{p.end}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Poznámka / Název směny
                  </label>
                  <input
                    type="text"
                    placeholder="Např. Ranní směna, Záskok..."
                    value={newShiftNote}
                    onChange={(e) => setNewShiftNote(e.target.value)}
                    className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isUpdating}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  Naplánovat směnu
                </button>
              </form>
            </div>

            {/* RIGHT: Scheduled Shifts list with Delete buttons */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-650"></div>
              
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">
                  Všechny naplánované směny (Rozpis)
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={shiftFilterUserId}
                    onChange={(e) => setShiftFilterUserId(e.target.value)}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 outline-none focus:border-indigo-500"
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
                    className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono text-slate-700 outline-none focus:border-indigo-500"
                  />
                  {(shiftFilterUserId || shiftFilterDate) && (
                    <button
                      type="button"
                      onClick={() => { setShiftFilterUserId(""); setShiftFilterDate(""); }}
                      className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 font-bold px-2.5 py-2 rounded-lg text-[10px] uppercase tracking-wide transition-all"
                    >
                      Zrušit filtr
                    </button>
                  )}
                </div>
              </div>

              {(() => {
                const filteredShifts = allShifts.filter((s) => {
                  if (shiftFilterUserId && s.userId !== parseInt(shiftFilterUserId, 10)) return false;
                  if (shiftFilterDate && new Date(s.date).toISOString().slice(0, 10) !== shiftFilterDate) return false;
                  return true;
                });

                if (allShifts.length === 0) {
                  return (
                    <div className="py-20 text-center text-slate-500 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider">
                      Žádné naplánované směny v systému.
                    </div>
                  );
                }

                if (filteredShifts.length === 0) {
                  return (
                    <div className="py-20 text-center text-slate-500 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider">
                      Žádné směny neodpovídají zvolenému filtru.
                    </div>
                  );
                }

                return (
                <div className="divide-y divide-slate-100 max-h-[550px] overflow-y-auto pr-2">
                  {filteredShifts.map((shift) => {
                    const isEditing = editingShiftId === shift.id;
                    const netHours = isEditing
                      ? computeNetHours(editShiftStartTime, editShiftEndTime)
                      : computeNetHours(shift.startTime, shift.endTime);

                    if (isEditing) {
                      return (
                        <div key={shift.id} className="py-3 bg-indigo-50/40 -mx-2 px-2 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 border border-indigo-200 text-indigo-700">
                              {shift.user.lastName} {shift.user.firstName}
                            </span>
                            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">Úprava směny</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                            <div>
                              <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1">Datum</label>
                              <input
                                type="date"
                                value={editShiftDate}
                                onChange={(e) => setEditShiftDate(e.target.value)}
                                className="block w-full p-2 bg-white border border-slate-200 rounded-lg text-[11px] font-mono text-slate-800 outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1">Začátek</label>
                              <input
                                type="time"
                                value={editShiftStartTime}
                                onChange={(e) => setEditShiftStartTime(e.target.value)}
                                className="block w-full p-2 bg-white border border-slate-200 rounded-lg text-[11px] font-mono text-slate-800 outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1">Konec</label>
                              <input
                                type="time"
                                value={editShiftEndTime}
                                onChange={(e) => setEditShiftEndTime(e.target.value)}
                                className="block w-full p-2 bg-white border border-slate-200 rounded-lg text-[11px] font-mono text-slate-800 outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="flex flex-col justify-end">
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1">Čistý</span>
                              <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-2 rounded-lg text-[11px] font-mono text-center">
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
                                className="bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-700 font-bold px-2 py-1 rounded text-[9px] uppercase tracking-wide transition-all"
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
                            className="block w-full p-2 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-800 outline-none focus:border-indigo-500 mb-2"
                          />
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              type="button"
                              onClick={handleCancelEditShift}
                              className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wide transition-all"
                            >
                              Zrušit
                            </button>
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => handleUpdateShift(shift.id)}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wide transition-all active:scale-[0.97] disabled:opacity-50"
                            >
                              Uložit změny
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={shift.id} className="py-3 flex items-center justify-between gap-4 text-xs font-mono">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">
                              {new Date(shift.date).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" })}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 font-sans">
                              {shift.user.lastName} {shift.user.firstName}
                            </span>
                          </div>
                          <div className="text-slate-555 font-sans">
                            Rozsah: <strong className="text-slate-800 font-mono">{shift.startTime} - {shift.endTime}</strong>
                            {shift.note && (
                              <span className="text-slate-400 block text-[10px] mt-0.5"> Poznámka: {shift.note}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-[10px]">
                            {netHours.toFixed(1)} hod (čistý)
                          </span>
                          <button
                            onClick={() => handleStartEditShift(shift)}
                            className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold px-2 py-1 rounded text-[10px] uppercase font-sans tracking-wide transition-all active:scale-[0.96]"
                          >
                            Upravit
                          </button>
                          <button
                            onClick={() => handleDeleteShift(shift.id)}
                            className="bg-rose-50 hover:bg-rose-100 border border-rose-250 text-rose-700 font-bold px-2 py-1 rounded text-[10px] uppercase font-sans tracking-wide transition-all active:scale-[0.96]"
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
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600"></div>

              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 mb-4 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-indigo-600" />
                Přidat zaměstnance
              </h3>

              <form onSubmit={handleAddEmployee} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      Jméno *
                    </label>
                    <input
                      type="text"
                      value={newEmpFirstName}
                      onChange={(e) => setNewEmpFirstName(e.target.value)}
                      placeholder="Jan"
                      required
                      className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      Příjmení *
                    </label>
                    <input
                      type="text"
                      value={newEmpLastName}
                      onChange={(e) => setNewEmpLastName(e.target.value)}
                      placeholder="Novák"
                      required
                      className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Osobní číslo *
                  </label>
                  <input
                    type="text"
                    value={newEmpNumber}
                    onChange={(e) => setNewEmpNumber(e.target.value)}
                    placeholder="Např. 5001"
                    required
                    className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Oddělení *
                  </label>
                  <input
                    type="text"
                    value={newEmpDepartment}
                    onChange={(e) => setNewEmpDepartment(e.target.value)}
                    placeholder="Např. Habartov - Výroba"
                    required
                    className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={newEmpEmail}
                    onChange={(e) => setNewEmpEmail(e.target.value)}
                    placeholder="novak@ept-connector.cz"
                    className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="border-t border-slate-200 pt-3 mt-1">
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-2">Přihlašovací údaje</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      Username (login) *
                    </label>
                    <input
                      type="text"
                      value={newEmpUsername}
                      onChange={(e) => setNewEmpUsername(e.target.value)}
                      placeholder="jnovak"
                      required
                      className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      Heslo *
                    </label>
                    <input
                      type="text"
                      value={newEmpPassword}
                      onChange={(e) => setNewEmpPassword(e.target.value)}
                      placeholder="novak123"
                      required
                      className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      PIN (kiosek)
                    </label>
                    <input
                      type="text"
                      value={newEmpPin}
                      onChange={(e) => setNewEmpPin(e.target.value)}
                      placeholder="1234"
                      maxLength={6}
                      className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      Role
                    </label>
                    <select
                      value={newEmpRole}
                      onChange={(e) => setNewEmpRole(e.target.value)}
                      className="block w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
                    >
                      <option value="EMPLOYEE">Zaměstnanec</option>
                      <option value="MANAGER">Manažer</option>
                      <option value="CEO">Ředitel (CEO)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isUpdating}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Přidat zaměstnance
                </button>
              </form>

              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[10px] text-emerald-800 font-medium leading-relaxed">
                <strong>Info:</strong> Zaměstnanec se uloží do <code className="font-mono bg-emerald-100 px-1 rounded">.env</code> (přihlašovací údaje) i do <code className="font-mono bg-emerald-100 px-1 rounded">databáze</code> (tabulka users v PgAdmin). Odebrání zaměstnance ho deaktivuje v DB.
              </div>
            </div>

            {/* RIGHT: Current employees list */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600"></div>

              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 mb-4 flex items-center gap-2">
                <Users2 className="h-4 w-4 text-indigo-600" />
                Registrovaní zaměstnanci ({credentialUsers.length})
              </h3>

              {credentialUsers.length === 0 ? (
                <div className="py-20 text-center text-slate-500 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider">
                  Žádní registrovaní zaměstnanci.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[550px] overflow-y-auto pr-2">
                  {credentialUsers.map((cred) => {
                    const dbUser = users.find((u) => u.employeeNumber === cred.employeeNumber);
                    return (
                      <div
                        key={cred.username}
                        onClick={() => handleSelectEmployee(cred.username)}
                        className="py-3.5 flex items-center justify-between gap-4 text-xs cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors"
                        title="Zobrazit přihlašovací údaje"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800">{cred.displayName}</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                              cred.role === "CEO"
                                ? "bg-amber-50 border border-amber-200 text-amber-800"
                                : cred.role === "MANAGER"
                                ? "bg-sky-50 border border-sky-200 text-sky-800"
                                : "bg-slate-100 border border-slate-200 text-slate-600"
                            }`}>
                              {cred.role}
                            </span>
                            {dbUser && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700">
                                {dbUser.department}
                              </span>
                            )}
                            {dbUser && (
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                                true ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-rose-50 border border-rose-200 text-rose-700"
                              }`}>
                                V databázi
                              </span>
                            )}
                            {!dbUser && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-rose-50 border border-rose-200 text-rose-700">
                                Chybí v DB
                              </span>
                            )}
                          </div>
                          <div className="text-slate-500 font-mono text-[11px]">
                            Login: <strong className="text-slate-700">{cred.username}</strong>
                            <span className="text-slate-300 mx-2">|</span>
                            Osobní č.: <strong className="text-slate-700">{cred.employeeNumber}</strong>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveEmployee(cred.username, cred.displayName);
                          }}
                          disabled={isUpdating}
                          className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wide transition-all active:scale-[0.96] disabled:opacity-50 shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                          Odebrat
                        </button>
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
            <div className="h-1 bg-indigo-600" />
            <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {selectedCredential.displayName || selectedCredential.username}
                </h3>
                <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600 mt-0.5">
                  Přihlašovací údaje (.env)
                </p>
              </div>
              <button
                onClick={() => setSelectedCredential(null)}
                className="text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                aria-label="Zavřít"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="py-16 flex items-center justify-center text-slate-400">
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
                    <div className="w-32 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {field.label}
                    </div>
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <span className="font-mono text-sm text-slate-800 truncate">
                        {field.value
                          ? field.secret && !showPassword
                            ? "•".repeat(Math.max(6, field.value.length))
                            : field.value
                          : <span className="text-slate-300">—</span>}
                      </span>
                      {field.secret && field.value && (
                        <button
                          onClick={() => setShowPassword((v) => !v)}
                          className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
                          aria-label={showPassword ? "Skrýt" : "Zobrazit"}
                        >
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      {field.copy && field.value && (
                        <button
                          onClick={() => handleCopy(field.key, field.value)}
                          className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
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

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                <KeyRound className="h-3 w-3" />
                Citlivé údaje
              </span>
              <button
                onClick={() => setSelectedCredential(null)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-lg text-xs uppercase tracking-wide transition-all active:scale-[0.97]"
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
