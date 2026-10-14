/**
 * ASTROLABE — server-side intake: canonical payload, dedup, expected-by.
 *
 * The client used to send its own idempotency key generated with `Date.now()`,
 * which made a genuine double-submit (double click, retry after a timeout, two
 * tabs) create two tickets: two different keys, two requests. Dedup cannot be
 * the caller's job — the caller is the thing that is broken when it submits
 * twice. So the server derives a canonical payload hash and treats a create as a
 * duplicate when (employeeId, type, payloadHash) matches a request opened in the
 * last 24 hours, whether or not a key came in.
 *
 * An `X-Idempotency-Key` (or body `idempotencyKey`) is still honoured: the same
 * key with the same payload replays the original ticket, the same key with a
 * DIFFERENT payload is a caller bug and returns 409 rather than silently filing
 * something else under the caller's idempotency promise.
 *
 * The canonical payload is also what the employee sees on the confirm preview —
 * one function computes it, so the preview and the persisted ticket cannot drift.
 */

import { createHash } from "node:crypto";
import {
  serviceRequests,
  steps as ALL_STEPS,
  type Employee,
  type RequestType,
  type ServiceRequest,
} from "@/lib/data/pack";
import { addWorkingHours, calendarFor } from "@/lib/engine/calendar";
import { resolveAsOf } from "@/lib/engine/clock";
import type { IntakeSchema } from "@/lib/actions/actions";
import { resolveOwnerFromDirectory, type OwnerResolution } from "./directory";

/** PRD §12 — a repeat of the same intent inside one day is a duplicate. */
export const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type NormalisedValue = string | number | boolean;
export type NormalisedPayload = Record<string, NormalisedValue>;

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Turn a raw intake payload into the canonical shape that is hashed, previewed
 * and persisted. Unknown keys are dropped, whitespace is collapsed, checkbox
 * fields are real booleans, numbers are numbers, and empty values disappear so
 * an optional "notes" box left blank does not change the hash.
 */
export function normaliseIntakePayload(
  schema: IntakeSchema,
  raw: Record<string, unknown> | undefined
): NormalisedPayload {
  const input = raw ?? {};
  const out: NormalisedPayload = {};
  for (const field of schema.fields) {
    const value = input[field.key];
    if (value === undefined || value === null) continue;
    if (field.type === "checkbox") {
      const truthy = value === true || value === "true" || value === "yes" || value === 1 || value === "1";
      if (!truthy) continue;
      out[field.key] = true;
      continue;
    }
    if (field.type === "number") {
      const n = typeof value === "number" ? value : Number(collapse(String(value)));
      if (!Number.isFinite(n)) continue;
      out[field.key] = n;
      continue;
    }
    const text = collapse(String(value));
    if (text.length === 0) continue;
    out[field.key] = text;
  }
  return out;
}

/** Sorted, stable JSON so two runs over the same intake produce the same bytes. */
export function canonicalPayloadJson(payload: NormalisedPayload): string {
  const entries = Object.keys(payload)
    .sort()
    .map((key) => {
      const value = payload[key];
      const normalised = typeof value === "string" ? value.toLowerCase() : value;
      return [key, normalised] as const;
    });
  return JSON.stringify(entries);
}

/** sha256 over employee + type + canonical payload — the server-derived dedup key. */
export function computePayloadHash(
  employeeId: string,
  type: RequestType,
  payload: NormalisedPayload
): string {
  return createHash("sha256")
    .update(`${employeeId}|${type}|${canonicalPayloadJson(payload)}`)
    .digest("hex");
}

/* ------------------------------------------------------------------
   Expected-by — the working calendar, not `addDays(now, ceil(sla/24))`
   ------------------------------------------------------------------ */

/**
 * Due date for a request: openedAt plus `slaHours` of CHARGEABLE time on the
 * location's working calendar. A Friday request in DXB skips the Friday/Saturday
 * weekend, exactly the way the engine's step due dates do.
 */
export function expectedByFor(openedAtIso: string, slaHours: number, location: string): string {
  const cal = calendarFor(location);
  return addWorkingHours(openedAtIso, slaHours, cal, [], new Date(openedAtIso));
}

/* ------------------------------------------------------------------
   Duplicate ledger — the evidence the HRBP view shows as RQ-04
   ------------------------------------------------------------------ */

export interface DuplicateEvent {
  employeeId: string;
  type: RequestType;
  /** The ticket the employee tried to open again. */
  existingRef: string;
  existingId: string;
  at: string;
  payloadHash: string;
  via: "payload" | "idempotency_key";
  hoursSinceOpened: number;
}

const duplicateLedger: DuplicateEvent[] = [];

export function noteDuplicate(event: DuplicateEvent): void {
  duplicateLedger.push(event);
}

export function duplicatesForEmployee(employeeId: string): DuplicateEvent[] {
  return duplicateLedger.filter((d) => d.employeeId === employeeId);
}

export function allDuplicates(): DuplicateEvent[] {
  return [...duplicateLedger];
}

/* ------------------------------------------------------------------
   The payload journal — what the employee previewed IS what we stored
   ------------------------------------------------------------------ */

export interface IntakeRecord {
  requestId: string;
  ref: string;
  employeeId: string;
  type: RequestType;
  payload: NormalisedPayload;
  payloadHash: string;
  openedAt: string;
  expectedBy: string;
  ownerPath: string[];
}

const intakeJournal = new Map<string, IntakeRecord>();

export function intakeRecordFor(requestId: string): IntakeRecord | null {
  return intakeJournal.get(requestId) ?? null;
}

/* ------------------------------------------------------------------
   Lookup
   ------------------------------------------------------------------ */

export interface DedupMatch {
  request: ServiceRequest;
  via: "payload" | "idempotency_key";
}

