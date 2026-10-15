/**
 * Anti-bot and secret-handling gates.
 *
 * These exist because the controls they cover were previously decorative: the
 * rate limiter keyed on the LEFTMOST X-Forwarded-For entry, which a caller
 * writes themselves, so any script could buy a fresh budget per request; and the
 * judge key was compared with `===` against a value that is the empty string on
 * a production host with no key configured, meaning a blank header matched.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import {
  __resetSignInStrikesForTesting,
  classifyClient,
  clearSignInFailures,
  isCredentialPath,
  isMutating,
  recordSignInFailure,
  sameOriginViolation,
  signInLockState,
} from "../../src/lib/antibot";
import { judgeKeyPresented, secretEquals } from "../../src/lib/privacy/access";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

function requestLike(method: string, origin: string | null, host = "astrolabe.svalley.tech") {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return { method, headers, nextUrl: { host } };
}

describe("client classification", () => {
  test("clients that cannot run JavaScript are automation", () => {
    for (const ua of ["curl/8.9.0", "python-requests/2.32.3", "Wget/1.21", "axios/1.7.2", ""]) {
      expect(classifyClient(ua)).toBe("automation");
    }
    expect(classifyClient(null)).toBe("automation");
  });

  test("browsers and indexers are told apart", () => {
    expect(classifyClient(CHROME)).toBe("browser");
    // Headless browsers are deliberately NOT blocked: the UA is trivially
    // spoofable, they do execute the app, and this project's own verification
    // (frame capture, accessibility audits) runs in one.
    expect(classifyClient(CHROME.replace("Chrome/140", "HeadlessChrome/140"))).toBe("browser");
    expect(
      classifyClient("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"),
    ).toBe("crawler");
  });

  test("only the credential path is gated on identity", () => {
    expect(isCredentialPath("/api/v1/auth/sign-in")).toBe(true);
    expect(isCredentialPath("/api/v1/journey/me")).toBe(false);
    expect(isCredentialPath("/api/healthz")).toBe(false);
    expect(isMutating("POST")).toBe(true);
    expect(isMutating("GET")).toBe(false);
  });
});

describe("same-origin writes", () => {
  test("a cross-origin write is a violation, a same-origin one is not", () => {
    expect(
      isMutating("POST") && sameOriginViolation(requestLike("POST", "https://evil.example")),
    ).toBe(true);
    expect(sameOriginViolation(requestLike("POST", "https://astrolabe.svalley.tech"))).toBe(false);
  });

  test("a client that sends no Origin is not assumed hostile", () => {
    // Command-line and server-to-server callers send neither Origin nor Referer.
    // Refusing them would contradict the documented API; refusing a *browser*
    // posting from another page is the actual protection.
    expect(sameOriginViolation(requestLike("POST", null))).toBe(false);
  });

  test("reads are never blocked on origin", () => {
    expect(sameOriginViolation(requestLike("GET", "https://evil.example"))).toBe(false);
  });

  test("an unparseable Origin is treated as foreign", () => {
    expect(sameOriginViolation(requestLike("POST", "not a url"))).toBe(true);
  });

  test("same-origin is judged against the Host header, not the bind address", () => {
    // The regression this pins: the standalone server reports nextUrl.host as
    // its bind address (0.0.0.0:3200), which no browser Origin matches — every
    // genuine same-origin POST was refused as cross-origin while CI stayed
    // green, because the smoke test posts without an Origin header.
    const headers = new Headers();
    headers.set("origin", "http://localhost:3200");
    headers.set("host", "localhost:3200");
    expect(
      sameOriginViolation({ method: "POST", headers, nextUrl: { host: "0.0.0.0:3200" } }),
    ).toBe(false);

    const foreign = new Headers();
    foreign.set("origin", "http://localhost:3200");
    foreign.set("host", "localhost:3300");
    expect(
      sameOriginViolation({
        method: "POST",
        headers: foreign,
        nextUrl: { host: "localhost:3300" },
      }),
    ).toBe(true);
  });
});

describe("sign-in backoff", () => {
  beforeEach(() => __resetSignInStrikesForTesting());

  test("four rejections do not lock; the fifth starts a minute", () => {
    for (let i = 0; i < 4; i++) recordSignInFailure("signin:1.2.3.4");
    expect(signInLockState("signin:1.2.3.4").locked).toBe(false);
    recordSignInFailure("signin:1.2.3.4");
    const state = signInLockState("signin:1.2.3.4");
    expect(state.locked).toBe(true);
    expect(state.retryAfterSeconds).toBeGreaterThan(0);
    expect(state.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  test("the lock escalates rather than staying flat", () => {
    for (let i = 0; i < 10; i++) recordSignInFailure("signin:9.9.9.9");
    const state = signInLockState("signin:9.9.9.9");
    expect(state.locked).toBe(true);
    expect(state.retryAfterSeconds).toBeGreaterThan(60);
  });

  test("one success clears the history", () => {
    for (let i = 0; i < 9; i++) recordSignInFailure("signin:5.5.5.5");
    clearSignInFailures("signin:5.5.5.5");
    expect(signInLockState("signin:5.5.5.5").locked).toBe(false);
  });

  test("an unrelated key is unaffected", () => {
    for (let i = 0; i < 8; i++) recordSignInFailure("signin:a");
    expect(signInLockState("signin:b").locked).toBe(false);
  });
});

describe("secret comparison", () => {
  test("an unset secret matches nothing, including the empty string", () => {
    expect(secretEquals("", "")).toBe(false);
    expect(secretEquals(undefined, "")).toBe(false);
    expect(secretEquals("anything", "")).toBe(false);
  });

  test("only the exact secret passes", () => {
    expect(secretEquals("s3cr3t-token", "s3cr3t-token")).toBe(true);
    expect(secretEquals("s3cr3t-toke", "s3cr3t-token")).toBe(false);
    expect(secretEquals("s3cr3t-tokeX", "s3cr3t-token")).toBe(false);
    expect(secretEquals(null, "s3cr3t-token")).toBe(false);
  });

  test("a blank header never opens the judge console", () => {
    // The regression this pins: `header === judgeKeyExpected()` returned true for
    // an empty `x-judge-key:` on a host where the key was unset, because the
    // expected value was also "".
    expect(judgeKeyPresented("")).toBe(false);
    expect(judgeKeyPresented(null)).toBe(false);
    expect(judgeKeyPresented("   ")).toBe(false);
  });
});
