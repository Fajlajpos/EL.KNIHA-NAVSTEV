import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import { Role } from "@prisma/client";

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

interface EnvUser {
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

function getEnvUsers(): EnvUser[] {
  try {
    const raw = process.env.USERS_CREDENTIALS || "[]";
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    let users = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: [
        { department: "asc" },
        { lastName: "asc" },
      ],
    });

    // Auto-sync: if DB is empty, seed from .env credentials
    if (users.length === 0) {
      console.log("Syncing employees from .env to database...");
      const envUsers = getEnvUsers();

      for (const u of envUsers) {
        // Parse name from displayName if firstName/lastName not provided
        const nameParts = u.displayName.split(" ");
        const firstName = u.firstName || nameParts[0] || "Unknown";
        const lastName = u.lastName || nameParts.slice(1).join(" ") || "Unknown";

        await prisma.user.create({
          data: {
            employeeNumber: u.employeeNumber,
            firstName,
            lastName,
            email: u.email || null,
            department: u.department || "Nezařazeno",
            role: (u.role || "EMPLOYEE") as Role,
            pinHash: u.pin ? hashPin(u.pin) : null,
            rfidCardUid: null,
            hourlyFund: u.hourlyFund ?? 40.0,
            isActive: true,
          },
        });
      }

      users = await prisma.user.findMany({
        where: { isActive: true },
        orderBy: [
          { department: "asc" },
          { lastName: "asc" },
        ],
      });
    }

    return NextResponse.json(users);
  } catch (error) {
    console.error("Error in GET /api/users:", error);
    return NextResponse.json(
      { error: "Failed to fetch or seed users." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { employeeNumber, firstName, lastName, email, department, role, pin, rfidCardUid, hourlyFund } = body;

    if (!employeeNumber || !firstName || !lastName || !department) {
      return NextResponse.json(
        { error: "Osobní číslo, jméno, příjmení a oddělení jsou povinné." },
        { status: 400 }
      );
    }

    // Check if employeeNumber already exists
    const existing = await prisma.user.findUnique({
      where: { employeeNumber },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Zaměstnanec s tímto osobním číslem již existuje." },
        { status: 400 }
      );
    }

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
        rfidCardUid: rfidCardUid?.trim() || null,
        hourlyFund: hourlyFund ? parseFloat(hourlyFund) : 40.0,
      },
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: "Nepodařilo se uložit zaměstnance." },
      { status: 500 }
    );
  }
}
