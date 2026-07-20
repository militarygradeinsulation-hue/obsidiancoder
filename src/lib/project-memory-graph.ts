// Project Memory Graph — fuses the deterministic knowledge graph, version
// history, and Chief Engineer findings into a single queryable graph of
// nodes (components/routes/APIs/dependencies/versions/decisions) and edges
// (references / risks / rollback-points). Pure, no AI, no I/O.
//
// Consumed by the Architecture Map, Readiness Score, and Surgeon Mode.

import type { KnowledgeGraph } from "./knowledge-graph";
import { buildGraph } from "./knowledge-graph";
import type { VersionMetadata } from "./version-metadata";
import type { EngineeringSummary } from "./chief-engineer";

export type NodeKind =
  | "route"
  | "component"
  | "endpoint"
  | "dependency"
  | "integration"
  | "asset"
  | "script"
  | "version"
  | "decision";

export type EdgeKind =
  | "references"
  | "renders"
  | "calls"
  | "loads"
  | "risk"
  | "rollback";

export type GraphNode = {
  id: string;              // stable slug — kind:key
  kind: NodeKind;
  label: string;
  meta?: Record<string, string | number | boolean | undefined>;
  risk?: "low" | "medium" | "high" | "critical";
};

export type GraphEdge = {
  from: string;
  to: string;
  kind: EdgeKind;
  broken?: boolean;
  weight?: number;
};

export type MemoryGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  createdAt: number;
  fromVersionId?: string;
};

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 80);
const nid = (kind: NodeKind, key: string) => `${kind}:${slug(key) || "unknown"}`;

/**
 * Build a MemoryGraph from the current HTML + optional version history.
 * Deterministic: same inputs → identical output (safe for tests + diff).
 */
export function buildMemoryGraph(input: {
  html: string;
  versions?: readonly { id: string; label?: string; createdAt?: number; metadata?: VersionMetadata }[];
  currentVersionId?: string;
  graph?: KnowledgeGraph; // optional prebuilt to avoid re-parsing
}): MemoryGraph {
  const g = input.graph ?? buildGraph(input.html);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (n: GraphNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };

  // Root document
  add({ id: "route:/", kind: "route", label: "/", meta: { size: g.size, nodes: g.nodeCount } });

  // Endpoints (fetch/XHR targets)
  for (const e of g.endpoints) {
    const id = nid("endpoint", e);
    add({ id, kind: "endpoint", label: e });
    edges.push({ from: "route:/", to: id, kind: "calls" });
  }

  // Dependencies (from CDN URLs)
  for (const d of g.dependencies) {
    const id = nid("dependency", d);
    add({ id, kind: "dependency", label: d });
    edges.push({ from: "route:/", to: id, kind: "loads" });
  }

  // Integrations
  for (const i of g.integrations) {
    const id = nid("integration", i);
    add({ id, kind: "integration", label: i });
    edges.push({ from: "route:/", to: id, kind: "references" });
  }

  // Scripts (as component-ish nodes)
  for (const s of g.scripts) {
    if (!s.src) continue;
    const id = nid("script", s.src);
    add({ id, kind: "script", label: s.src, meta: { async: s.async, defer: s.defer } });
    edges.push({ from: "route:/", to: id, kind: "loads",
      broken: /^http:\/\//.test(s.src) || (!s.async && !s.defer) ? true : false });
  }

  // Images / assets — mark broken alt as risky
  for (const img of g.images) {
    const id = nid("asset", img.src);
    add({ id, kind: "asset", label: img.src, risk: img.alt === null ? "medium" : undefined });
    edges.push({ from: "route:/", to: id, kind: "references", broken: img.alt === null });
  }

  // Links — broken hrefs = risky edges
  for (const a of g.links) {
    if (!a.href) continue;
    const id = nid("route", a.href);
    add({ id, kind: "route", label: a.href });
    edges.push({ from: "route:/", to: id, kind: "references", broken: a.broken });
  }

  // Versions + rollback edges + decisions
  const versions = input.versions ?? [];
  for (let i = 0; i < versions.length; i++) {
    const v = versions[i];
    const id = nid("version", v.id);
    add({
      id, kind: "version",
      label: v.label ?? `v${versions.length - i}`,
      meta: { createdAt: v.createdAt, current: v.id === input.currentVersionId },
    });
    // Chain (newer → older) forms rollback path
    const next = versions[i + 1];
    if (next) edges.push({ from: id, to: nid("version", next.id), kind: "rollback" });

    // Decision node from Chief Engineer summary
    const eng = v.metadata?.engineering;
    if (eng) {
      const dId = nid("decision", `${v.id}-decision`);
      add({
        id: dId, kind: "decision",
        label: `readiness ${eng.readinessScore}`,
        risk: engRisk(eng),
        meta: { blocked: eng.blocked, bypassed: eng.bypassed, roles: (eng.blockingRoles ?? []).join(",") || undefined },
      });
      edges.push({ from: id, to: dId, kind: "references" });
      // Risk edges from decision back to the root
      if (eng.blocked) edges.push({ from: dId, to: "route:/", kind: "risk", weight: 3 });
    }
  }

  return { nodes, edges, createdAt: Date.now(), fromVersionId: input.currentVersionId };
}

function engRisk(e: EngineeringSummary): GraphNode["risk"] {
  if (e.blocked && !e.bypassed) return "critical";
  if (e.blocked) return "high";
  if (e.readinessScore < 60) return "medium";
  return "low";
}

/** Return the smallest set of nodes downstream of `nodeId` (BFS). */
export function reachableFrom(g: MemoryGraph, nodeId: string, maxDepth = 3): Set<string> {
  const out = new Set<string>([nodeId]);
  const q: [string, number][] = [[nodeId, 0]];
  const byFrom = new Map<string, GraphEdge[]>();
  for (const e of g.edges) {
    const arr = byFrom.get(e.from) ?? [];
    arr.push(e); byFrom.set(e.from, arr);
  }
  while (q.length) {
    const [id, d] = q.shift()!;
    if (d >= maxDepth) continue;
    for (const e of byFrom.get(id) ?? []) {
      if (out.has(e.to)) continue;
      out.add(e.to); q.push([e.to, d + 1]);
    }
  }
  return out;
}

/** Deterministic integrity check — used by tests + the Architecture Map. */
export function checkIntegrity(g: MemoryGraph): { ok: boolean; issues: string[] } {
  const ids = new Set(g.nodes.map((n) => n.id));
  const issues: string[] = [];
  const dupCount = g.nodes.length - ids.size;
  if (dupCount > 0) issues.push(`duplicate node ids: ${dupCount}`);
  for (const e of g.edges) {
    if (!ids.has(e.from)) issues.push(`dangling edge.from: ${e.from}`);
    if (!ids.has(e.to)) issues.push(`dangling edge.to: ${e.to}`);
  }
  return { ok: issues.length === 0, issues };
}
