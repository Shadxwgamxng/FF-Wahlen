import { NextResponse, type NextRequest } from "next/server";

/** Grobe Vorprüfung (Cookie vorhanden). Die echte Prüfung erfolgt serverseitig gegen die DB. */
export function middleware(req: NextRequest) {
  if (!req.cookies.get("ff_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/wahlen/:path*", "/mitglieder/:path*", "/loeschzuege/:path*", "/aemter/:path*",
    "/dienstgrade/:path*", "/historie/:path*", "/admin/:path*", "/profil/:path*"],
};
