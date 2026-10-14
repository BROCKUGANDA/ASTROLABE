/**
 * ASTROLABE — Versioned owner directory (PRD §12 routing, §23 edge case 21).
 *
 * Why this exists as data and not as code: routing is configuration. A demo has
 * to be able to say "the AUH IT desk is a different human from the DXB IT desk,
 * and every role has a named backup" without touching a matcher. Every person
 * referenced here is an id that already exists in the pack's owner set
 * (`owners` / `managers` / `hrbps`), because an assignee outside that set is
 * unroutable and the engine fires RQ-05 on it.
 *
 * Resolution rungs (in order, first hit wins — the whole path is returned so a
 * reviewer can see which rung decided, not just who was chosen):
 *   1. step owner          — a step with a standing named owner (visa, payroll)
 *   2. location queue      — the queue that works this (request_type, location)
 *   3. functional fallback — the group that owns the request type functionally
 *   4. HRBP of record      — the employee's own HRBP
 *   5. E_NO_OWNER          — nobody resolvable; the response names who was told
 *                            instead, so the employee never gets a bare error.
 *
 * Every rung carries a backup so an unanswered escalation can be re-routed to a
 * named second human (see src/lib/escalations/store.ts).
 */

import {
  getOwner,
  hrbps as ALL_HRBPS,
  type Employee,
  type Location,
  type Owner,
  type RequestType,
} from "@/lib/data/pack";

export const OWNER_DIRECTORY_VERSION = "owner-directory-1.1.0";

/** A routing slot: the named primary and the named human behind them. */
export interface OwnerSlot {
  primary: string;
  backup: string;
  /** Who actually answers, for the audit trail ("IT counter, Dubai"). */
  queue?: string;
}

/** Rung 3 — the group that owns each request type when no queue matches. */
export const FUNCTIONAL_GROUP: Record<RequestType, Owner["group"]> = {
  it_kit: "IT",
  system_access: "IT",
  visa: "Immigration",
  relocation: "Mobility",
  payroll: "Payroll",
  training: "Learning",
  facilities: "Facilities",
  manager_handover: "HR",
};

/** Owner-group primaries. A group with no entry here cannot be routed. */
export const GROUP_OWNERS: Record<Owner["group"], OwnerSlot> = {
  IT: { primary: "O-IT-1", backup: "O-IT-2" },
  HR: { primary: "O-HR-1", backup: "O-HR-2" },
  Learning: { primary: "O-LEARN-1", backup: "O-HR-1" },
  Facilities: { primary: "O-FAC-1", backup: "O-HR-1" },
  Mobility: { primary: "O-HR-2", backup: "O-HR-1" },
  Payroll: { primary: "O-PAY-1", backup: "O-HR-1" },
  Immigration: { primary: "O-IMM-1", backup: "O-HR-1" },
};

/**
 * Rung 1 — steps with a STANDING named owner. Immigration is the single owner of
 * visa status in every emirate (relocation-policy/immigration-policy#timeline),
 * so a visa step must not be re-queued by location. Steps absent from this table
 * are counter work and fall to the location queue — that is the point.
 */
export const STEP_OWNERS: Record<string, OwnerSlot> = {
  ob_visa_application: { primary: "O-IMM-1", backup: "O-HR-1", queue: "Immigration desk — single owner of visa status" },
  ob_relocation_allowance: { primary: "O-HR-2", backup: "O-HR-1", queue: "Mobility desk — allowance" },
  mb_payroll_change: { primary: "O-PAY-1", backup: "O-HR-1", queue: "Payroll — transfer cutoff" },
};

/**
 * Rung 2 — the queue that works a (request_type, location) pair. Deliberately
 * sparse: SHJ and REMOTE have no on-the-ground IT, facilities or access counter
 * in the pack, so those keys are ABSENT and resolution falls through to the
 * functional fallback with the miss recorded in the path. That fall-through is
 * the auditable difference between "we know who does this here" and "we guessed".
 */
