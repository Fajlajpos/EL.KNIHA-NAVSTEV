import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import { Role } from "@prisma/client";

interface UserCredential {
  username: string;
  password: string;
  displayName: string;
  role: string;
  employeeNumber: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  email?: string;
  pin?: string;
  hourlyFund?: number;
}

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

function getEnvPath(): string {
  return path.resolve(process.cwd(), ".env");
}

function getUsers(): UserCredential[] {
  try {
    const raw = process.env.USERS_CREDENTIALS || "[]";
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveUsersToEnv(users: UserCredential[]): void {
  const envPath = getEnvPath();
  let envContent = fs.readFileSync(envPath, "utf-8");

  const jsonStr = JSON.stringify(users);
  const newLine = `USERS_CREDENTIALS='${jsonStr}'`;

  if (envContent.includes("USERS_CREDENTIALS=")) {
    envContent = envContent.replace(/USERS_CREDENTIALS=.*/g, newLine);
  } else {
    envContent += `\n${newLine}\n`;
  }

  fs.writeFileSync(envPath, envContent, "utf-8");
  process.env.USERS_CREDENTIALS = jsonStr;
}

// GET - list all employees (without passwords)
export async function GET() {
  try {
    const users = getUsers();
    const safeUsers = users.map(({ password, ...rest }) => rest);
    return NextResponse.json(safeUsers);
  } catch (error) {
    console.error("Error in GET /api/auth/employees:", error);
    return NextResponse.json({ error: "Chyba při načítání zaměstnanců." }, { status: 500 });
  }
}

// POST - add new employee (saves to .env AND creates in DB)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      username,
      password,
      displayName,
      role,
      employeeNumber,
      firstName,
      lastName,
      department,
      email,
      pin,
      hourlyFund,
    } = body;

    if (!username || !password || !displayName || !employeeNumber || !firstName || !lastName || !department) {
      return NextResponse.json(
        { error: "Všechna povinná pole musí být vyplněna." },
        { status: 400 }
      );
    }

    // 1. Check .env duplicates
    const users = getUsers();

    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return NextResponse.json(
        { error: "Uživatel s tímto username již existuje." },
        { status: 400 }
      );
    }

    if (users.some((u) => u.employeeNumber === employeeNumber)) {
      return NextResponse.json(
        { error: "Zaměstnanec s tímto osobním číslem již v .env existuje." },
        { status: 400 }
      );
    }

    // 2. Check DB duplicates
    const existingDb = await prisma.user.findUnique({
      where: { employeeNumber: employeeNumber.trim() },
    });
    if (existingDb) {
      return NextResponse.json(
        { error: "Zaměstnanec s tímto osobním číslem již existuje v databázi." },
        { status: 400 }
      );
    }

    // 3. Save to .env (including DB fields for future sync)
    users.push({
      username: username.trim(),
      password: password.trim(),
      displayName: displayName.trim(),
      role: role || "EMPLOYEE",
      employeeNumber: employeeNumber.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      department: department.trim(),
      email: email?.trim() || undefined,
      pin: pin?.trim() || undefined,
      hourlyFund: hourlyFund ? parseFloat(hourlyFund) : 40.0,
    });
    saveUsersToEnv(users);

    // 4. Create in DB
    const pinHash = pin ? hashPin(pin) : null;
    const newUser = await prisma.user.create({
      data: {
        employeeNumber: employeeNumber.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email?.trim() || null,
        department: department.trim(),
        role: (role || "EMPLOYEE") as Role,
        pinHash,
        rfidCardUid: null,
        hourlyFund: hourlyFund ? parseFloat(hourlyFund) : 40.0,
        isActive: true,
      },
    });

    return NextResponse.json(
      { success: true, message: "Zaměstnanec byl přidán do .env i do databáze.", user: newUser },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/auth/employees:", error);
    return NextResponse.json({ error: "Chyba při přidávání zaměstnance." }, { status: 500 });
  }
}

// DELETE - remove employee by username (removes from .env AND deactivates in DB)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");

    if (!username) {
      return NextResponse.json({ error: "Username je povinný." }, { status: 400 });
    }

    const users = getUsers();
    const userToRemove = users.find((u) => u.username.toLowerCase() === username.toLowerCase());

    if (!userToRemove) {
      return NextResponse.json({ error: "Zaměstnanec nebyl nalezen." }, { status: 404 });
    }

    const filtered = users.filter((u) => u.username.toLowerCase() !== username.toLowerCase());

    const ceoCount = filtered.filter((u) => u.role === "CEO").length;
    if (ceoCount === 0) {
      return NextResponse.json(
        { error: "Nelze odebrat posledního CEO. Systém musí mít alespoň jednoho ředitele." },
        { status: 400 }
      );
    }

    // 1. Remove from .env
    saveUsersToEnv(filtered);

    // 2. Deactivate in DB (set isActive = false) instead of hard delete to preserve history
    const dbUser = await prisma.user.findUnique({
      where: { employeeNumber: userToRemove.employeeNumber },
    });
    if (dbUser) {
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { isActive: false },
      });
    }

    return NextResponse.json({ success: true, message: "Zaměstnanec byl odebrán z .env a deaktivován v databázi." });
  } catch (error) {
    console.error("Error in DELETE /api/auth/employees:", error);
    return NextResponse.json({ error: "Chyba při odebírání zaměstnance." }, { status: 500 });
  }
}
