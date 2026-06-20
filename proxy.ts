import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "./lib/session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isDashboard = pathname.startsWith("/dashboard");
  const isPortal = pathname.startsWith("/portal");

  if (!isDashboard && !isPortal) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("session_token")?.value;

  if (!sessionCookie) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  const payload = await verifySessionToken(sessionCookie);

  if (!payload) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", pathname);
    const response = NextResponse.redirect(url);
    response.cookies.delete("session_token");
    return response;
  }

  if (isDashboard && payload.role !== "CEO") {
    return NextResponse.redirect(new URL("/portal", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/portal/:path*"],
};
