import { NextRequest, NextResponse } from "next/server";
import { readUsers } from "@/lib/credentials";
import prisma from "@/lib/prisma";
import { createSessionToken } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const pin = String(body.pin || "").trim();

    if (!pin) {
      return NextResponse.json({ error: "Zadejte PIN." }, { status: 400 });
    }

    const users = readUsers();
    const user = users.find((u) => u.role === "EMPLOYEE" && u.pin === pin);

    if (!user) {
      return NextResponse.json({ error: "PIN nebyl nalezen." }, { status: 401 });
    }

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
      maxAge: 86400,
    });

    return response;
  } catch (error) {
    console.error("Error in POST /api/auth/kiosk:", error);
    return NextResponse.json({ error: "Chyba serveru při přihlášení přes kiosk." }, { status: 500 });
  }
}
