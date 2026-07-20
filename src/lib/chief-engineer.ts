// Chief Engineer — multi-agent orchestration layer.
//
// Pure module. No React, no network. Given a plan + candidate HTML (and the
// previous stable HTML for diff context), each specialized agent inspects the
// build and emits structured findings. The Architect then reconciles those
// findings, resolves conflicts, computes a production-readiness score, and
// decides whether the build is safe to commit.
//
// The intent is real orchestration — every finding maps to a deterministic
// signal on the document. No decorative or fabricated agent output.

import type { Plan } from "./orchestrator";
import type { ValidationReport } from "./validation";
import { buildGraph, type KnowledgeGraph } from "./knowledge-graph";
import { scanAll, type Finding, type Severity } from "./scanners";
import { diffSummary } from "./diff-summary";

export type AgentRole =
  | "architect"
  | "frontend"
  | "backend"
  | "ux"
  | "qa"
  | "security"
  | "performance"
  | "accessibility"
  | "product";

export const AGENT_ROLES: AgentRole[] = [
  "architect",
  "frontend",
  "backend",
  "ux",
  "qa",
  "security",
  "performance",
  "accessibility",
  "product",
];

export const AGENT_LABEL: Record<AgentRole, string> = {
  architect: "Architect",
  frontend: "Frontend Engineer",
  backend: "Backend Engineer",
  ux: "UX Designer",
  qa: "QA Engineer",
  security: "Security Engineer",
  performance: "Performance Engineer",
  accessibility: "Accessibility Engineer",
  product: "Product Manager",
};

export type AgentApproval = "approve" | "warn" | "block";

export type AgentReview = {
  role: AgentRole;
  label: string;
  approval: AgentApproval;
  score: number;                // 0..100
  summary: string;              // one-line reasoning
  findings: Finding[];
  recommendations: string[];
  filesInfluenced: string[];    // e.g. ["preview.html", "styles(inline)"]
  durationMs: number;
};

export type EngineeringReport = {
  ok: boolean;                  // true when commit is allowed
  blocked: boolean;
  bypassed: boolean;            // true when caller forced bypass despite blockers
  readinessScore: number;       // 0..100 weighted composite
  risks: string[];
  tradeoffs: string[];
  reviews: AgentReview[];
  blockingRoles: AgentRole[];
  approvals: { role: AgentRole; approval: AgentApproval }[];
  summary: string;
  createdAt: number;
  durationMs: number;
};

export type ReviewInput = {
  request: string;
  previousHtml: string;
  candidateHtml: string;
  plan: Plan;
  validation: ValidationReport;
  bypass?: boolean;             // caller override: allow even if blocked
  onAgent?: (r: AgentReview) => void; // live progress callback
};

// ---------- Utility ----------

function approvalFromFindings(findings: Finding[]): { approval: AgentApproval; score: number } {
  let penalty = 0;
  let blocking = false;
  for (const f of findings) {
    if (f.severity === "critical") { penalty += 40; blocking = true; }
    else if (f.severity === "high") { penalty += 18; }
    else if (f.severity === "medium") { penalty += 8; }
    else if (f.severity === "low") { penalty += 3; }
    else penalty += 1;
  }
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const approval: AgentApproval = blocking ? "block" : score < 70 ? "warn" : "approve";
  return { approval, score };
}

function mkFinding(id: string, severity: Severity, message: string, fix?: string): Finding {
  return { id, severity, message, fix };
}

// ---------- Individual agents ----------

