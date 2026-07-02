import { NextResponse, type NextRequest } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthPath = pathname.startsWith("/login");

  const session = await verifyToken(request.cookies.get(COOKIE_NAME)?.value);

  if (!session && !isAuthPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (session && isAuthPath) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // run on everything except static assets and the API (login/logout live under /api)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
