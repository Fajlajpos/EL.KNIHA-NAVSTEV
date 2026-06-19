import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const maxDuration = 30; // standard Next.js max duration for Serverless Functions

// Initialize OpenAI client inside the route or lazily
const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "sk-proj-placeholder-replace-me") {
    throw new Error("OPENAI_API_KEY is not configured in the environment (.env file).");
  }
  return new OpenAI({ apiKey });
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No image file was uploaded." },
        { status: 400 }
      );
    }

    // Read the file into a buffer in memory
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString("base64");
    const mimeType = file.type || "image/jpeg";

    const openai = getOpenAIClient();

    // Call OpenAI GPT-4o-mini Vision with Structured Outputs (JSON Schema)
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Najdi na tomto dokladu pouze Jméno (First Name) a Příjmení (Last Name/Surname) a vrať je. Pokud chybí nebo nejsou čitelné, nech prázdný řetězec. Vrať čistá data bez titulů.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "extracted_name",
          strict: true,
          schema: {
            type: "object",
            properties: {
              jmeno: {
                type: "string",
                description: "Křestní jméno / First name extracted from the ID.",
              },
              prijmeni: {
                type: "string",
                description: "Příjmení / Last name extracted from the ID.",
              },
            },
            required: ["jmeno", "prijmeni"],
            additionalProperties: false,
          },
        },
      },
    });

    const outputText = response.choices[0]?.message?.content;
    if (!outputText) {
      throw new Error("OpenAI returned an empty response.");
    }

    const result = JSON.parse(outputText);

    // GDPR Safety: The base64Image, buffer, and response are local variable bindings
    // and will be garbage collected as soon as this function execution finishes.
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in /api/scan route:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