export const LOCATION_QUEUES: Record<string, OwnerSlot> = {
  "it_kit:DXB": { primary: "O-IT-1", backup: "O-IT-2", queue: "IT counter — Dubai (DXB)" },
  "it_kit:AUH": { primary: "O-IT-2", backup: "O-IT-1", queue: "IT counter — Abu Dhabi (AUH)" },
  "system_access:DXB": { primary: "O-IT-2", backup: "O-IT-1", queue: "Access desk — Dubai (DXB)" },
  "system_access:AUH": { primary: "O-IT-1", backup: "O-IT-2", queue: "Access desk — Abu Dhabi (AUH)" },
  "facilities:DXB": { primary: "O-FAC-1", backup: "O-HR-1", queue: "Facilities counter — Dubai (DXB)" },
  "facilities:AUH": { primary: "O-FAC-1", backup: "O-HR-2", queue: "Facilities counter — Abu Dhabi (AUH)" },
  "visa:DXB": { primary: "O-IMM-1", backup: "O-HR-1", queue: "Immigration desk — Dubai (DXB)" },
  "visa:AUH": { primary: "O-IMM-1", backup: "O-HR-2", queue: "Immigration desk — Abu Dhabi (AUH)" },
  "relocation:DXB": { primary: "O-HR-2", backup: "O-HR-1", queue: "Mobility desk — Dubai (DXB)" },
  "relocation:AUH": { primary: "O-HR-2", backup: "HRBP-2", queue: "Mobility desk — Abu Dhabi (AUH)" },
  "payroll:DXB": { primary: "O-PAY-1", backup: "O-HR-1", queue: "Payroll — Dubai (DXB)" },
  "payroll:AUH": { primary: "O-PAY-1", backup: "HRBP-2", queue: "Payroll — Abu Dhabi (AUH)" },
  "training:DXB": { primary: "O-LEARN-1", backup: "O-HR-1", queue: "Learning — Dubai (DXB)" },
  "training:AUH": { primary: "O-LEARN-1", backup: "HRBP-2", queue: "Learning — Abu Dhabi (AUH)" },
  "manager_handover:DXB": { primary: "MGR-1", backup: "HRBP-1", queue: "People team — Dubai (DXB)" },
  "manager_handover:AUH": { primary: "MGR-2", backup: "HRBP-2", queue: "People team — Abu Dhabi (AUH)" },
};

/**
 * Rung 4 — the HRBP backup rotation. An escalation sits with the HRBP of record;
 * if that person does not acknowledge inside the SLA it moves to their named
 * backup, not to "the HR team".
 */
export const HRBP_ROTATION: Record<string, string> = {
  "HRBP-1": "HRBP-2",
  "HRBP-2": "HRBP-1",
};

/** Rung 5 — who is told when no rung above resolves. */
export const DUTY_CONTACT: OwnerSlot = { primary: "HRBP-1", backup: "HRBP-2" };

/** The shape a resolver reads, so a test can hand in a hole-ridden copy. */
export interface OwnerDirectory {
  version: string;
  stepOwners: Record<string, OwnerSlot>;
  groupOwners: Record<string, OwnerSlot>;
  locationQueues: Record<string, OwnerSlot>;
  hrbpRotation: Record<string, string>;
  /** null models a directory with no duty rota at all — the true terminal case. */
  dutyContact: OwnerSlot | null;
}

export const DEFAULT_DIRECTORY: OwnerDirectory = {
  version: OWNER_DIRECTORY_VERSION,
  stepOwners: STEP_OWNERS,
  groupOwners: GROUP_OWNERS,
  locationQueues: LOCATION_QUEUES,
  hrbpRotation: HRBP_ROTATION,
  dutyContact: DUTY_CONTACT,
};

export function queueKey(type: RequestType, location: Location | string): string {
  return `${type}:${location}`;
}

/** Resolve an id to a named human. Returns null when the directory cannot name anyone. */
export function personById(id: string | null | undefined): Owner | null {
  if (!id) return null;
  return getOwner(id) ?? null;
}

export function slotPeople(
  slot: OwnerSlot | null | undefined
): { owner: Owner | null; backup: Owner | null } {
  if (!slot) return { owner: null, backup: null };
  return { owner: personById(slot.primary), backup: personById(slot.backup) };
}

/**
 * The named second human behind an owner. Searches the slots that name that id
 * as primary, then the HRBP rotation. Used by the acknowledgement re-route so a
 * lapsed escalation lands on a person, not on a queue.
 */
