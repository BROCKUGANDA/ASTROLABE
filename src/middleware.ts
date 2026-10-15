/**
 * ASTROLABE edge gate
 * -------------------
 * Runs on every request except static assets. Three jobs:
 *
 *   1. Security headers on every response, tightened for production.
 *   2. A per-request `x-request-id` for end-to-end correlation.
 *   3. A first bot layer: automation clients are refused on the credential
 *      endpoint, and cross-origin mutating calls are refused everywhere.
 *
 * It deliberately does not import `@/lib/api/envelope`: that module pulls in the
 * data pack for its version constants, and the pack has no business being in the
 * edge bundle. The refusal body below is the same shape, written small.
 */

import { NextResponse, type NextRequest } from "next/server";
import { classifyClient, isCredentialPath, isMutating, sameOriginViolation } from "@/lib/antibot";

/**
 * Content Security Policy.
 *
 * `script-src` keeps `'unsafe-inline'` because Next.js emits inline bootstrap
 * scripts and the app styles with inline `style` attributes throughout; a nonce
 * would mean routing every style through the document, which is a larger change
 * than its benefit here. `'unsafe-eval'` is dropped in production — it is a
 * development-server need, and shipping it in a deployed policy advertises that
 * the page will execute strings.
 */
function csp(isProd: boolean): string {
  const scriptSrc = isProd ? "'self' 'unsafe-inline'" : "'self' 'unsafe-inline' 'unsafe-eval'";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    // Every image this app draws is local, a data: URI from the 3D layer, or a
    // blob. A bare `https:` here let any page on the internet be loaded as an
    // <img>, which is a tracking and exfiltration channel nobody asked for.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

const STATIC_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ["X-DNS-Prefetch-Control", "on"],
  ["Cross-Origin-Opener-Policy", "same-origin"],
  ["Cross-Origin-Resource-Policy", "same-origin"],
  ["X-Permitted-Cross-Domain-Policies", "none"],
  ["Origin-Agent-Cluster", "?1"],
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
];

/**
 * A request id is copied into logs and echoed back in a response header, so an
 * unvalidated client-supplied value is a log-injection and header-splitting
 * primitive. Anything that is not a plain token is discarded and regenerated.
 */
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,64}$/;

function generateRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "rid-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function acceptRequestId(incoming: string | null): string {
  if (incoming && REQUEST_ID.test(incoming)) return incoming;
  return generateRequestId();
}

function refusal(requestId: string, message: string, hint: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      data: null,
      meta: { requestId },
      error: { code: "E_BOT", message, hint, retryable: false },
    },
    { status: 403 },
  );
}

export function middleware(request: NextRequest): NextResponse {
  const isProd = process.env.NODE_ENV === "production";
  const requestId = acceptRequestId(request.headers.get("x-request-id"));
  const path = request.nextUrl.pathname;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);

  response.headers.set("Content-Security-Policy", csp(isProd));
  for (const [name, value] of STATIC_HEADERS) response.headers.set(name, value);

  // API responses are machine-readable and, for this product, may carry a
  // person's journey. robots.txt asks crawlers to stay out of /api/; this header
  // is the part that works even when someone links straight to a response.
  if (path.startsWith("/api/")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, noimageindex");
  }

  if (isProd) {
    if (
      isCredentialPath(path) &&
      classifyClient(request.headers.get("user-agent")) === "automation"
    ) {
      return refusal(
        requestId,
        "Automated clients cannot use the sign-in endpoint.",
        "This endpoint exists for a person in a browser. Scripted checks should target /api/healthz and /api/readyz.",
      );
    }
    if (isMutating(request.method) && sameOriginViolation(request)) {
      return refusal(
        requestId,
        "Cross-origin write refused.",
        "Send the request from the same origin as the session cookie.",
      );
    }
  }

  return response;
}

export const config = {
  /**
   * Every path except Next's static internals and the shipped brand assets. The
   * icons and the social card are plain files with no session and no data in
   * them; running the gate over them only costs a response header pass.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icons/|og.png).*)"],
};
