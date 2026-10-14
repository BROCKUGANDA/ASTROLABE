/**
 * Test world builder: a small, explicit way to construct any journey state the
 * engine can be asked about, including contradictory ones (PRD §29 024,
 * §23 edge case 58). Every signal test builds its own world rather than
 * depending on the seed pack, so a failure points at one rule.
 */

import {
  steps,
  stages,
  policies,
  type AnswerRecord,
  type ConsentRecord,
  type Employee,
  type IntakeDraftRecord,
  type JourneyEvent,
  type PulseResponse,
  type ServiceRequest,
} from "../../src/lib/data/pack";
import { assess, packData, type Assessment, type EngineData } from "../../src/lib/engine/engine";

export const CLOCK = new Date("2024-10-19T10:00:00Z");

export function hoursAgo(h: number): string {
  return new Date(CLOCK.getTime() - h * 3600000).toISOString();
}
export function daysAgo(d: number): string {
  return hoursAgo(24 * d);
}
export function daysAhead(d: number): string {
  return hoursAgo(-24 * d);
}

export function baseEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "T-001",
    ref: "T-001",
    displayName: "Test Employee",
    journeyType: "onboarding",
    stage: "pre_boarding",
    startDate: daysAgo(5),
    location: "DXB",
    timezone: "Asia/Dubai",
    managerId: "MGR-1",
    hrbpId: "HRBP-1",
    locale: "en",
    role: "Tester",
    team: "QA",
    nationality: "Testland",
    ...overrides,
  } as Employee;
}

let eventSeq = 0;
export function ev(
  employeeId: string,
  stepKey: string,
  type: JourneyEvent["type"],
  occurredAt: string,
  extra: Partial<JourneyEvent> = {},
): JourneyEvent {
  eventSeq++;
  return {
    id: `TEV-${eventSeq}`,
    employeeId,
    stepKey,
    type,
    occurredAt,
    recordedAt: extra.recordedAt ?? occurredAt,
    source: extra.source ?? "test-system",
    payloadHash: `tevh-${eventSeq}`,
    ...extra,
  };
}

export interface World {
  employee: Employee;
  events: JourneyEvent[];
  requests: ServiceRequest[];
  pulse: PulseResponse[];
  answers: AnswerRecord[];
  drafts: IntakeDraftRecord[];
  consents: ConsentRecord[];
  asOf: Date;
}

export function world(input: Partial<World> = {}): World {
  const employee = input.employee ?? baseEmployee();
  return {
    employee,
    events: input.events ?? [],
    requests: input.requests ?? [],
    pulse: input.pulse ?? [],
    answers: input.answers ?? [],
    drafts: input.drafts ?? [],
    consents: input.consents ?? [],
    asOf: input.asOf ?? CLOCK,
  };
}

export function dataFor(w: World): EngineData {
  return {
    ...packData(),
    events: w.events,
    requests: w.requests,
    pulse: w.pulse,
    answers: w.answers,
    drafts: w.drafts,
    consents: w.consents,
  };
}

export function runCase(input: Partial<World> = {}): Assessment {
  const w = world(input);
  return assess(w.employee, w.asOf, dataFor(w));
}

/** Codes only, sorted — the assertion every signal test makes. */
export function codes(a: Assessment): string[] {
  return [...new Set(a.signals.map((s) => s.code))].sort();
}

export function hasSignal(a: Assessment, code: string) {
  return a.signals.filter((s) => s.code === code);
}

export function request(
  employeeId: string,
  overrides: Partial<ServiceRequest> = {},
): ServiceRequest {
  return {
    id: `TREQ-${employeeId}-${Math.random().toString(36).slice(2, 6)}`,
    ref: `SR-T-${employeeId}`,
    employeeId,
    type: "it_kit",
    ownerGroup: "IT",
    assignee: "O-IT-1",
    status: "submitted",
    openedAt: daysAgo(1),
    slaHours: 24,
    reassignCount: 0,
    returnCount: 0,
    idempotencyKey: `tidk-${employeeId}`,
    ...overrides,
  } as ServiceRequest;
}

export function pulse(
  employeeId: string,
  score: number,
  createdAt: string,
  overrides: Partial<PulseResponse> = {},
): PulseResponse {
  return {
    id: `TPS-${employeeId}-${createdAt}`,
    employeeId,
    stage: "first_week",
    score,
    createdAt,
    consentId: "TCP-1",
    ...overrides,
  } as PulseResponse;
}

export function consent(
  employeeId: string,
  purpose: ConsentRecord["purpose"],
  granted: boolean,
  grantedAt = daysAgo(1),
): ConsentRecord {
  return {
    id: `TCP-${employeeId}-${purpose}-${granted ? "on" : "off"}`,
    employeeId,
    purpose,
    granted,
    grantedAt,
    version: "v1",
    textHash: `sha256:test-${purpose}`,
  };
}

export function answer(employeeId: string, overrides: Partial<AnswerRecord> = {}): AnswerRecord {
  return {
    id: `TANS-${employeeId}-${Math.random().toString(36).slice(2, 7)}`,
    employeeId,
    question: "test question",
    topicKey: "test:topic",
    intent: "policy",
    kind: "answer",
    groundingScore: 0.9,
    chunkIds: [],
    askedAt: hoursAgo(2),
    locale: "en",
    corpusVersion: "test",
    ...overrides,
  } as AnswerRecord;
}

export function draft(
  employeeId: string,
  overrides: Partial<IntakeDraftRecord> = {},
): IntakeDraftRecord {
  return {
    id: `TDR-${employeeId}-${Math.random().toString(36).slice(2, 7)}`,
    employeeId,
    type: "it_kit",
    status: "abandoned",
    startedAt: hoursAgo(6),
    abandonedAt: hoursAgo(5),
    ...overrides,
  } as IntakeDraftRecord;
}

export const MAP = { steps, stages, policies };
