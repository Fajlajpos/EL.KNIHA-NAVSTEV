import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Neautorizovaný přístup. Musíte se přihlásit." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userIdStr = searchParams.get("userId");
    const monthStr = searchParams.get("month"); // Format: YYYY-MM

    // Běžný zaměstnanec smí číst jen své vlastní záznamy
    if (session.role === "EMPLOYEE") {
      let sessionDbId = session.dbId;
      if (!sessionDbId) {
        const dbUser = await prisma.user.findUnique({
          where: { employeeNumber: session.employeeNumber },
        });
        sessionDbId = dbUser?.id || null;
      }

      if (!userIdStr || parseInt(userIdStr, 10) !== sessionDbId) {
        return NextResponse.json(
          { error: "Nemáte oprávnění prohlížet docházku jiných uživatelů." },
          { status: 403 }
        );
      }
    }

    const whereClause: { userId?: number; checkIn?: { gte: Date; lt: Date } } = {};

    if (userIdStr) {
      whereClause.userId = parseInt(userIdStr, 10);
    }

    if (monthStr) {
      const [year, month] = monthStr.split("-").map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1); // first day of next month
      whereClause.checkIn = {
        gte: startDate,
        lt: endDate,
      };
    }

    const logs = await prisma.attendanceLog.findMany({
      where: whereClause,
      include: {
        user: true,
        editedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        checkIn: "desc",
      },
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error("Error in GET /api/attendance/logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch attendance logs." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Neautorizovaný přístup. Musíte se přihlásit." }, { status: 401 });
    }
    if (session.role !== "CEO" && session.role !== "MANAGER") {
      return NextResponse.json({ error: "Neautorizovaný přístup. Pouze pro CEO a MANAGER." }, { status: 403 });
    }

    const body = await req.json();
    const { logId, checkIn, checkOut, logType, status, note, editedById } = body;

    if (!logId || !editedById || !note) {
      return NextResponse.json(
        { error: "ID záznamu, ID schvalovatele a důvod úpravy jsou povinné." },
        { status: 400 }
      );
    }

    const logIdParsed = parseInt(logId, 10);
    const editedByIdParsed = parseInt(editedById, 10);

    const existingLog = await prisma.attendanceLog.findUnique({
      where: { id: logIdParsed },
    });

    if (!existingLog) {
      return NextResponse.json(
        { error: "Attendance log not found." },
        { status: 404 }
      );
    }

    // Save original checkIn/checkOut on the very first edit to maintain audit integrity
    const originalCheckIn = existingLog.originalCheckIn || existingLog.checkIn;
    const originalCheckOut = existingLog.originalCheckOut || existingLog.checkOut;

    const updatedLog = await prisma.attendanceLog.update({
      where: { id: logIdParsed },
      data: {
        checkIn: new Date(checkIn),
        checkOut: checkOut ? new Date(checkOut) : null,
        logType,
        status: status || "MANUALLY_EDITED",
        editedById: editedByIdParsed,
        note,
        originalCheckIn,
        originalCheckOut,
      },
      include: {
        user: true,
        editedBy: true,
      },
    });

    return NextResponse.json(updatedLog);
  } catch (error) {
    console.error("Error in PUT /api/attendance/logs:", error);
    return NextResponse.json(
      { error: "Failed to modify attendance log." },
      { status: 500 }
    );
  }
}
