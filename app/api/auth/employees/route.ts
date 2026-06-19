import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface UserCredential {
  username: string;
  password: string;
  displayName: string;
  role: string;
  employeeNumber: string;
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

// POST - add new employee
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password, displayName, role, employeeNumber } = body;

    if (!username || !password || !displayName || !employeeNumber) {
      return NextResponse.json(
        { error: "Všechna pole jsou povinná (username, password, displayName, employeeNumber)." },
        { status: 400 }
      );
    }

    const users = getUsers();

    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return NextResponse.json(
        { error: "Uživatel s tímto username již existuje." },
        { status: 400 }
      );
    }

    if (users.some((u) => u.employeeNumber === employeeNumber)) {
      return NextResponse.json(
        { error: "Zaměstnanec s tímto osobním číslem již existuje." },
        { status: 400 }
      );
    }

    users.push({
      username: username.trim(),
      password: password.trim(),
      displayName: displayName.trim(),
      role: role || "EMPLOYEE",
      employeeNumber: employeeNumber.trim(),
    });

    saveUsersToEnv(users);

    return NextResponse.json({ success: true, message: "Zaměstnanec byl přidán." }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/auth/employees:", error);
    return NextResponse.json({ error: "Chyba při přidávání zaměstnance." }, { status: 500 });
  }
}

// DELETE - remove employee by username
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");

    if (!username) {
      return NextResponse.json({ error: "Username je povinný." }, { status: 400 });
    }

    const users = getUsers();
    const filtered = users.filter((u) => u.username.toLowerCase() !== username.toLowerCase());

    if (filtered.length === users.length) {
      return NextResponse.json({ error: "Zaměstnanec nebyl nalezen." }, { status: 404 });
    }

    const ceoCount = filtered.filter((u) => u.role === "CEO").length;
    if (ceoCount === 0) {
      return NextResponse.json(
        { error: "Nelze odebrat posledního CEO. Systém musí mít alespoň jednoho ředitele." },
        { status: 400 }
      );
    }

    saveUsersToEnv(filtered);

    return NextResponse.json({ success: true, message: "Zaměstnanec byl odebrán." });
  } catch (error) {
    console.error("Error in DELETE /api/auth/employees:", error);
    return NextResponse.json({ error: "Chyba při odebírání zaměstnance." }, { status: 500 });
  }
}
