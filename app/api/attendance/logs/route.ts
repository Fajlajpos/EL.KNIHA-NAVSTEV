import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { LogType } from "@prisma/client";

export const dynamic = "force-dynamic";

const ACTION_CONFIG: Record<string, { closeTypes?: LogType[]; openType?: LogType; note: string; success: string }> = {
  START_WORK: {
    closeTypes: ["LUNCH", "BREAK"],
    openType: "WORK",
    note: "Začátek směny",
    success: "Směna byla zahájena.",
  },
  START_LUNCH: {
    closeTypes: ["WORK", "BREAK"],
    openType: "LUNCH",
    note: "Obědová pauza",
    success: "Obědová pauza byla zahájena.",
  },
  END_LUNCH: {
    closeTypes: ["LUNCH"],
    openType: "WORK",
    note: "Návrat z oběda",
    success: "Obědová pauza byla ukončena.",
  },
  START_BREAK: {
    closeTypes: ["WORK"],
    openType: "BREAK",
    note: "Přestávka",
    success: "Přestávka byla zahájena.",
  },
  END_BREAK: {
    closeTypes: ["BREAK"],
    openType: "WORK",
    note: "Návrat z přestávky",
    success: "Přestávka byla ukončena.",
  },
  END_SHIFT: {
    closeTypes: ["WORK", "LUNCH", "BREAK", "DOCTOR", "BUSINESS_TRIP"],
    note: "Konec směny",
    success: "Směna byla ukončena.",
  },
};

async function resolveTargetUserId(session: Awaited<ReturnType<typeof getSession>>, requestedUserId?: number | null) {
  if (!session) return null;

  let sessionDbId = session.dbId || null;
  if (!sessionDbId) {
    const dbUser = await prisma.user.findUnique({
      where: { employeeNumber: session.employeeNumber },
      select: { id: true },
    });
    sessionDbId = dbUser?.id || null;
  }

  if (!sessionDbId) return null;

  if (session.role === "EMPLOYEE") {
    if (requestedUserId && requestedUserId !== sessionDbId) return null;
    return sessionDbId;
  }

  if (session.role === "CEO" || session.role === "MANAGER") {
    return requestedUserId || sessionDbId;
  }

  return null;
}

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

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Neautorizovaný přístup. Musíte se přihlásit." }, { status: 401 });
    }

    const body = await req.json();
    const requestedUserId = body.userId ? parseInt(String(body.userId), 10) : null;
    const targetUserId = await resolveTargetUserId(session, requestedUserId);

    if (!targetUserId) {
      return NextResponse.json({ error: "Nemáte oprávnění zapisovat docházku pro tohoto zaměstnance." }, { status: 403 });
    }

    const action = String(body.action || "").toUpperCase();
    const config = ACTION_CONFIG[action];
    if (!config) {
      return NextResponse.json({ error: "Neplatná docházková akce." }, { status: 400 });
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const openLogs = await tx.attendanceLog.findMany({
        where: {
          userId: targetUserId,
          checkOut: null,
          status: "OPEN",
        },
        orderBy: { checkIn: "desc" },
      });

      const openTypeSet = new Set(openLogs.map((log) => log.logType));

      if (config.openType && openTypeSet.has(config.openType)) {
        return {
          error: config.openType === "WORK" ? "Směna už běží." : "Tato pauza už běží.",
          status: 409,
        };
      }

      const logsToClose = openLogs.filter((log) => config.closeTypes?.includes(log.logType));
      if (config.closeTypes && config.closeTypes.length > 0 && logsToClose.length === 0 && action !== "START_WORK") {
        return {
          error: action === "END_SHIFT" ? "Není spuštěná žádná směna ani pauza." : "Nejdřív musí běžet směna nebo odpovídající pauza.",
          status: 409,
        };
      }

      if (logsToClose.length > 0) {
        await tx.attendanceLog.updateMany({
          where: {
            id: { in: logsToClose.map((log) => log.id) },
          },
          data: {
            checkOut: now,
            status: "OK",
          },
        });
      }

      let openedLog = null;
      if (config.openType) {
        openedLog = await tx.attendanceLog.create({
          data: {
            userId: targetUserId,
            checkIn: now,
            logType: config.openType,
            status: "OPEN",
            note: body.note?.trim() || config.note,
          },
        });
      }

      return {
        closedIds: logsToClose.map((log) => log.id),
        openedLog,
      };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      message: config.success,
      ...result,
    });
  } catch (error) {
    console.error("Error in POST /api/attendance/logs:", error);
    return NextResponse.json(
      { error: "Nepodařilo se zapsat docházku." },
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
