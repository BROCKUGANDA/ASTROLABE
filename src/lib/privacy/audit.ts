/**
 * ASTROLABE audit chain (PRD §20-039, M12, §29 218/219/451).
 *
 * Every read of sensitive data, every answer, every routing decision, every
 * escalation and every consent change appends a row whose hash covers the row
 * plus the hash of the row before it, so editing or deleting a row breaks the
 * chain from that point on and verifyChain says so. Revocation is a new row,
 * never an update.
 *
 * The chain lives in process memory behind this one interface; a deployment
 * swaps in an append-only Postgres table with the same row shape, hash formula
 * and verification rule.
 */

import { createHash } from "node:crypto";
import { logger } from "../logger";

export type LawfulBasis =
  | "contract_necessary"
  | "legitimate_interests"
  | "consent"
  | "legal_obligation";

export type ActorRole =
  | "employee"
  | "hrbp"
  | "manager"
  | "service_owner"
  | "admin"
  | "judge"
  | "system";

export interface AuditRow {
  seq: number;
  id: string;
  actor: string;
  actorRole: ActorRole;
  action: string;
  subject: string;
  lawfulBasis: LawfulBasis;
  purpose?: string;
  requestId: string;
  timestamp: string;
  prevHash: string;
  hash: string;
}

export interface AuditWrite {
  actor: string;
  actorRole: ActorRole;
  action: string;
  subject: string;
  lawfulBasis: LawfulBasis;
  purpose?: string;
  requestId?: string;
  timestamp?: string;
}

export interface ChainVerification {
  length: number;
  valid: boolean;
  brokenAt: number | null;
  reason: string | null;
  verifiedAt: string;
}

const GENESIS = "0".repeat(64);

/** Append-only: nothing here mutates or deletes a stored row. */
const rows: AuditRow[] = [];

function digestOf(row: Omit<AuditRow, "hash">): string {
  const payload = [
    row.seq,
    row.id,
    row.actor,
    row.actorRole,
    row.action,
    row.subject,
    row.lawfulBasis,
    row.purpose ?? "",
    row.requestId,
    row.timestamp,
    row.prevHash,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function appendAudit(input: AuditWrite): AuditRow {
  const seq = rows.length;
  const prevHash = seq === 0 ? GENESIS : rows[seq - 1].hash;
  const base: Omit<AuditRow, "hash"> = {
    seq,
    id: `AUD-${String(seq).padStart(6, "0")}`,
    actor: input.actor,
    actorRole: input.actorRole,
    action: input.action,
    subject: input.subject,
    lawfulBasis: input.lawfulBasis,
    purpose: input.purpose,
    requestId: input.requestId ?? "internal",
    timestamp: input.timestamp ?? new Date().toISOString(),
    prevHash,
  };
  const row: AuditRow = { ...base, hash: digestOf(base) };
  rows.push(row);
  return row;
}

export function readAuditChain(): AuditRow[] {
  return rows.map((r) => ({ ...r }));
}

export function auditCount(): number {
  return rows.length;
}

/** Every row that touched `subject`, newest first — the employee's view log. */
export function viewLogFor(subject: string): {
  actor: string;
  actorRole: ActorRole;
  action: string;
  purpose: string | null;
  timestamp: string;
  requestId: string;
}[] {
  return rows
    .filter((r) => r.subject === subject)
    .slice()
    .reverse()
    .map((r) => ({
      actor: r.actor,
      actorRole: r.actorRole,
      action: r.action,
      purpose: r.purpose ?? null,
      timestamp: r.timestamp,
      requestId: r.requestId,
    }));
}

/**
 * Recompute every hash and every link. A zero-length chain is reported as
 * "nothing verified" rather than green, because an empty chain proves nothing.
 */
export function verifyChain(): ChainVerification {
  const verifiedAt = new Date().toISOString();
  if (rows.length === 0) {
    return { length: 0, valid: false, brokenAt: 0, reason: "empty chain — nothing has been recorded yet", verifiedAt };
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const expectedPrev = i === 0 ? GENESIS : rows[i - 1].hash;
    if (row.prevHash !== expectedPrev) {
      return { length: rows.length, valid: false, brokenAt: row.seq, reason: "prev hash does not match the preceding row", verifiedAt };
    }
    const { hash, ...base } = row;
    if (digestOf(base) !== hash) {
      return { length: rows.length, valid: false, brokenAt: row.seq, reason: "row content does not match its own hash", verifiedAt };
    }
  }
  return { length: rows.length, valid: true, brokenAt: null, reason: null, verifiedAt };
}

/**
 * Test and CI hook: prove a tampered row is detected. Mutates in place and is
 * deliberately not exported to route handlers.
 */
export function __tamperForTesting(seq: number, patch: Partial<AuditRow>): boolean {
  const row = rows.find((r) => r.seq === seq);
  if (!row) return false;
  Object.assign(row, patch);
  const verification = verifyChain();
  logger.info("audit chain tamper test", { seq, valid: verification.valid, brokenAt: verification.brokenAt });
  return verification.valid;
}

export function resetChainForTesting(): void {
  rows.length = 0;
}
