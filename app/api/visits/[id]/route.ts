import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    if (!id) {
      return NextResponse.json(
        { error: "Návštěva ID je povinné." },
        { status: 400 }
      );
    }

    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      return NextResponse.json(
        { error: "Neplatný formát ID návštěvy." },
        { status: 400 }
      );
    }

    const updatedVisit = await prisma.visit.update({
      where: { id: parsedId },
      data: {
        cas_odchodu: new Date(),
      },
    });

    return NextResponse.json({
      ...updatedVisit,
      status: "Odešel",
    });
  } catch (error) {
    console.error("Error checking out visit:", error);
    return NextResponse.json(
      { error: "Failed to check out visitor." },
      { status: 500 }
    );
  }
}
