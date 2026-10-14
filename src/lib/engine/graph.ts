/**
 * Journey map graph utilities (PRD §10 dependency graph, §29 group 01).
 *
 * The map is a DAG over `dependsOn`. A cycle is a configuration error: it must
 * fail loudly with the offending path rather than recurse into a stack overflow
 * (PRD §23 edge case 8). Every consumer resolves blockers through this module so
 * "what is this waiting on" has exactly one answer.
 */

import type { JourneyStep, PolicyChunk } from "../data/pack";

export interface JourneyGraph {
  steps: Map<string, JourneyStep>;
  /** stepKey → every transitive descendant. */
  downstream: Map<string, string[]>;
  /** stepKey → every transitive ancestor. */
  upstream: Map<string, string[]>;
  /** Dependency cycles found while building, as readable paths. */
  cycles: string[][];
  /** Steps nothing else depends on and which have no entry condition reached. */
  unreachable: string[];
}

export interface MapLint {
  duplicateStepKeys: string[];
  unknownDependencies: { stepKey: string; dependsOn: string }[];
  missingTarget: string[];
  missingActor: string[];
  unresolvedPolicyRefs: { stepKey: string; ref: string }[];
  cycles: string[][];
  unreachable: string[];
}

/**
 * Transitive closure by iterative DFS with a memo. Cycle-safe: a node on the
 * current path is recorded as a cycle and its edge contributes nothing.
 */
export function buildGraph(steps: JourneyStep[]): JourneyGraph {
  const byKey = new Map<string, JourneyStep>();
  for (const s of steps) {
    if (!byKey.has(s.key)) byKey.set(s.key, s);
  }

  const downstream = new Map<string, string[]>();
  const upstream = new Map<string, string[]>();
  const cycles: string[][] = [];

  const descendantsOf = (start: string): string[] => {
    const out: string[] = [];
    const stack = [start];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const cur = stack.pop() as string;
      for (const s of byKey.values()) {
        if (s.dependsOn.includes(cur) && !seen.has(s.key)) {
          seen.add(s.key);
          out.push(s.key);
          stack.push(s.key);
        }
      }
    }
    return out;
  };

  const ancestorsOf = (start: string): string[] => {
    const out: string[] = [];
    const stack = [start];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const cur = stack.pop() as string;
      const step = byKey.get(cur);
      if (!step) continue;
      for (const dep of step.dependsOn) {
        if (dep === start) {
          cycles.push([start, ...out, dep]);
          continue;
        }
        if (seen.has(dep)) continue;
        seen.add(dep);
        out.push(dep);
        stack.push(dep);
      }
    }
    return out;
  };

  for (const key of byKey.keys()) {
    downstream.set(key, descendantsOf(key));
    upstream.set(key, ancestorsOf(key));
  }

  // A step is unreachable when it has a dependency that does not exist in the map
  // and it is not itself an entry step (no dependencies).
  const unreachable: string[] = [];
  for (const s of byKey.values()) {
    if (s.dependsOn.length === 0) continue;
    const allResolvable = s.dependsOn.every((d) => byKey.has(d));
    if (!allResolvable) unreachable.push(s.key);
  }

  return { steps: byKey, downstream, upstream, cycles, unreachable };
}

export function assertAcyclic(graph: JourneyGraph): void {
  if (graph.cycles.length > 0) {
    throw new Error(
      `Journey map has ${graph.cycles.length} dependency cycle(s): ${graph.cycles
        .map((c) => c.join(" -> "))
        .join(" | ")}`,
    );
  }
}

/**
 * The steps that actually hold this one up: direct dependencies that are neither
 * done nor skipped. A root blocker is a blocker that is itself unblocked — that
 * is the step the employee is told about (PRD §5-049).
 */
export function rootBlockers(
  stepKey: string,
  graph: JourneyGraph,
  isOpen: (key: string) => boolean,
): { key: string; chainLength: number }[] {
  const step = graph.steps.get(stepKey);
  if (!step) return [];
  const open = step.dependsOn.filter(isOpen);
  if (open.length === 0) return [];

  const roots: { key: string; chainLength: number }[] = [];
  const visit = (key: string, depth: number, path: Set<string>) => {
    const s = graph.steps.get(key);
    if (!s) {
      roots.push({ key, chainLength: depth });
      return;
    }
    const nextOpen = s.dependsOn.filter(isOpen).filter((d) => !path.has(d));
    if (nextOpen.length === 0) {
      roots.push({ key, chainLength: depth });
      return;
    }
    for (const n of nextOpen) visit(n, depth + 1, new Set([...path, key, n]));
  };
  for (const o of open) visit(o, 1, new Set([stepKey]));

  return roots.sort((a, b) => a.key.localeCompare(b.key));
}

/** Lint the map the way CI must (PRD §29 003-007, 015, 366). */
export function lintMap(steps: JourneyStep[], policies: PolicyChunk[]): MapLint {
  const seen = new Set<string>();
  const duplicateStepKeys: string[] = [];
  for (const s of steps) {
    if (seen.has(s.key)) duplicateStepKeys.push(s.key);
    seen.add(s.key);
  }

  const unknownDependencies: { stepKey: string; dependsOn: string }[] = [];
  const missingTarget: string[] = [];
  const missingActor: string[] = [];
  const unresolvedPolicyRefs: { stepKey: string; ref: string }[] = [];
  const slugs = new Set(policies.map((p) => p.docSlug));

  for (const s of steps) {
    for (const d of s.dependsOn)
      if (!seen.has(d)) unknownDependencies.push({ stepKey: s.key, dependsOn: d });
    if (!s.targetHours || s.targetHours <= 0) missingTarget.push(s.key);
    if (!s.actor) missingActor.push(s.key);
    for (const ref of s.policyRefs) {
      const slug = ref.split("#")[0];
      if (!slugs.has(slug)) unresolvedPolicyRefs.push({ stepKey: s.key, ref });
    }
  }

  const graph = buildGraph(steps);
  return {
    duplicateStepKeys,
    unknownDependencies,
    missingTarget,
    missingActor,
    unresolvedPolicyRefs,
    cycles: graph.cycles,
    unreachable: graph.unreachable,
  };
}

export function snapshotMap(steps: JourneyStep[]): string {
  return JSON.stringify(
    [...steps]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((s) => ({
        key: s.key,
        stage: s.stage,
        journeyType: s.journeyType,
        ownerGroup: s.ownerGroup,
        actor: s.actor,
        targetHours: s.targetHours,
        dependsOn: [...s.dependsOn].sort(),
        policyRefs: [...s.policyRefs].sort(),
        requestType: s.requestType ?? null,
      })),
    null,
    2,
  );
}

/** Added / removed / retimed / re-owned steps between two map snapshots. */
export function diffMaps(before: JourneyStep[], after: JourneyStep[]) {
  const b = new Map(before.map((s) => [s.key, s]));
  const a = new Map(after.map((s) => [s.key, s]));
  const added = [...a.keys()].filter((k) => !b.has(k));
  const removed = [...b.keys()].filter((k) => !a.has(k));
  const retimed: { key: string; from: number; to: number }[] = [];
  const reowned: { key: string; from: string; to: string }[] = [];
  for (const [k, s] of a) {
    const old = b.get(k);
    if (!old) continue;
    if (old.targetHours !== s.targetHours)
      retimed.push({ key: k, from: old.targetHours, to: s.targetHours });
    if (old.ownerGroup !== s.ownerGroup)
      reowned.push({ key: k, from: old.ownerGroup, to: s.ownerGroup });
  }
  return { added, removed, retimed, reowned };
}
