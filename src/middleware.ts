import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getRequestId, sanitizeRequestId } from "@/lib/observability/request-context";

export function middleware(request: NextRequest) {
  const incoming = sanitizeRequestId(request.headers.get("x-request-id"));
  const requestId = getRequestId(incoming);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icons/|manifest\\.webmanifest|sw\\.js).*)",
  ],
};