export function backupFor(directory: OwnerDirectory, ownerId: string): Owner | null {
  const slots: (OwnerSlot | undefined)[] = [
    ...Object.values(directory.stepOwners),
    ...Object.values(directory.locationQueues),
    ...Object.values(directory.groupOwners),
  ];
  for (const slot of slots) {
    if (slot && slot.primary === ownerId && slot.backup) return personById(slot.backup);
  }
  const rotated = directory.hrbpRotation[ownerId];
  if (rotated) return personById(rotated);
  return null;
}

export type ResolutionRung =
  | "step_owner"
  | "location_queue"
  | "functional_fallback"
  | "hrbp_of_record"
  | "no_owner";

export interface NoOwnerInfo {
  code: "E_NO_OWNER";
  /** The named human who was told instead, or null when nobody could be named. */
  toldInstead: { name: string; role: string; email: string } | null;
  /** Operations-facing: what the routing did and why. */
  message: string;
  /** Employee-facing, grade 6, EN/AR pair. */
  employeeMessage: { en: string; ar: string };
}

export interface OwnerResolution {
  owner: Owner | null;
  backup: Owner | null;
  /** Every rung visited, including the misses — this is the audit trail. */
  path: string[];
  rung: ResolutionRung;
  fallbackUsed: boolean;
  queueLabel?: string;
  directoryVersion: string;
  noOwner?: NoOwnerInfo;
}

/**
 * Walk the rungs. Pure: takes the request type, the employee (for location and
 * HRBP of record) and the step the request came from, and returns the named
 * owner, the named backup and the full path taken.
 */
export function resolveOwnerFromDirectory(
  type: RequestType,
  employee: Employee,
  options: {
    /** The journey step that produced this request, when there is one. */
    stepKey?: string | null;
    directory?: OwnerDirectory;
    /** Explicit location — the intake form's delivery-location / site answer. */
    location?: Location | string;
  } = {}
): OwnerResolution {
  const directory = options.directory ?? DEFAULT_DIRECTORY;
  const location = (options.location ?? employee.location) as Location | string;
  const path: string[] = [`directory:${directory.version}`];

  // Rung 1 — a step with a standing named owner.
  const stepKey = options.stepKey ?? null;
  const stepSlot = stepKey ? directory.stepOwners[stepKey] : undefined;
  if (stepSlot) {
    const { owner, backup } = slotPeople(stepSlot);
    if (owner) {
      path.push(`1_step_owner:${stepKey}→${owner.id}`);
      return {
        owner,
        backup,
        path,
        rung: "step_owner",
        fallbackUsed: false,
        queueLabel: stepSlot.queue,
        directoryVersion: directory.version,
      };
    }
    path.push(`1_step_owner:${stepKey}→unresolvable(${stepSlot.primary})`);
  } else {
    path.push(`1_step_owner:${stepKey ?? "no_step"}→miss`);
  }

  // Rung 2 — the queue that works (request_type, location). The location is part
  // of the key, so DXB and AUH can be different humans on purpose.
  const key = queueKey(type, location);
  const queueSlot = directory.locationQueues[key];
  if (queueSlot) {
    const { owner, backup } = slotPeople(queueSlot);
    if (owner) {
      path.push(`2_location_queue:${key}→${owner.id}`);
      return {
        owner,
        backup,
        path,
        rung: "location_queue",
        fallbackUsed: false,
        queueLabel: queueSlot.queue,
        directoryVersion: directory.version,
      };
    }
    path.push(`2_location_queue:${key}→unresolvable(${queueSlot.primary})`);
  } else {
    path.push(`2_location_queue:${key}→miss`);
  }

  // Rung 3 — functional fallback: whichever group owns this type.
  const functionalGroup = FUNCTIONAL_GROUP[type];
  const fallbackSlot = functionalGroup ? directory.groupOwners[functionalGroup] : undefined;
  const fallback = slotPeople(fallbackSlot);
  if (fallback.owner) {
    path.push(`3_functional_fallback:${functionalGroup}→${fallback.owner.id}`);
    return {
      owner: fallback.owner,
      backup: fallback.backup,
      path,
      rung: "functional_fallback",
      fallbackUsed: true,
      queueLabel: fallbackSlot?.queue,
      directoryVersion: directory.version,
    };
  }
  path.push(`3_functional_fallback:${functionalGroup ?? "none"}→miss`);

  // Rung 4 — the HRBP of record.
  const hrbp = personById(employee.hrbpId);
  if (hrbp) {
    path.push(`4_hrbp_of_record:${hrbp.id}`);
    return {
      owner: hrbp,
      backup: personById(directory.hrbpRotation[hrbp.id]),
      path,
      rung: "hrbp_of_record",
      fallbackUsed: true,
      queueLabel: `HRBP of record — ${employee.team}`,
      directoryVersion: directory.version,
    };
  }
  path.push(`4_hrbp_of_record:${employee.hrbpId || "none"}→miss`);

  // Rung 5 — explicit E_NO_OWNER that names who was told instead.
  const duty = slotPeople(directory.dutyContact);
  const toldInstead = duty.owner
    ? { name: duty.owner.name, role: duty.owner.role, email: duty.owner.email }
    : null;
  path.push(toldInstead ? `5_no_owner:told_instead=${duty.owner?.id}` : "5_no_owner:nobody_to_tell");

  const message = toldInstead
    ? `No service owner could be resolved for ${type} at ${location}. The case was handed to ${toldInstead.name} (${toldInstead.role}, ${toldInstead.email}).`
    : `No service owner could be resolved for ${type} at ${location}, and the directory names no duty contact. The case is parked in the HR queue with no named owner.`;

  return {
    owner: null,
    backup: duty.backup,
    path,
    rung: "no_owner",
    fallbackUsed: true,
    directoryVersion: directory.version,
    noOwner: {
      code: "E_NO_OWNER",
      toldInstead,
      message,
      employeeMessage: {
        en: toldInstead
          ? `We could not find the team that handles ${TYPE_PLAIN[type]}. ${toldInstead.name} in HR has it now and will come back to you.`
          : `We could not find the team that handles ${TYPE_PLAIN[type]}, and we have no named person yet. Your request is saved and someone in HR will come back to you.`,
        ar: toldInstead
          ? `لم نجد الفريق الذي يتعامل مع ${TYPE_PLAIN_AR[type]}. القضية الآن عند ${toldInstead.name} من الموارد البشرية، وسيعود إليك.`
          : `لم نجد الفريق الذي يتعامل مع ${TYPE_PLAIN_AR[type]}، وليس لدينا شخص مسمّى بعد. طلبك محفوظ وسيعود إليك شخص من الموارد البشرية.`,
      },
    },
  };
}

