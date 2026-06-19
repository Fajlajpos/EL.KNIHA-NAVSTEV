import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";
import { Role } from "@prisma/client";

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

// Automatic Seed Data
const SEED_USERS = [
  {
    employeeNumber: "1001",
    firstName: "Petr",
    lastName: "Bureš",
    email: "bures@ept-connector.cz",
    department: "Svatava - Management",
    role: "CEO",
    pin: "1111",
    rfidCardUid: "999901",
    hourlyFund: 40.0,
  },
  {
    employeeNumber: "2001",
    firstName: "Jan",
    lastName: "Novák",
    email: "novak@ept-connector.cz",
    department: "Habartov - Výroba",
    role: "MANAGER",
    pin: "2222",
    rfidCardUid: "999902",
    hourlyFund: 40.0,
  },
  {
    employeeNumber: "2002",
    firstName: "Martin",
    lastName: "Dvořák",
    email: "dvorak@ept-connector.cz",
    department: "Svatava - Sklad",
    role: "MANAGER",
    pin: "3333",
    rfidCardUid: "999903",
    hourlyFund: 40.0,
  },
  {
    employeeNumber: "3001",
    firstName: "Lucie",
    lastName: "Králová",
    email: "kralova@ept-connector.cz",
    department: "Habartov - THP",
    role: "EMPLOYEE",
    pin: "4444",
    rfidCardUid: "999904",
    hourlyFund: 37.5,
  },
  {
    employeeNumber: "4001",
    firstName: "Josef",
    lastName: "Marek",
    email: "marek@ept-connector.cz",
    department: "Svatava - Výroba",
    role: "EMPLOYEE",
    pin: "5555",
    rfidCardUid: "123456",
    hourlyFund: 40.0,
  },
  {
    employeeNumber: "4002",
    firstName: "Jana",
    lastName: "Svobodová",
    email: "svobodova@ept-connector.cz",
    department: "Habartov - Výroba",
    role: "EMPLOYEE",
    pin: "6666",
    rfidCardUid: "789012",
    hourlyFund: 40.0,
  },
];

export async function GET() {
  try {
    let users = await prisma.user.findMany({
      orderBy: [
        { department: "asc" },
        { lastName: "asc" },
      ],
    });

    // Auto-seed if database is empty
    if (users.length === 0) {
      console.log("Seeding employee directory database...");
      for (const u of SEED_USERS) {
        await prisma.user.create({
          data: {
            employeeNumber: u.employeeNumber,
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
            department: u.department,
            role: u.role as Role,
            pinHash: hashPin(u.pin),
            rfidCardUid: u.rfidCardUid,
            hourlyFund: u.hourlyFund,
            isActive: true,
          },
        });
      }
      users = await prisma.user.findMany({
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
