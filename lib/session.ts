import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dochazkovy-system-knihy-navstev-super-secret-key-12345"
);

export interface SessionPayload {
  username: string;
  role: string;
  employeeNumber: string;
  dbId?: number | null;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get("session_token")?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