const TYPE_PLAIN: Record<RequestType, string> = {
  it_kit: "your laptop and phone",
  system_access: "your system access",
  visa: "your visa",
  relocation: "your move",
  payroll: "your pay",
  training: "your training",
  facilities: "your badge and desk",
  manager_handover: "your handover",
};

const TYPE_PLAIN_AR: Record<RequestType, string> = {
  it_kit: "حاسوبك وهاتفك",
  system_access: "الوصول إلى أنظمتك",
  visa: "تأشيرتك",
  relocation: "انتقالك",
  payroll: "رواتبك",
  training: "تدريبك",
  facilities: "بطاقتك ومكتبك",
  manager_handover: "تسليم عملك",
};

/** Every id the directory can name — used to keep routing honest in tests. */
export function directoryKnownIds(directory: OwnerDirectory = DEFAULT_DIRECTORY): string[] {
  const ids = new Set<string>();
  const slots = [
    ...Object.values(directory.stepOwners),
    ...Object.values(directory.groupOwners),
    ...Object.values(directory.locationQueues),
  ];
  for (const slot of slots) {
    if (personById(slot.primary)) ids.add(slot.primary);
    if (personById(slot.backup)) ids.add(slot.backup);
  }
  for (const [id, backup] of Object.entries(directory.hrbpRotation)) {
    if (personById(id)) ids.add(id);
    if (personById(backup)) ids.add(backup);
  }
  if (directory.dutyContact) {
    if (personById(directory.dutyContact.primary)) ids.add(directory.dutyContact.primary);
    if (personById(directory.dutyContact.backup)) ids.add(directory.dutyContact.backup);
  }
  return [...ids];
}

/** HRBP ids in the pack — kept here so consumers do not re-derive them. */
export function allHrbpIds(): string[] {
  return ALL_HRBPS.map((h) => h.id);
}
