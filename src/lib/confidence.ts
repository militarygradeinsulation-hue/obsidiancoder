// Evidence-based build confidence score. Only real signals — never model self-report.

import type { ValidationReport } from "./validation";
import type { ScanReport } from "./scanners";

export type ConfidenceInput = {
  validation?: ValidationReport;
  security?: ScanReport;
  accessibility?: ScanReport;
  performance?: ScanReport;
  detective?: ScanReport;
  runtimeErrors?: number;
  selfTestsPassed?: number;
  selfTestsTotal?: number;
};

export type ConfidenceEvidence = { label: string; weight: number; score: number; note: string };
export type ConfidenceReport = { score: number; grade: "A" | "B" | "C" | "D" | "F"; evidence: ConfidenceEvidence[] };

function grade(s: number): ConfidenceReport["grade"] {
  return s >= 90 ? "A" : s >= 75 ? "B" : s >= 60 ? "C" : s >= 45 ? "D" : "F";
}

export function computeConfidence(input: ConfidenceInput): ConfidenceReport {
  const ev: ConfidenceEvidence[] = [];

  if (input.validation) {
    const s = input.validation.status === "passed" ? 100 : input.validation.status === "warnings" ? 70 : 20;
    ev.push({ label: "Validation", weight: 0.25, score: s, note: `${input.validation.status} — ${input.validation.issues.length} issue(s)` });
  }
  if (input.security) ev.push({ label: "Security", weight: 0.2, score: input.security.score, note: `${input.security.findings.length} finding(s)` });
  if (input.accessibility) ev.push({ label: "Accessibility", weight: 0.15, score: input.accessibility.score, note: `${input.accessibility.findings.length} issue(s)` });
  if (input.performance) ev.push({ label: "Performance", weight: 0.15, score: input.performance.score, note: `${input.performance.findings.length} issue(s)` });
  if (input.detective) ev.push({ label: "Detective", weight: 0.1, score: input.detective.score, note: `${input.detective.findings.length} finding(s)` });
  if (typeof input.runtimeErrors === "number") {
    const s = input.runtimeErrors === 0 ? 100 : Math.max(0, 100 - input.runtimeErrors * 20);
    ev.push({ label: "Runtime", weight: 0.1, score: s, note: `${input.runtimeErrors} error(s) captured` });
  }
  if (input.selfTestsTotal) {
    const ratio = (input.selfTestsPassed ?? 0) / input.selfTestsTotal;
    ev.push({ label: "Self-tests", weight: 0.05, score: Math.round(ratio * 100), note: `${input.selfTestsPassed}/${input.selfTestsTotal}` });
  }

  const totalWeight = ev.reduce((a, e) => a + e.weight, 0) || 1;
  const score = Math.round(ev.reduce((a, e) => a + e.score * e.weight, 0) / totalWeight);
  return { score, grade: grade(score), evidence: ev };
}
