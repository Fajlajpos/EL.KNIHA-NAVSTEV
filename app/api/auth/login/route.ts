import { NextRequest, NextResponse } from "next/server";
import { readUsers } from "@/lib/credentials";
import prisma from "@/lib/prisma";
import { createSessionToken } from "@/lib/session";

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

    // Vyhledání ID v databázi pro zjednodušení následných dotazů
    const dbUser = await prisma.user.findUnique({
      where: { employeeNumber: user.employeeNumber },
    });
    const dbId = dbUser?.id || null;

    const token = await createSessionToken({
      username: user.username,
      role: user.role,
      employeeNumber: user.employeeNumber,
      dbId,
    });

    const response = NextResponse.json({
      success: true,
      role: user.role,
      username: user.username,
      displayName: user.displayName,
      employeeNumber: user.employeeNumber,
    });

    response.cookies.set("session_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 86400, // 24 hodin
    });

    return response;
  } catch (error) {
    console.error("Error in POST /api/auth/login:", error);
    return NextResponse.json(
      { error: "Chyba na serveru při přihlašování." },
      { status: 500 }
    );
  }
}

