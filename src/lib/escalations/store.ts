/**
 * ASTROLABE — Escalation store (in-memory, prototype only).
 *
 * An escalation packet used to be a pure function result that was thrown away:
 * nothing remembered that a packet existed, so the same employee with the same
 * root cause could be escalated twice in an afternoon, the employee was never
 * told, and there was no acknowledgement clock to miss.
 *
 * This module is the memory behind the packet:
 *  - a 72-hour duplicate guard on (employeeId, root cause);
 *  - the acknowledgement SLA — 4 WORKING hours, on the employee's location
 *    calendar, not four wall-clock hours across a weekend;
 *  - a re-route to the named BACKUP owner when that deadline passes, with an
 *    audit entry saying so;
 *  - the employee's own view: they can read the packet about them and add one
 *    sentence, or decline to.
 */

import { calendarFor, addWorkingHours } from "@/lib/engine/calendar";
import { resolveAsOf } from "@/lib/engine/clock";
import type { Employee } from "@/lib/data/pack";
import type { EscalationPacket } from "@/lib/actions/actions";
import {
  backupFor,
  personById,
  DEFAULT_DIRECTORY,
  type OwnerDirectory,
} from "@/lib/requests/directory";
import { pushNotification } from "@/lib/notifications/store";

/** PRD §14 — a named human owes an acknowledgement within 4 working hours. */
export const ACK_SLA_WORKING_HOURS = 4;

/** The duplicate window for escalations: 72 hours, same root cause. */
export const ESCALATION_DEDUP_WINDOW_MS = 72 * 60 * 60 * 1000;

export interface EscalationAuditEntry {
  at: string;
  action:
    | "created"
    | "duplicate_suppressed"
    | "notified_employee"
    | "acknowledged"
    | "rerouted_to_backup"
    | "employee_sentence"
    | "employee_declined";
  actor: string;
  detail: string;
}

export interface EmployeeResponse {
  kind: "sentence" | "declined";
  text?: string;
  at: string;
}

export interface StoredEscalation {
  packet: EscalationPacket;
  rootCause: string;
  /** Location the working calendar is read from. */
  location: string;
  createdAt: string;
  ackDeadlineAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  reroutedAt: string | null;
  duplicateCount: number;
  lastDuplicateAt: string | null;
  notificationId: string | null;
  employeeResponse: EmployeeResponse | null;
  audit: EscalationAuditEntry[];
}

const escalations = new Map<string, StoredEscalation>();

