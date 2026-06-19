import { NextRequest, NextResponse } from "next/server";

interface UserCredential {
  username: string;
  password: string;
  displayName: string;
  role: string;
  employeeNumber: string;
}

function getUsers(): UserCredential[] {
  try {
    const raw = process.env.USERS_CREDENTIALS || "[]";
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Uživatelské jméno a heslo jsou povinné." },
        { status: 400 }
      );
    }

    const users = getUsers();
    const user = users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );

    if (!user) {
      return NextResponse.json(
        { error: "Nesprávné uživatelské jméno nebo heslo." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      role: user.role,
      username: user.username,
      displayName: user.displayName,
      employeeNumber: user.employeeNumber,
    });
  } catch (error) {
    console.error("Error in POST /api/auth/login:", error);
    return NextResponse.json(
      { error: "Chyba na serveru při přihlašování." },
      { status: 500 }
    );
  }
}
