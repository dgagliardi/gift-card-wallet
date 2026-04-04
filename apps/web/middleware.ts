import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

function stripBasePath(pathname: string) {
  if (!basePath) return pathname;
  return pathname.startsWith(basePath)
    ? pathname.slice(basePath.length) || "/"
    : pathname;
}

export function middleware(request: NextRequest) {
  const pathname = stripBasePath(request.nextUrl.pathname);

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/api/")
  ) {
    return NextResponse.next();
  }

  if (!getSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = `${basePath}/login`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/.*|manifest\\.webmanifest|sw\\.js|workbox.*).*)",
  ],
};