function reviewFrontend(g: KnowledgeGraph, html: string): { findings: Finding[]; files: string[]; recs: string[] } {
  const findings: Finding[] = [];
  const recs: string[] = [];
  if (!g.meta.hasViewport) findings.push(mkFinding("no-viewport", "high", "Missing responsive viewport meta.", "Add <meta name=\"viewport\">"));
  const inlineStyles = (html.match(/style="/g) || []).length;
  if (inlineStyles > 40) { findings.push(mkFinding("inline-style-sprawl", "low", `${inlineStyles} inline style attributes.`)); recs.push("Consolidate inline styles into a <style> block or utility classes."); }
  const styleBlocks = (html.match(/<style\b/gi) || []).length;
  if (styleBlocks > 3) recs.push("Merge multiple <style> blocks for cleaner cascade.");
  if (g.scripts.filter((s) => s.inline).length > 4) findings.push(mkFinding("inline-script-sprawl", "low", "Many inline <script> blocks — hurts CSP + caching."));
  return { findings, files: ["preview.html"], recs };
}

function reviewBackend(g: KnowledgeGraph): { findings: Finding[]; files: string[]; recs: string[] } {
  const findings: Finding[] = [];
  const recs: string[] = [];
  for (const ep of g.endpoints) {
    if (/^http:\/\//i.test(ep)) findings.push(mkFinding(`insecure-endpoint-${ep}`, "high", `Endpoint uses http:// — ${ep}`, "Switch to https://"));
  }
  for (const ref of g.envRefs) {
    if (/API_KEY|SECRET|TOKEN|PRIVATE/i.test(ref)) findings.push(mkFinding(`env-in-doc-${ref}`, "critical", `Secret-like env reference embedded in document: ${ref}`, "Move to a server-only handler."));
  }
  if (g.integrations.length > 0 && g.endpoints.length === 0) recs.push(`Integrations referenced (${g.integrations.join(", ")}) with no backend endpoints — verify data flow.`);
  return { findings, files: g.endpoints.length ? ["preview.html", "endpoints(inline)"] : ["preview.html"], recs };
}

function reviewUx(g: KnowledgeGraph, html: string): { findings: Finding[]; files: string[]; recs: string[] } {
  const findings: Finding[] = [];
  const recs: string[] = [];
  const primaryCtas = g.buttons.filter((b) => /sign up|get started|buy|subscribe|book|contact|start/i.test(b.text));
  if (g.size > 15000 && primaryCtas.length === 0) findings.push(mkFinding("no-primary-cta", "medium", "No obvious primary CTA in a substantial page.", "Add a clear call-to-action button."));
  if (primaryCtas.length > 4) findings.push(mkFinding("cta-crowd", "low", `${primaryCtas.length} primary CTAs compete for attention.`));
  const headings = (html.match(/<h[1-6]\b/gi) || []).length;
  if (g.size > 8000 && headings < 2) recs.push("Add section headings to guide the reader through the page.");
  return { findings, files: ["preview.html"], recs };
}

function reviewProduct(input: ReviewInput, g: KnowledgeGraph): { findings: Finding[]; files: string[]; recs: string[] } {
  const findings: Finding[] = [];
  const recs: string[] = [];
  const req = input.request.toLowerCase();
  const doc = input.candidateHtml.toLowerCase();
  // Simple intent-coverage heuristic: highlighted nouns from request must appear.
  const nouns = req.match(/[a-z][a-z-]{3,}/g) || [];
  const uniq = Array.from(new Set(nouns)).slice(0, 12);
  const missing = uniq.filter((w) => !STOPWORDS.has(w) && !doc.includes(w));
  if (uniq.length && missing.length > uniq.length * 0.75) {
    findings.push(mkFinding("intent-coverage-low", "medium", `Only ${uniq.length - missing.length}/${uniq.length} request terms appear in the build.`, "Confirm the build matches the user's stated intent."));
  }
  if (!g.meta.hasTitle) recs.push("Set a descriptive <title> for shareability.");
  if (!g.meta.hasDescription) recs.push("Add a meta description for social previews.");
  return { findings, files: ["preview.html"], recs };
}

const STOPWORDS = new Set(["this", "that", "with", "make", "build", "please", "have", "want", "just", "like", "into", "from", "your", "them", "when", "then", "will", "some", "very", "also", "need", "should", "would", "could"]);

// ---------- Public API ----------

export function reviewBuild(input: ReviewInput): EngineeringReport {
  const t0 = Date.now();
  const g = buildGraph(input.candidateHtml);
  const scans = scanAll(input.candidateHtml, g);
  const diff = diffSummary(input.previousHtml, input.candidateHtml);
  const reviews: AgentReview[] = [];

  const emit = (r: AgentReview) => { reviews.push(r); input.onAgent?.(r); };

  // --- QA ---
  {
    const t = Date.now();
    const qaFindings: Finding[] = [];
    if (input.validation.status === "failed") qaFindings.push(mkFinding("validation-failed", "critical", `Document validation failed: ${input.validation.summary}`));
    if (input.validation.status === "warnings") {
      for (const i of input.validation.issues.filter((x) => x.severity === "warning").slice(0, 5)) {
        qaFindings.push(mkFinding(`vw-${i.message.slice(0, 12)}`, "medium", i.message));
      }
    }
    if (!input.candidateHtml.trim()) qaFindings.push(mkFinding("empty-doc", "critical", "Candidate HTML is empty."));
    const a = approvalFromFindings(qaFindings);
    emit({ role: "qa", label: AGENT_LABEL.qa, approval: a.approval, score: a.score,
      summary: input.validation.status === "passed" ? "Document validates cleanly." : `Validation: ${input.validation.status}`,
      findings: qaFindings, recommendations: qaFindings.length ? ["Re-run validator after fixes."] : [],
      filesInfluenced: ["preview.html"], durationMs: Date.now() - t });
  }

  // --- Security ---
  {
    const t = Date.now();
    const s = scans.security;
    const a = approvalFromFindings(s.findings);
    emit({ role: "security", label: AGENT_LABEL.security, approval: a.approval, score: s.score,
      summary: s.findings.length ? `${s.findings.length} security finding(s)` : "No security issues detected.",
      findings: s.findings, recommendations: s.findings.slice(0, 3).map((f) => f.fix ?? f.message),
      filesInfluenced: ["preview.html"], durationMs: Date.now() - t });
  }

  // --- Performance ---
  {
    const t = Date.now();
    const s = scans.performance;
    const a = approvalFromFindings(s.findings);
    emit({ role: "performance", label: AGENT_LABEL.performance, approval: a.approval, score: s.score,
      summary: `Document ${(g.size / 1024).toFixed(0)}KB · ${g.nodeCount} nodes`,
      findings: s.findings, recommendations: s.findings.slice(0, 3).map((f) => f.fix ?? f.message),
      filesInfluenced: ["preview.html"], durationMs: Date.now() - t });
  }

  // --- Accessibility ---
  {
    const t = Date.now();
    const s = scans.accessibility;
    const a = approvalFromFindings(s.findings);
    emit({ role: "accessibility", label: AGENT_LABEL.accessibility, approval: a.approval, score: s.score,
      summary: s.findings.length ? `${s.findings.length} a11y finding(s)` : "Accessibility looks clean.",
      findings: s.findings, recommendations: s.findings.slice(0, 3).map((f) => f.fix ?? f.message),
      filesInfluenced: ["preview.html"], durationMs: Date.now() - t });
  }

  // --- Frontend ---
  {
    const t = Date.now();
    const r = reviewFrontend(g, input.candidateHtml);
    const a = approvalFromFindings(r.findings);
    emit({ role: "frontend", label: AGENT_LABEL.frontend, approval: a.approval, score: a.score,
      summary: `+${diff.charsAdded} / -${diff.charsRemoved} chars · ${g.nodeCount} nodes`,
      findings: r.findings, recommendations: r.recs, filesInfluenced: r.files, durationMs: Date.now() - t });
  }

  // --- Backend ---
  {
    const t = Date.now();
    const r = reviewBackend(g);
    const a = approvalFromFindings(r.findings);
    emit({ role: "backend", label: AGENT_LABEL.backend, approval: a.approval, score: a.score,
      summary: g.endpoints.length ? `${g.endpoints.length} endpoint(s) referenced` : "No backend endpoints referenced.",
      findings: r.findings, recommendations: r.recs, filesInfluenced: r.files, durationMs: Date.now() - t });
  }

  // --- UX ---
  {
    const t = Date.now();
    const r = reviewUx(g, input.candidateHtml);
    const a = approvalFromFindings(r.findings);
    emit({ role: "ux", label: AGENT_LABEL.ux, approval: a.approval, score: a.score,
      summary: `${g.buttons.length} button(s), ${g.links.length} link(s)`,
      findings: r.findings, recommendations: r.recs, filesInfluenced: r.files, durationMs: Date.now() - t });
  }

  // --- Product ---
  {
    const t = Date.now();
    const r = reviewProduct(input, g);
    const a = approvalFromFindings(r.findings);
    emit({ role: "product", label: AGENT_LABEL.product, approval: a.approval, score: a.score,
      summary: `Intent: "${input.request.slice(0, 60)}${input.request.length > 60 ? "…" : ""}"`,
      findings: r.findings, recommendations: r.recs, filesInfluenced: r.files, durationMs: Date.now() - t });
  }

  // --- Architect: reconcile ---
  const architectT = Date.now();
  const blockingRoles = reviews.filter((r) => r.approval === "block").map((r) => r.role);
  const warnRoles = reviews.filter((r) => r.approval === "warn").map((r) => r.role);
  const risks: string[] = [];
  const tradeoffs: string[] = [];

  for (const r of reviews) {
    for (const f of r.findings) {
      if (f.severity === "critical" || f.severity === "high") {
        risks.push(`[${AGENT_LABEL[r.role]}] ${f.message}`);
      }
    }
  }
  // conflict resolution: perf vs UX (e.g. many images vs visual richness)
  const perf = reviews.find((r) => r.role === "performance");
  const ux = reviews.find((r) => r.role === "ux");
  if (perf && ux && perf.score < 80 && ux.findings.some((f) => f.id === "no-primary-cta")) {
    tradeoffs.push("Performance suggests trimming assets while UX asks for a clearer CTA — Architect keeps CTA, prioritizes asset trim.");
  }
  if (blockingRoles.includes("security")) tradeoffs.push("Security block overrides all other approvals.");

  // Weighted composite readiness score
  const weights: Record<AgentRole, number> = {
    architect: 0, // architect summarizes, doesn't self-score
    qa: 1.4, security: 1.6, performance: 1.1, accessibility: 1.0,
    frontend: 0.9, backend: 0.9, ux: 0.8, product: 1.0,
  };
  let wsum = 0, tot = 0;
  for (const r of reviews) { const w = weights[r.role]; wsum += w * r.score; tot += w; }
  const readinessScore = tot ? Math.round(wsum / tot) : 0;

  const architectBlocking = blockingRoles.length > 0;
  const architectApproval: AgentApproval = architectBlocking ? "block" : warnRoles.length >= 3 ? "warn" : "approve";
  const architectSummary = architectBlocking
    ? `Blocked by ${blockingRoles.map((r) => AGENT_LABEL[r]).join(", ")}.`
    : warnRoles.length
    ? `Approved with ${warnRoles.length} advisory warning(s).`
    : `All agents approve. Readiness ${readinessScore}/100.`;

  const architectReview: AgentReview = {
    role: "architect", label: AGENT_LABEL.architect,
    approval: architectApproval, score: readinessScore,
    summary: architectSummary,
    findings: [],
    recommendations: tradeoffs,
    filesInfluenced: Array.from(new Set(reviews.flatMap((r) => r.filesInfluenced))),
    durationMs: Date.now() - architectT,
  };
  reviews.unshift(architectReview);
  input.onAgent?.(architectReview);

  const bypassed = !!input.bypass && architectBlocking;
  const ok = !architectBlocking || bypassed;

  return {
    ok,
    blocked: architectBlocking,
    bypassed,
    readinessScore,
    risks: Array.from(new Set(risks)).slice(0, 10),
    tradeoffs,
    reviews,
    blockingRoles,
    approvals: reviews.map((r) => ({ role: r.role, approval: r.approval })),
    summary: architectSummary,
    createdAt: Date.now(),
    durationMs: Date.now() - t0,
  };
}

/** Compact serializable form to attach to VersionMetadata. */
export type EngineeringSummary = {
  readinessScore: number;
  blocked: boolean;
  bypassed: boolean;
  blockingRoles: AgentRole[];
  approvals: { role: AgentRole; approval: AgentApproval; score: number }[];
  risks: string[];
  tradeoffs: string[];
  summary: string;
};

export function summarizeReport(r: EngineeringReport): EngineeringSummary {
  return {
    readinessScore: r.readinessScore,
    blocked: r.blocked,
    bypassed: r.bypassed,
    blockingRoles: r.blockingRoles,
    approvals: r.reviews.map((rv) => ({ role: rv.role, approval: rv.approval, score: rv.score })),
    risks: r.risks,
    tradeoffs: r.tradeoffs,
    summary: r.summary,
  };
}
