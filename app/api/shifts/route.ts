import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Automatic Shift Seeding logic
async function autoSeedShifts() {
  const users = await prisma.user.findMany();
  if (users.length === 0) return;

  const shiftsData = [];
  const startDay = 1;
  const endDay = 30; // June 2026

  for (const user of users) {
    // We don't seed shifts for the CEO
    if (user.role === "CEO") continue;

    for (let day = startDay; day <= endDay; day++) {
      const dateStr = `2026-06-${String(day).padStart(2, "0")}`;
      const date = new Date(dateStr);
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

      // Only schedule shifts for weekdays (Monday to Friday)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        let startTime = "08:00";
        let endTime = "16:30";
        let note = "Pravidelná směna";

        if (user.employeeNumber === "4001" || user.employeeNumber === "4002") {
          // Josef Marek and Jana Svobodová run rotating shifts
          if (day % 2 === 0) {
            startTime = "06:00";
            endTime = "14:30";
            note = "Ranní směna";
          } else {
            startTime = "14:00";
            endTime = "22:30";
            note = "Odpolední směna";
          }
        } else if (user.employeeNumber === "2001" || user.employeeNumber === "2002") {
          startTime = "07:30";
          endTime = "16:00";
          note = "Manažerská směna";
        }

        shiftsData.push({
          userId: user.id,
          date,
          startTime,
          endTime,
          note,
        });
      }
    }
  }

  if (shiftsData.length > 0) {
    console.log(`Auto-seeding ${shiftsData.length} mock shifts for employees...`);
    await prisma.shift.createMany({
      data: shiftsData,
    });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userIdVal = searchParams.get("userId");

    // Check if shift table is empty and auto-seed if so
    const count = await prisma.shift.count();
    if (count === 0) {
      await autoSeedShifts();
    }

    if (userIdVal) {
      const userId = parseInt(userIdVal, 10);
      if (isNaN(userId)) {
        return NextResponse.json({ error: "Neplatné ID uživatele." }, { status: 400 });
      }

      const userShifts = await prisma.shift.findMany({
        where: { userId },
        orderBy: { date: "asc" },
      });
      return NextResponse.json(userShifts);
    }

    // Default: return all shifts with user info
    const allShifts = await prisma.shift.findMany({
      include: {
        user: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            department: true,
          },
        },
      },
      orderBy: { date: "asc" },
    });

    return NextResponse.json(allShifts);
  } catch (err) {
    console.error("Error in GET /api/shifts:", err);
    return NextResponse.json({ error: "Nepodařilo se načíst směny." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, date, dateTo, startTime, endTime, note } = body;

    if (!userId || !date || !startTime || !endTime) {
      return NextResponse.json(
        { error: "Všechna pole (uživatel, datum, začátek, konec) jsou povinná." },
        { status: 400 }
      );
    }

    const startDate = new Date(date);
    const endDate = dateTo ? new Date(dateTo) : startDate;
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Neplatné datum směny." }, { status: 400 });
    }
    if (endDate < startDate) {
      return NextResponse.json({ error: "Datum do nesmí být před datem od." }, { status: 400 });
    }

    const createdDates: Date[] = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      createdDates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    if (createdDates.length > 62) {
      return NextResponse.json({ error: "Rozsah směn je příliš dlouhý. Zadejte maximálně 62 dní." }, { status: 400 });
    }

    const userIdParsed = parseInt(userId, 10);
    const data = createdDates.map((shiftDate) => ({
      userId: userIdParsed,
      date: shiftDate,
      startTime,
      endTime,
      note: note?.trim() || null,
    }));

    if (data.length === 1) {
      const newShift = await prisma.shift.create({ data: data[0] });
      return NextResponse.json(newShift, { status: 201 });
    }

    const result = await prisma.shift.createMany({ data });
    return NextResponse.json({ success: true, count: result.count }, { status: 201 });
  } catch (err) {
    console.error("Error in POST /api/shifts:", err);
    return NextResponse.json({ error: "Nepodařilo se vytvořit směnu." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, date, startTime, endTime, note } = body;

    if (!id) {
      return NextResponse.json({ error: "Chybí ID směny k úpravě." }, { status: 400 });
    }

    const shiftId = parseInt(id, 10);
    if (isNaN(shiftId)) {
      return NextResponse.json({ error: "Neplatné ID směny." }, { status: 400 });
    }

    // Validate time format (HH:MM) when provided
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (startTime !== undefined && !timeRegex.test(startTime)) {
      return NextResponse.json({ error: "Neplatný formát začátku směny (očekává se HH:MM)." }, { status: 400 });
    }
    if (endTime !== undefined && !timeRegex.test(endTime)) {
      return NextResponse.json({ error: "Neplatný formát konce směny (očekává se HH:MM)." }, { status: 400 });
    }
    if (startTime !== undefined && endTime !== undefined && startTime === endTime) {
      return NextResponse.json({ error: "Začátek a konec směny nesmí být shodné." }, { status: 400 });
    }

    // Build partial update so only provided fields are changed
    const data: { date?: Date; startTime?: string; endTime?: string; note?: string | null } = {};
    if (date !== undefined) data.date = new Date(date);
    if (startTime !== undefined) data.startTime = startTime;
    if (endTime !== undefined) data.endTime = endTime;
    if (note !== undefined) data.note = note?.trim() || null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nebyly předány žádné změny." }, { status: 400 });
    }

    const updatedShift = await prisma.shift.update({
      where: { id: shiftId },
      data,
    });

    return NextResponse.json(updatedShift);
  } catch (err) {
    console.error("Error in PATCH /api/shifts:", err);
    return NextResponse.json({ error: "Nepodařilo se upravit směnu." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const idVal = searchParams.get("id");

    if (!idVal) {
      return NextResponse.json({ error: "Chybí ID směny k odstranění." }, { status: 400 });
    }

    const id = parseInt(idVal, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Neplatné ID směny." }, { status: 400 });
    }

    await prisma.shift.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Směna byla úspěšně odstraněna." });
  } catch (err) {
    console.error("Error in DELETE /api/shifts:", err);
    return NextResponse.json({ error: "Nepodařilo se smazat směnu." }, { status: 500 });
  }
}
