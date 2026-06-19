import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const xForwardedFor = req.headers.get("x-forwarded-for");
    const clientIp = xForwardedFor
      ? xForwardedFor.split(",")[0].trim()
      : (req.headers.get("x-real-ip") || "127.0.0.1");

    // Network IP lock check (anti-cheat)
    const allowedIpsStr = process.env.ALLOWED_KIOSK_IPS;
    if (allowedIpsStr && allowedIpsStr !== "*") {
      const allowedIps = allowedIpsStr.split(",").map(ip => ip.trim());
      // Always allow localhost for developer convenience
      const isLocal = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(clientIp);
      if (!isLocal && !allowedIps.includes(clientIp)) {
        return NextResponse.json(
          { error: `Přístup odepřen. Záznamy lze provádět pouze z autorizované podnikové sítě. Vaše IP: ${clientIp}` },
          { status: 403 }
        );
      }
    }

    const body = await req.json();
    const { rfidCardUid, employeeNumber, pin, action } = body; // action: WORK, LUNCH, DOCTOR, BUSINESS_TRIP, BREAK, CHECK_OUT, AUTO

    let user = null;

    if (rfidCardUid) {
      user = await prisma.user.findUnique({
        where: { rfidCardUid, isActive: true },
      });
      if (!user) {
        return NextResponse.json(
          { error: "Neznámá nebo neaktivní RFID karta." },
          { status: 404 }
        );
      }
    } else if (employeeNumber && pin) {
      user = await prisma.user.findUnique({
        where: { employeeNumber, isActive: true },
      });
      if (!user) {
        return NextResponse.json(
          { error: "Zaměstnanec s tímto osobním číslem nebyl nalezen." },
          { status: 404 }
        );
      }
      if (user.pinHash !== hashPin(pin)) {
        return NextResponse.json(
          { error: "Neplatný PIN kód." },
          { status: 401 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Chybí identifikační údaje (RFID nebo Osobní číslo + PIN)." },
        { status: 400 }
      );
    }

    const now = new Date();

    // Find any OPEN attendance logs for this user
    const openLog = await prisma.attendanceLog.findFirst({
      where: {
        userId: user.id,
        status: "OPEN",
        checkOut: null,
      },
      orderBy: { checkIn: "desc" },
    });

    // Anomaly Check: If there's an open log that's older than 14 hours
    if (openLog) {
      const durationMs = now.getTime() - new Date(openLog.checkIn).getTime();
      const durationHours = durationMs / (1000 * 60 * 60);

      if (durationHours > 14.0) {
        // Flag the old log as ERROR and close it at 14h mark or now
        await prisma.attendanceLog.update({
          where: { id: openLog.id },
          data: {
            checkOut: new Date(new Date(openLog.checkIn).getTime() + 14 * 60 * 60 * 1000), // close at 14h
            status: "ERROR",
            note: "Automaticky uzavřeno: Překročen limit 14 hodin přítomnosti (zapomenutý odchod).",
          },
        });

        // Continue as if the user is checked out (since we just closed the old bugged log)
        // Let's create a new check-in
        const newLog = await prisma.attendanceLog.create({
          data: {
            userId: user.id,
            checkIn: now,
            logType: "WORK",
            status: "OPEN",
          },
        });

        return NextResponse.json({
          message: `Předchozí směna byla uzavřena s chybou (zapomenutý odchod). Byla zahájena nová směna.`,
          user: { firstName: user.firstName, lastName: user.lastName },
          log: newLog,
        });
      }
    }

    // State Machine logic
    if (openLog) {
      // User is currently clocked in. They want to clock out or transition to break/lunch.
      const selectedAction = action || "AUTO";

      if (selectedAction === "CHECK_OUT" || (selectedAction === "AUTO" && openLog.logType === "WORK")) {
        // Check out completely
        const updated = await prisma.attendanceLog.update({
          where: { id: openLog.id },
          data: {
            checkOut: now,
            status: "OK",
          },
        });
        return NextResponse.json({
          message: `Odchod zapsán. Nashledanou!`,
          user: { firstName: user.firstName, lastName: user.lastName },
          log: updated,
          status: "OUT",
        });
      } else if (selectedAction === "AUTO" && openLog.logType !== "WORK") {
        // If they are on break/lunch and they swipe again, check them back into WORK
        // 1. Close current break log
        await prisma.attendanceLog.update({
          where: { id: openLog.id },
          data: {
            checkOut: now,
            status: "OK",
          },
        });
        // 2. Open new WORK log
        const newLog = await prisma.attendanceLog.create({
          data: {
            userId: user.id,
            checkIn: now,
            logType: "WORK",
            status: "OPEN",
          },
        });
        return NextResponse.json({
          message: `Návrat z pauzy zapsán. Pracujete.`,
          user: { firstName: user.firstName, lastName: user.lastName },
          log: newLog,
          status: "IN",
        });
      } else {
        // User selected LUNCH, DOCTOR, BUSINESS_TRIP, or BREAK
        // 1. Close current WORK log
        await prisma.attendanceLog.update({
          where: { id: openLog.id },
          data: {
            checkOut: now,
            status: "OK",
          },
        });
        // 2. Open the new break log
        const newLog = await prisma.attendanceLog.create({
          data: {
            userId: user.id,
            checkIn: now,
            logType: selectedAction,
            status: "OPEN",
          },
        });
        
        let msg = "Odchod na oběd zapsán.";
        if (selectedAction === "DOCTOR") msg = "Odchod k lékaři zapsán.";
        if (selectedAction === "BUSINESS_TRIP") msg = "Odchod na služební cestu zapsán.";
        if (selectedAction === "BREAK") msg = "Odchod na přestávku zapsán.";

        return NextResponse.json({
          message: msg,
          user: { firstName: user.firstName, lastName: user.lastName },
          log: newLog,
          status: selectedAction,
        });
      }
    } else {
      // User is currently checked out. They want to check in.
      // Regardless of the action parameter, checking in from offline always starts a WORK log
      const newLog = await prisma.attendanceLog.create({
        data: {
          userId: user.id,
          checkIn: now,
          logType: "WORK",
          status: "OPEN",
        },
      });

      return NextResponse.json({
        message: `Příchod do práce zapsán. Vítejte!`,
        user: { firstName: user.firstName, lastName: user.lastName },
        log: newLog,
        status: "IN",
      });
    }
  } catch (error) {
    console.error("Error in POST /api/attendance/punch:", error);
    return NextResponse.json(
      { error: "Vnitřní chyba docházkového terminálu." },
      { status: 500 }
    );
  }
}