export function allEscalations(): StoredEscalation[] {
  return [...escalations.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function escalationById(id: string): StoredEscalation | null {
  return escalations.get(id) ?? null;
}

/** Every packet about one employee, newest first — the employee's own view. */
export function escalationsForEmployee(employeeId: string): StoredEscalation[] {
  return [...escalations.values()]
    .filter((e) => e.packet.employeeId === employeeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The deadline an escalation owes its named owner. */
export function ackDeadlineFor(createdAtIso: string, location: string): string {
  return addWorkingHours(
    createdAtIso,
    ACK_SLA_WORKING_HOURS,
    calendarFor(location),
    [],
    new Date(createdAtIso),
  );
}

/**
 * The duplicate guard: the same employee, the same root cause, inside 72 hours.
 * This is the same idea as intake dedup — the second caller is usually the same
 * worried human pressing the button again, and a second packet would put two
 * copies of one case in front of two different people.
 */
export function findExistingEscalation(
  employeeId: string,
  rootCause: string,
  now: Date = resolveAsOf(null),
  windowMs: number = ESCALATION_DEDUP_WINDOW_MS,
): StoredEscalation | null {
  let best: StoredEscalation | null = null;
  for (const stored of escalations.values()) {
    if (stored.packet.employeeId !== employeeId) continue;
    if (stored.rootCause !== rootCause) continue;
    if (now.getTime() - new Date(stored.createdAt).getTime() > windowMs) continue;
    if (!best || new Date(stored.createdAt) > new Date(best.createdAt)) best = stored;
  }
  return best;
}

export interface RecordEscalationInput {
  packet: EscalationPacket;
  rootCause: string;
  employee: Employee;
  nowIso?: string | Date | null;
  directory?: OwnerDirectory;
}

/**
 * File a packet: store it, compute its acknowledgement deadline on the location
 * calendar, and notify the employee through the real notification store. The
 * employee is told WHO the named human is, in their own language.
 */
export function recordEscalation(input: RecordEscalationInput): StoredEscalation {
  const now = resolveAsOf(input.nowIso ?? null);
  const directory = input.directory ?? DEFAULT_DIRECTORY;
  const at = now.toISOString();
  const location = String(input.employee.location);
  const backup =
    (input.packet.backupOwner ? personById(input.packet.backupOwner.id) : null) ??
    backupFor(directory, input.packet.namedOwner.id) ??
    personById(directory.dutyContact?.primary ?? null);

  const deadline = ackDeadlineFor(at, location);

  const stored: StoredEscalation = {
    packet: {
      ...input.packet,
      backupOwner: backup
        ? { id: backup.id, name: backup.name, role: backup.role, email: backup.email }
        : input.packet.backupOwner,
    },
    rootCause: input.rootCause,
    location,
    createdAt: at,
    ackDeadlineAt: deadline,
    acknowledgedAt: null,
    acknowledgedBy: null,
    reroutedAt: null,
    duplicateCount: 0,
    lastDuplicateAt: null,
    notificationId: null,
    employeeResponse: null,
    audit: [
      {
        at,
        action: "created",
        actor: input.packet.namedOwner.name,
        detail: `Escalation opened for ${input.rootCause}. Acknowledgement due ${deadline} (4 working hours, ${location} calendar).`,
      },
    ],
  };

  // Tell the employee — server-side, in the same store the inbox reads.
  const notified = pushNotification({
    employeeId: input.employee.id,
    type: "escalation",
    priority: "normal",
    category: "hrbp",
    title: `We've asked ${input.packet.namedOwner.name} to step in`,
    titleAr: `طلبنا من ${input.packet.namedOwner.name} التدخّل`,
    body: `We sent a summary of your case to ${input.packet.namedOwner.name}. You can read exactly what we shared and add one sentence of your own.`,
    bodyAr: `أرسلنا ملخّصاً لقضيتك إلى ${input.packet.namedOwner.name}. يمكنك قراءة ما شاركناه بالضبط وإضافة جملة واحدة منك.`,
    action: { label: "See what we shared", labelAr: "اعرض ما شاركناه", view: "me" },
    createdAt: at,
  });
  if (notified) {
    stored.notificationId = notified.id;
    stored.audit.push({
      at,
      action: "notified_employee",
      actor: input.packet.namedOwner.name,
      detail: `Notification ${notified.id} queued for ${input.employee.id}.`,
    });
  } else {
    stored.audit.push({
      at,
      action: "notified_employee",
      actor: input.packet.namedOwner.name,
      detail: `Notification suppressed — the outbound kill switch is on.`,
    });
  }

  escalations.set(stored.packet.id, stored);
  return stored;
}

/** Count a collapsed duplicate against the original packet. */
export function noteEscalationDuplicate(stored: StoredEscalation, at: string): StoredEscalation {
  stored.duplicateCount += 1;
  stored.lastDuplicateAt = at;
  stored.audit.push({
    at,
    action: "duplicate_suppressed",
    actor: "system",
    detail: `A second escalation for ${stored.packet.employeeId} with root cause ${stored.rootCause} was collapsed into ${stored.packet.id}.`,
  });
  return stored;
}

export function acknowledgeEscalation(
  id: string,
  actorId: string,
  nowIso?: string | Date | null,
): StoredEscalation | null {
  const stored = escalations.get(id);
  if (!stored) return null;
  const now = resolveAsOf(nowIso ?? null);
  if (stored.acknowledgedAt) return stored;
  stored.acknowledgedAt = now.toISOString();
  stored.acknowledgedBy = actorId;
  const actor = personById(actorId);
  stored.audit.push({
    at: now.toISOString(),
    action: "acknowledged",
    actor: actor?.name ?? actorId,
    detail: `${actor?.name ?? actorId} acknowledged the packet before the deadline.`,
  });
  return stored;
}

export interface RerouteResult {
  checked: number;
  expired: number;
  rerouted: {
    packetId: string;
    employeeId: string;
    fromOwnerId: string;
    toOwnerId: string;
    deadlineAt: string;
    at: string;
  }[];
}

/**
 * The queue tick. Everything unacknowledged past its 4-working-hour deadline
 * moves to the named backup owner, gets an audit entry, and the employee is told
 * the person handling it changed. Safe to re-run: a packet is only ever rerouted
 * once per deadline.
 */
export function rerouteExpiredAcknowledgements(
  nowIso?: string | Date | null,
  directory: OwnerDirectory = DEFAULT_DIRECTORY,
): RerouteResult {
  const now = resolveAsOf(nowIso ?? null);
  const at = now.toISOString();
  const result: RerouteResult = { checked: 0, expired: 0, rerouted: [] };

  for (const stored of escalations.values()) {
    result.checked += 1;
    if (stored.acknowledgedAt) continue;
    if (stored.reroutedAt) continue;
    if (new Date(stored.ackDeadlineAt).getTime() > now.getTime()) continue;

    result.expired += 1;
    const fromId = stored.packet.namedOwner.id;
    const backup =
      (stored.packet.backupOwner ? personById(stored.packet.backupOwner.id) : null) ??
      backupFor(directory, fromId) ??
      personById(directory.dutyContact?.primary ?? null);

    if (!backup || backup.id === fromId) {
      stored.audit.push({
        at,
        action: "rerouted_to_backup",
        actor: "system",
        detail: `Acknowledgement lapsed after 4 working hours and no backup owner is named for ${fromId}. The packet stays with ${stored.packet.namedOwner.name}.`,
      });
      continue;
    }

    stored.reroutedAt = at;
    const lapsedDeadline = stored.ackDeadlineAt;
    const previous = personById(fromId);
    stored.packet = {
      ...stored.packet,
      namedOwner: { id: backup.id, name: backup.name, role: backup.role, email: backup.email },
      backupOwner: previous
        ? { id: previous.id, name: previous.name, role: previous.role, email: previous.email }
        : stored.packet.backupOwner,
    };
    stored.ackDeadlineAt = ackDeadlineFor(at, stored.location);
    stored.audit.push({
      at,
      action: "rerouted_to_backup",
      actor: "system",
      detail: `${backup.name} has it now: ${previous?.name ?? fromId} did not acknowledge within 4 working hours (deadline ${lapsedDeadline} passed at ${at}).`,
    });

    pushNotification({
      employeeId: stored.packet.employeeId,
      type: "escalation",
      priority: "normal",
      category: "hrbp",
      title: `${stored.packet.namedOwner.name} is now on your case`,
      titleAr: `${stored.packet.namedOwner.name} تتابع قضيتك الآن`,
      body: `We did not hear back from ${personById(fromId)?.name ?? "the first person we asked"} in time, so we passed your case to ${stored.packet.namedOwner.name}. Nothing else changes.`,
      bodyAr: `لم نسمع رداً من ${personById(fromId)?.name ?? "الشخص الأول الذي سألناه"} في الوقت المحدد، لذا مرّرنا قضيتك إلى ${stored.packet.namedOwner.name}. لا يتغيّر شيء آخر.`,
      action: { label: "See what we shared", labelAr: "اعرض ما شاركناه", view: "me" },
      createdAt: at,
    });

    result.rerouted.push({
      packetId: stored.packet.id,
      employeeId: stored.packet.employeeId,
      fromOwnerId: fromId,
      toOwnerId: backup.id,
      deadlineAt: lapsedDeadline,
      at,
    });
  }

  return result;
}

/** The employee adds one sentence, or declines. Either way it is recorded. */
export function respondToEscalation(
  id: string,
  employeeId: string,
  response: EmployeeResponse,
): { stored?: StoredEscalation; error?: string } {
  const stored = escalations.get(id);
  if (!stored) return { error: "not_found" };
  if (stored.packet.employeeId !== employeeId) return { error: "forbidden" };
  if (stored.employeeResponse) return { error: "already_answered" };
  stored.employeeResponse = response;
  stored.audit.push({
    at: response.at,
    action: response.kind === "sentence" ? "employee_sentence" : "employee_declined",
    actor: stored.packet.employeeName,
    detail:
      response.kind === "sentence"
        ? `Employee added one sentence.`
        : `Employee declined to add anything.`,
  });
  return { stored };
}

/** Reset for tests only. */
export function clearEscalations(): void {
  escalations.clear();
}
