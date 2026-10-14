/**
 * Client-side session bootstrap. The browser asks the server for a session; the
 * server decides what that session is allowed to see. The role picker in the UI
 * is a request to switch identity, not a grant of access — every console still
 * re-checks authority on each call.
 */

export type ConsoleRole = "employee" | "hrbp" | "manager" | "service_owner" | "admin" | "judge";

const JUDGE_KEY_HEADER = "astrolabe-dev-judge";
const ADMIN_TOKEN = "astrolabe-dev-admin";

let inflight: Promise<boolean> | null = null;
let signedInAs: { role: ConsoleRole; subject: string } | null = null;

export function currentSessionSubject(): string | null {
  return signedInAs?.subject ?? null;
}

export function invalidateSession(): void {
  signedInAs = null;
  inflight = null;
}

async function post(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<boolean> {
  const response = await fetch("/api/v1/auth/sign-in", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) return false;
  const payload = await response.json();
  signedInAs = {
    role: payload.data?.signedInAs?.role ?? "employee",
    subject: payload.data?.signedInAs?.id ?? "",
  };
  return true;
}

/**
 * Sign in as the console the user selected. For the people consoles the identity
 * is resolved from the employee record server-side (`actingAs`), so the client
 * never claims a scope it was not given.
 */
export async function ensureSession(role: ConsoleRole, employeeId: string): Promise<boolean> {
  const subject = `${role}:${role === "employee" ? employeeId : "shared"}`;
  if (
    signedInAs &&
    `${signedInAs.role}:${signedInAs.subject}` === subject &&
    signedInAs.role === role
  ) {
    return true;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      if (role === "employee") return await post({ employeeId });
      if (role === "hrbp") return await post({ employeeId, actingAs: "hrbp" });
      if (role === "manager") return await post({ employeeId, actingAs: "manager" });
      if (role === "service_owner") return await post({ employeeId, actingAs: "service_owner" });
      if (role === "admin") return await post({ adminToken: ADMIN_TOKEN });
      return await post({ adminToken: ADMIN_TOKEN }, { "x-judge-key": JUDGE_KEY_HEADER });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Re-authenticate for consent changes and data exports (PRD §29 030, 263). */
export async function reauthenticate(): Promise<boolean> {
  const response = await fetch("/api/v1/auth/session", {
    method: "PUT",
    credentials: "same-origin",
  });
  return response.ok;
}

export async function signOut(): Promise<void> {
  await fetch("/api/v1/auth/session", { method: "POST", credentials: "same-origin" });
  invalidateSession();
}

/** A short-lived pulse read needs a declared purpose header (PRD §29 205). */
export function purposeHeaders(purpose: string): Record<string, string> {
  return { "x-purpose": purpose };
}
