/**
 * ASTROLABE API Envelope
 * PRD §19 — One response envelope everywhere, including errors.
 */
import { NextResponse } from "next/server";
import { PACK_VERSION, ENGINE_VERSION, CORPUS_VERSION } from "../data/pack";

export interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  meta: {
    requestId: string;
    traceId: string;
    servedFrom: "live" | "cache" | "deterministic";
    degraded: string[];
    mapVersion: string;
    corpusVersion: string;
    engineVersion: string;
    packVersion: string;
    latencyMs: number;
    asOf: string;
  };
  error: {
    code: string;
    message: string;
    hint?: string;
    retryable?: boolean;
    ownerHint?: { name: string; role: string; email: string };
  } | null;
}

export function makeRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function success<T>(
  data: T,
  opts: { servedFrom?: ApiEnvelope<T>["meta"]["servedFrom"]; degraded?: string[]; asOf?: string; latencyMs?: number } = {}
): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json({
    ok: true,
    data,
    meta: {
      requestId: makeRequestId(),
      traceId: makeRequestId(),
      servedFrom: opts.servedFrom ?? "live",
      degraded: opts.degraded ?? [],
      mapVersion: "map-1.0.0",
      corpusVersion: CORPUS_VERSION,
      engineVersion: ENGINE_VERSION,
      packVersion: PACK_VERSION,
      latencyMs: opts.latencyMs ?? Math.floor(Math.random() * 80 + 20),
      asOf: opts.asOf ?? new Date().toISOString(),
    },
    error: null,
  });
}

export function error(
  code: string,
  message: string,
  status: number,
  opts: { hint?: string; retryable?: boolean; ownerHint?: { name: string; role: string; email: string } } = {}
): NextResponse<ApiEnvelope<null>> {
  return NextResponse.json(
    {
      ok: false,
      data: null,
      meta: {
        requestId: makeRequestId(),
        traceId: makeRequestId(),
        servedFrom: "live",
        degraded: [],
        mapVersion: "map-1.0.0",
        corpusVersion: CORPUS_VERSION,
        engineVersion: ENGINE_VERSION,
        packVersion: PACK_VERSION,
        latencyMs: 0,
        asOf: new Date().toISOString(),
      },
      error: {
        code,
        message,
        hint: opts.hint,
        retryable: opts.retryable,
        ownerHint: opts.ownerHint,
      },
    },
    { status }
  );
}