/** A key the caller supplied that we have already filed. */
export function findByIdempotencyKey(key: string): ServiceRequest | null {
  if (!key) return null;
  return serviceRequests.find((r) => r.idempotencyKey === key) ?? null;
}

/** The same employee, the same type, the same canonical payload, inside 24h. */
export function findPayloadDuplicate(
  employeeId: string,
  type: RequestType,
  payloadHash: string,
  now: Date
): ServiceRequest | null {
  let best: ServiceRequest | null = null;
  for (const r of serviceRequests) {
    if (r.employeeId !== employeeId) continue;
    if (r.type !== type) continue;
    if (r.payloadHash !== payloadHash) continue;
    if (now.getTime() - new Date(r.openedAt).getTime() > DUPLICATE_WINDOW_MS) continue;
    if (!best || new Date(r.openedAt) > new Date(best.openedAt)) best = r;
  }
  return best;
}

export interface IntakeAssessment {
  employee: Employee;
  type: RequestType;
  schema: IntakeSchema;
  payload: NormalisedPayload;
  payloadHash: string;
  openedAt: string;
  expectedBy: string;
  resolution: OwnerResolution;
  idempotencyKey: string;
  duplicateOf: DedupMatch | null;
  keyConflict: ServiceRequest | null;
  /** The journey step this request belongs to, when the map has one. */
  stepKey: string | null;
  /** The location the queue lookup used — DXB and AUH are different queues. */
  location: string;
}

/**
 * The journey step a request type belongs to, in this employee's journey.
 * Rung 1 of the directory is a STEP rung, so this is what makes "step owner"
 * mean something instead of every intake short-circuiting on the request type.
 */
export function stepKeyForRequest(employee: Employee, type: RequestType): string | null {
  return ALL_STEPS.find((s) => s.journeyType === employee.journeyType && s.requestType === type)?.key ?? null;
}

/**
 * The location the intake actually promised to serve: the employee's own location
 * unless the form asked where the thing should be delivered (it_kit) or which
 * site it is for (facilities), in which case the answer wins.
 */
export function intakeLocation(employee: Employee, payload: NormalisedPayload): string {
  const answer = payload.delivery_location ?? payload.site;
  if (typeof answer === "string" && answer.trim().length > 0) return answer.trim().toUpperCase();
  return employee.location;
}

/**
 * Everything the server knows about an intake BEFORE anything is written. The
 * preview endpoint returns this; the create endpoint re-derives it and commits
 * it, so the two can only disagree if the payload changed between them.
 */
export function assessIntake(params: {
  employee: Employee;
  type: RequestType;
  schema: IntakeSchema;
  rawPayload?: Record<string, unknown>;
  idempotencyKey?: string;
  asOf?: string | Date | null;
}): IntakeAssessment {
  const now = resolveAsOf(params.asOf ?? null);
  const payload = normaliseIntakePayload(params.schema, params.rawPayload);
  const payloadHash = computePayloadHash(params.employee.id, params.type, payload);
  const openedAt = now.toISOString();
  const location = intakeLocation(params.employee, payload);
  const expectedBy = expectedByFor(openedAt, params.schema.slaHours, location);
  const stepKey = stepKeyForRequest(params.employee, params.type);

  const resolution = resolveOwnerFromDirectory(params.type, params.employee, { stepKey, location });

  const key = (params.idempotencyKey ?? "").trim();
  const keyed = findByIdempotencyKey(key);
  const keyConflict = keyed && keyed.idempotencyKey === key && keyed.payloadHash !== payloadHash ? keyed : null;

  const payloadHit = findPayloadDuplicate(params.employee.id, params.type, payloadHash, now);
  const duplicateOf: DedupMatch | null = keyed
    ? { request: keyed, via: "idempotency_key" }
    : payloadHit
      ? { request: payloadHit, via: "payload" }
      : null;

  return {
    employee: params.employee,
    type: params.type,
    schema: params.schema,
    payload,
    payloadHash,
    openedAt,
    expectedBy,
    resolution,
    idempotencyKey: key,
    duplicateOf,
    keyConflict,
    stepKey,
    location,
  };
}

/** Monotonic per-process suffix so two distinct intakes never share an id. */
let intakeSeq = 0;

export interface CommitResult {
  request: ServiceRequest;
  record: IntakeRecord;
}

/**
 * Write the ticket. Callers must not `await` between the duplicate check and
 * this function — the single-process event loop is what makes ten concurrent
 * submits collapse into one row.
 */
export function commitIntake(assessment: IntakeAssessment): CommitResult {
  const { employee, type, payload, payloadHash, openedAt, expectedBy, resolution, schema } = assessment;
  const owner = resolution.owner;
  if (!owner) throw new Error("commitIntake called without a resolved owner — route the E_NO_OWNER case instead");

  intakeSeq += 1;
  const fingerprint = createHash("sha256")
    .update(`${employee.id}|${type}|${payloadHash}|${openedAt}|${intakeSeq}`)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  const id = `SR-${openedAt.slice(0, 4)}-${fingerprint}`;

  const request: ServiceRequest = {
    id,
    ref: id,
    employeeId: employee.id,
    type,
    ownerGroup: owner.group,
    assignee: owner.id,
    status: "submitted",
    openedAt,
    slaHours: schema.slaHours,
    reassignCount: 0,
    returnCount: 0,
    idempotencyKey: assessment.idempotencyKey || `srv-${payloadHash.slice(0, 16)}`,
    payloadHash,
  };

  serviceRequests.push(request);

  const record: IntakeRecord = {
    requestId: id,
    ref: id,
    employeeId: employee.id,
    type,
    payload,
    payloadHash,
    openedAt,
    expectedBy,
    ownerPath: resolution.path,
  };
  intakeJournal.set(id, record);

  return { request, record };
}
