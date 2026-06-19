import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userIdStr = searchParams.get("userId");
    const statusStr = searchParams.get("status"); // PENDING, APPROVED, REJECTED

    const whereClause: { userId?: number; status?: "PENDING" | "APPROVED" | "REJECTED" } = {};

    if (userIdStr) {
      whereClause.userId = parseInt(userIdStr, 10);
    }
    if (statusStr) {
      whereClause.status = statusStr as "PENDING" | "APPROVED" | "REJECTED";
    }

    const requests = await prisma.correctionRequest.findMany({
      where: whereClause,
      include: {
        user: true,
        attendanceLog: true,
        approvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(requests);
  } catch (error) {
    console.error("Error in GET /api/portal/requests:", error);
    return NextResponse.json(
      { error: "Failed to fetch correction requests." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, attendanceLogId, requestedCheckIn, requestedCheckOut, requestedLogType, reason } = body;

    if (!userId || !reason) {
      return NextResponse.json(
        { error: "ID uživatele a důvod opravy jsou povinné." },
        { status: 400 }
      );
    }

    const userIdParsed = parseInt(userId, 10);
    const attendanceLogIdParsed = attendanceLogId ? parseInt(attendanceLogId, 10) : null;

    const request = await prisma.correctionRequest.create({
      data: {
        userId: userIdParsed,
        attendanceLogId: attendanceLogIdParsed,
        requestedCheckIn: requestedCheckIn ? new Date(requestedCheckIn) : null,
        requestedCheckOut: requestedCheckOut ? new Date(requestedCheckOut) : null,
        requestedLogType: requestedLogType || "WORK",
        reason: reason.trim(),
        status: "PENDING",
      },
    });

    return NextResponse.json(request, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/portal/requests:", error);
    return NextResponse.json(
      { error: "Failed to create correction request." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { requestId, status, approvedById } = body; // status: APPROVED or REJECTED

    if (!requestId || !status || !approvedById) {
      return NextResponse.json(
        { error: "ID žádosti, nový stav a ID schvalovatele jsou povinné." },
        { status: 400 }
      );
    }

    const requestIdParsed = parseInt(requestId, 10);
    const approvedByIdParsed = parseInt(approvedById, 10);

    const request = await prisma.correctionRequest.findUnique({
      where: { id: requestIdParsed },
      include: { attendanceLog: true },
    });

    if (!request) {
      return NextResponse.json(
        { error: "Correction request not found." },
        { status: 404 }
      );
    }

    if (request.status !== "PENDING") {
      return NextResponse.json(
        { error: "Tato žádost již byla zpracována." },
        { status: 400 }
      );
    }

    if (status === "APPROVED") {
      // Approve workflow
      if (request.attendanceLogId) {
        // Edit existing log
        const log = request.attendanceLog!;
        await prisma.attendanceLog.update({
          where: { id: log.id },
          data: {
            checkIn: request.requestedCheckIn || log.checkIn,
            checkOut: request.requestedCheckOut || log.checkOut,
            logType: request.requestedLogType,
            status: "MANUALLY_EDITED",
            editedById: approvedByIdParsed,
            note: `Schváleno z žádosti: ${request.reason}`,
            originalCheckIn: log.originalCheckIn || log.checkIn,
            originalCheckOut: log.originalCheckOut || log.checkOut,
          },
        });
      } else {
        // Create new log (forgot checkin/checkout)
        if (!request.requestedCheckIn) {
          return NextResponse.json(
            { error: "Pro schválení nového záznamu chybí čas příchodu." },
            { status: 400 }
          );
        }
        await prisma.attendanceLog.create({
          data: {
            userId: request.userId,
            checkIn: request.requestedCheckIn,
            checkOut: request.requestedCheckOut || null,
            logType: request.requestedLogType,
            status: "MANUALLY_EDITED",
            editedById: approvedByIdParsed,
            note: `Nový záznam schválen z žádosti: ${request.reason}`,
          },
        });
      }
    }

    // Update Request status
    const updatedRequest = await prisma.correctionRequest.update({
      where: { id: requestIdParsed },
      data: {
        status: status as "APPROVED" | "REJECTED",
        approvedById: approvedByIdParsed,
      },
      include: {
        user: true,
        approvedBy: true,
      },
    });

    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error("Error in PUT /api/portal/requests:", error);
    return NextResponse.json(
      { error: "Failed to process correction request." },
      { status: 500 }
    );
  }
}
