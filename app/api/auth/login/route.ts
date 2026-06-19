import { NextRequest, NextResponse } from "next/server";
import { readUsers } from "@/lib/credentials";

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

    const users = readUsers();
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
