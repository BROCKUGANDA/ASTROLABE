/**
 * ASTROLABE Security Middleware
 * -----------------------------
 * Runs on every request except static asset paths. Adds a hardened set of
 * security headers to all responses and stamps a per-request X-Request-Id
 * (generating one if the client did not supply it) so every log line and
 * every response can be correlated end-to-end.
 *
 * The request id is also written back onto the inbound request headers so
 * route handlers and downstream server modules can read it from
 * `request.headers.get('x-request-id')`.
 */

import { NextResponse, type NextRequest } from "next/server";

const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  [
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  ],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ["X-DNS-Prefetch-Control", "on"],
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
];

/**
 * Generate a request id using the Web Crypto API (available in both edge and
 * node runtimes). Falls back to a timestamp+random slug if crypto is absent.
 */
function generateRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return "rid-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function middleware(request: NextRequest): NextResponse {
  const incoming = request.headers.get("x-request-id");
  const requestId = incoming && incoming.trim().length > 0 ? incoming : generateRequestId();

  // Propagate the request id to downstream route handlers by rewriting the
  // inbound request headers.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Stamp the request id on the outbound response for client correlation.
  response.headers.set("x-request-id", requestId);

  for (const [name, value] of SECURITY_HEADERS) {
    response.headers.set(name, value);
  }

  return response;
}

export const config = {
  /**
   * Run on every path except Next.js static internals and known static
   * assets. Health/version endpoints, API routes, and pages all receive the
   * security headers + request id.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg).*)"],
};
