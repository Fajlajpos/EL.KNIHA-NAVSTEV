import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // 1. Fetch visitors inside the building (odchod is null) or left today
    const activeVisitors = await prisma.visit.findMany({
      where: {
        OR: [
          { cas_odchodu: null },
          { cas_odchodu: { gte: startOfToday } },
        ],
      },
      orderBy: { cas_prichodu: "desc" },
    });

    // 2. Fetch employees checked in today (even if checked out, to see who was here today)
    const todayEmployeeLogs = await prisma.attendanceLog.findMany({
      where: {
        checkIn: { gte: startOfToday },
      },
      include: {
        user: true,
      },
      orderBy: { checkIn: "desc" },
    });

    // Format visitor entries
    const visitors = activeVisitors.map((v) => ({
      id: `v-${v.id}`,
      type: "visitor",
      firstName: v.jmeno,
      lastName: v.prijmeni,
      organization: v.organizace || "Návštěvník",
      spz: v.spz || null,
      checkIn: v.cas_prichodu,
      checkOut: v.cas_odchodu,
      status: v.cas_odchodu ? "Odešel" : "V budově",
      department: "Hosté",
    }));

    // Format employee entries
    const employees = todayEmployeeLogs.map((log) => {
      let displayStatus = "Uvnitř";
      if (log.checkOut) {
        displayStatus = "Odešel";
      } else {
        switch (log.logType) {
          case "LUNCH":
            displayStatus = "Na obědě";
            break;
          case "DOCTOR":
            displayStatus = "U lékaře";
            break;
          case "BUSINESS_TRIP":
            displayStatus = "Služební cesta";
            break;
          case "BREAK":
            displayStatus = "Na přestávce";
            break;
          default:
            displayStatus = "Pracuje";
        }
      }

      return {
        id: `e-${log.id}`,
        type: "employee",
        employeeNumber: log.user.employeeNumber,
        firstName: log.user.firstName,
        lastName: log.user.lastName,
        department: log.user.department,
        checkIn: log.checkIn,
        checkOut: log.checkOut,
        logType: log.logType,
        status: displayStatus,
        statusCode: log.status, // OPEN, OK, ERROR, MANUALLY_EDITED
      };
    });

    return NextResponse.json({
      visitors,
      employees,
    });
  } catch (error) {
    console.error("Error in GET /api/attendance/live:", error);
    return NextResponse.json(
      { error: "Failed to load live tracking data." },
      { status: 500 }
    );
  }
}
