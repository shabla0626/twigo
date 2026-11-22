import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

// Optimistic check only: visitors without a session cookie are sent to the
// login page. Authoritative, database-backed checks happen in requireAdmin(),
// requireMember() and requireUser() inside every page and server action.
export function proxy(req: NextRequest) {
  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin/:path*", "/community/:path*", "/account/:path*", "/application"] };
