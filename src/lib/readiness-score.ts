// Production Readiness Score — evidence-backed composite across seven axes.
// Deterministic and pure: given (html, validation, engineering summary), it
// returns weighted scores per axis plus concrete evidence pointers.

import type { ValidationReport } from "./validation";
import { buildGraph } from "./knowledge-graph";
import { scanAll } from "./scanners";
import type { EngineeringSummary } from "./chief-engineer";

export type Axis =
  | "reliability"
  | "accessibility"
  | "performance"
  | "maintainability"
  | "testing"
  | "architecture"
  | "technicalDebt";

export type AxisScore = {
  axis: Axis;
  score: number;              // 0–100
  weight: number;             // 0–1
  evidence: string[];         // human-readable, testable
};

export type ReadinessScore = {
  overall: number;            // weighted 0–100
  axes: AxisScore[];
  ready: boolean;             // overall ≥ 70 and no axis < 40
  createdAt: number;
};

const WEIGHTS: Record<Axis, number> = {
  reliability: 0.20,
  accessibility: 0.15,
  performance: 0.15,
  maintainability: 0.15,
  testing: 0.10,
  architecture: 0.15,
  technicalDebt: 0.10,
};

export function computeReadiness(input: {
  html: string;
  validation: ValidationReport;
  engineering?: EngineeringSummary;
  selfTestPassed?: number;
  selfTestFailed?: number;
}): ReadinessScore {
  const g = buildGraph(input.html);
  const scans = scanAll(input.html, g);

  const reliabilityEv: string[] = [];
  let reliability = 100;
  if (input.validation.status === "failed") { reliability -= 40; reliabilityEv.push("validation: failed"); }
  else if (input.validation.status === "warnings") { reliability -= 12; reliabilityEv.push("validation: warnings"); }
  else reliabilityEv.push("validation: passed");
  if (input.engineering?.blocked && !input.engineering.bypassed) {
    reliability -= 25; reliabilityEv.push(`chief: blocked by ${input.engineering.blockingRoles?.join(",") || "?"}`);
  }

  const perfEv = scans.performance.findings.slice(0, 3).map((f) => `perf: ${f.message}`);
  const a11yEv = scans.accessibility.findings.slice(0, 3).map((f) => `a11y: ${f.message}`);
  const secEv = scans.security.findings.slice(0, 3).map((f) => `sec: ${f.message}`);

  // Maintainability from doc size, script fragmentation, id duplication
  let maint = 100;
  if (g.size > 300_000) maint -= 25;
  else if (g.size > 120_000) maint -= 10;
  if (g.scripts.filter((s) => !s.src).length > 3) maint -= 8;
  if (g.ids.length - new Set(g.ids).size > 0) maint -= 12;
  const maintEv = [
    `doc size ${(g.size / 1024).toFixed(0)} KB`,
    `${g.scripts.length} scripts (${g.scripts.filter((s) => !s.src).length} inline)`,
    `${g.ids.length} ids (${g.ids.length - new Set(g.ids).size} duplicates)`,
  ];

  // Testing: derived from self-test totals when provided.
  const passed = input.selfTestPassed ?? 0;
  const failed = input.selfTestFailed ?? 0;
  const total = passed + failed;
  const testing = total === 0 ? 0 : Math.round((passed / total) * 100);
  const testingEv = total === 0
    ? ["no self-test totals supplied"]
    : [`self-tests ${passed}/${total} passing`, ...(failed > 0 ? [`${failed} failing`] : [])];

  // Architecture: reward well-formed meta + integrations vs script sprawl
  let arch = 100;
  if (!g.meta.hasViewport) arch -= 15;
  if (!g.meta.hasLang) arch -= 8;
  if (!g.meta.hasTitle) arch -= 10;
  if (g.scripts.length > 12) arch -= 10;
  const archEv = [
    `meta: viewport=${g.meta.hasViewport} lang=${g.meta.hasLang} title=${g.meta.hasTitle}`,
    `${g.integrations.length} integrations detected`,
  ];

  // Tech debt = detective + repair history
  let debt = scans.detective.score;
  const debtEv = scans.detective.findings.slice(0, 3).map((f) => `debt: ${f.message}`);
  if (input.engineering?.repairs && input.engineering.repairs > 0) {
    debt -= Math.min(20, input.engineering.repairs * 5);
    debtEv.push(`${input.engineering.repairs} repair pass(es)`);
  }

  const axes: AxisScore[] = [
    { axis: "reliability",    score: clamp(reliability), weight: WEIGHTS.reliability,    evidence: reliabilityEv.concat(secEv) },
    { axis: "accessibility",  score: scans.accessibility.score, weight: WEIGHTS.accessibility, evidence: a11yEv.length ? a11yEv : ["no a11y findings"] },
    { axis: "performance",    score: scans.performance.score,   weight: WEIGHTS.performance,   evidence: perfEv.length ? perfEv : ["no perf findings"] },
    { axis: "maintainability",score: clamp(maint), weight: WEIGHTS.maintainability, evidence: maintEv },
    { axis: "testing",        score: testing, weight: WEIGHTS.testing, evidence: testingEv },
    { axis: "architecture",   score: clamp(arch),  weight: WEIGHTS.architecture, evidence: archEv },
    { axis: "technicalDebt",  score: clamp(debt),  weight: WEIGHTS.technicalDebt, evidence: debtEv.length ? debtEv : ["no debt findings"] },
  ];

  const overall = Math.round(axes.reduce((sum, a) => sum + a.score * a.weight, 0));
  const ready = overall >= 70 && axes.every((a) => a.score >= 40);
  return { overall, axes, ready, createdAt: Date.now() };
}

function clamp(n: number) { return Math.max(0, Math.min(100, Math.round(n))); }
