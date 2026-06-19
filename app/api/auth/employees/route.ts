import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import { Role } from "@prisma/client";
import { readUsers, writeUsers, type UserCredential } from "@/lib/credentials";
import { getSession } from "@/lib/session";

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

// Cteni i zapis prihlasovacich udaju resi sdileny modul lib/credentials.
function getUsers(): UserCredential[] {
  return readUsers();
}

function saveUsersToEnv(users: UserCredential[]): void {
  writeUsers(users);
}

// GET - list all employees (without passwords).
// With ?username=X returns the FULL credential (incl. password) of one employee,
// used by the CEO's "Správa zaměstnanců" detail view.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Neautorizovaný přístup. Musíte se přihlásit." }, { status: 401 });
    }
    if (session.role !== "CEO") {
      return NextResponse.json({ error: "Neautorizovaný přístup. Pouze pro CEO." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");
    const users = getUsers();

    if (username) {
      const user = users.find(
        (u) => u.username.toLowerCase() === username.toLowerCase()
      );
      if (!user) {
        return NextResponse.json(
          { error: "Zaměstnanec nebyl nalezen." },
          { status: 404 }
        );
      }
      return NextResponse.json(user);
    }

    const safeUsers = users.map((u) => {
      const copy = { ...u } as Partial<UserCredential>;
      delete copy.password;
      return copy;
    });
    return NextResponse.json(safeUsers);
  } catch (error) {
    console.error("Error in GET /api/auth/employees:", error);
    return NextResponse.json({ error: "Chyba při načítání zaměstnanců." }, { status: 500 });
  }
}

// POST - add new employee (saves to .env AND creates in DB)
export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Neautorizovaný přístup. Musíte se přihlásit." }, { status: 401 });
    }
    if (session.role !== "CEO") {
      return NextResponse.json({ error: "Neautorizovaný přístup. Pouze pro CEO." }, { status: 403 });
    }

    const body = await req.json();
    const {
      username,
      password,
      displayName,
      role,
      firstName,
      lastName,
      department,
      email,
      pin,
      hourlyFund,
    } = body;

    if (!username || !password || !displayName || !firstName || !lastName || !department) {
      return NextResponse.json(
        { error: "Všechna povinná pole musí být vyplněna." },
        { status: 400 }
      );
    }

    // 1. Check .env duplicates for username
    const users = getUsers();

    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return NextResponse.json(
        { error: "Uživatel s tímto username již existuje." },
        { status: 400 }
      );
    }

    // 2. Generate sequential employee number based on the highest existing number in .env
    const parsedNumbers = users
      .map((u) => parseInt(u.employeeNumber, 10))
      .filter((n) => !isNaN(n));
    const nextNumber = parsedNumbers.length > 0 ? Math.max(...parsedNumbers) + 1 : 1001;
    const employeeNumber = String(nextNumber);

    // 3. Check DB duplicates for the newly generated number just to be absolutely safe
    const existingDb = await prisma.user.findUnique({
      where: { employeeNumber },
    });
    if (existingDb) {
      return NextResponse.json(
        { error: "Neočekávaná chyba: Vygenerované osobní číslo již existuje v databázi." },
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
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Neautorizovaný přístup. Musíte se přihlásit." }, { status: 401 });
    }
    if (session.role !== "CEO") {
      return NextResponse.json({ error: "Neautorizovaný přístup. Pouze pro CEO." }, { status: 403 });
    }

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

    // 2. Hard delete from DB (table "zamestnanci"). Related records
    //    (attendance logs, absences, corrections, shifts) cascade via schema.
    const dbUser = await prisma.user.findUnique({
      where: { employeeNumber: userToRemove.employeeNumber },
    });
    if (dbUser) {
      await prisma.user.delete({
        where: { id: dbUser.id },
      });
    }

    return NextResponse.json({ success: true, message: "Zaměstnanec byl odebrán z .env i z databáze." });
  } catch (error) {
    console.error("Error in DELETE /api/auth/employees:", error);
    return NextResponse.json({ error: "Chyba při odebírání zaměstnance." }, { status: 500 });
  }
}
