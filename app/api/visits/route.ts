import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const visits = await prisma.visit.findMany({
      where: {
        OR: [
          { cas_odchodu: null },
          {
            cas_prichodu: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        ],
      },
      orderBy: {
        cas_prichodu: "desc",
      },
    });

    // Map visits to include computed status field
    const mappedVisits = visits.map((v) => ({
      ...v,
      status: v.cas_odchodu ? "Odešel" : "V budově",
    }));

    return NextResponse.json(mappedVisits);
  } catch (error) {
    console.error("Error fetching visits:", error);
    return NextResponse.json(
      { error: "Failed to fetch visits." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jmeno, prijmeni, organizace, spz } = body;

    if (!jmeno || !prijmeni) {
      return NextResponse.json(
        { error: "Jméno a příjmení jsou povinné." },
        { status: 400 }
      );
    }

    const newVisit = await prisma.visit.create({
      data: {
        jmeno: jmeno.trim(),
        prijmeni: prijmeni.trim(),
        organizace: organizace?.trim() || null,
        spz: spz?.trim() || null,
      },
    });

    return NextResponse.json(
      {
        ...newVisit,
        status: "V budově",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating visit:", error);
    return NextResponse.json(
      { error: "Failed to save visit record." },
      { status: 500 }
    );
  }
}
