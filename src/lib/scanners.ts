// Deterministic scanners: security, accessibility, performance, detective.
// All pure functions over HTML + KnowledgeGraph. No AI, no network.

import type { KnowledgeGraph } from "./knowledge-graph";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Finding = {
  id: string;
  severity: Severity;
  message: string;
  where?: string;
  fix?: string;
};
export type ScanReport = {
  category: "security" | "accessibility" | "performance" | "detective";
  findings: Finding[];
  score: number; // 0-100, higher is better
};

function score(findings: Finding[]): number {
  let penalty = 0;
  for (const f of findings) {
    penalty += f.severity === "critical" ? 40
      : f.severity === "high" ? 18
      : f.severity === "medium" ? 8
      : f.severity === "low" ? 3 : 1;
  }
  return Math.max(0, Math.min(100, 100 - penalty));
}

// -------- Security --------
const SECRET_PATTERNS: [RegExp, string][] = [
  [/sk_(live|test)_[A-Za-z0-9]{16,}/g, "Stripe secret key"],
  [/AKIA[0-9A-Z]{16}/g, "AWS access key ID"],
  [/AIza[0-9A-Za-z_-]{20,}/g, "Google API key"],
  [/ghp_[A-Za-z0-9]{20,}/g, "GitHub personal token"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/g, "Slack token"],
  [/-----BEGIN (RSA |EC |DSA |OPENSSH |)PRIVATE KEY-----/g, "Private key material"],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, "JWT token"],
];

export function scanSecurity(html: string, g: KnowledgeGraph): ScanReport {
  const findings: Finding[] = [];
  for (const [rx, label] of SECRET_PATTERNS) {
    if (rx.test(html)) findings.push({ id: `secret-${label}`, severity: "critical", message: `Exposed secret in document: ${label}`, fix: "Move to server-side secret; never inline." });
  }
  if (/\beval\s*\(/.test(html)) findings.push({ id: "eval", severity: "high", message: "Uses eval() — arbitrary code execution risk.", fix: "Replace with explicit logic." });
  if (/document\.write\s*\(/.test(html)) findings.push({ id: "doc-write", severity: "medium", message: "Uses document.write — blocks parser, XSS risk." });
  for (const s of g.scripts) {
    if (s.src && /^http:\/\//.test(s.src)) findings.push({ id: `insecure-script-${s.src}`, severity: "high", message: `Script loaded over http:// — ${s.src}`, fix: "Use https://." });
  }
  for (const b of g.buttons) {
    // inline handlers in button attributes were captured in graph
    if (b.hasHandler) continue;
  }
  const inlineHandlers = (html.match(/\son(click|load|error|submit|mouseover)=/gi) || []).length;
  if (inlineHandlers > 4) findings.push({ id: "inline-handlers", severity: "low", message: `${inlineHandlers} inline event handlers — CSP unfriendly.` });
  return { category: "security", findings, score: score(findings) };
}

// -------- Accessibility --------
export function scanAccessibility(html: string, g: KnowledgeGraph): ScanReport {
  const findings: Finding[] = [];
  for (const img of g.images) {
    if (img.alt === null) findings.push({ id: `alt-${img.src.slice(0, 40)}`, severity: "high", message: `Image missing alt: ${img.src.slice(0, 60)}`, fix: `Add alt="" (decorative) or descriptive text.` });
  }
  for (const b of g.buttons) {
    if (!b.text) findings.push({ id: `btn-name-${b.id ?? "?"}`, severity: "high", message: `Button has no accessible name${b.id ? ` (id=${b.id})` : ""}`, fix: "Add visible text or aria-label." });
  }
  for (const a of g.links) {
    if (!a.text && !a.broken) findings.push({ id: `link-name-${a.href.slice(0, 40)}`, severity: "medium", message: `Link has no accessible name → ${a.href}` });
  }
  if (!g.meta.hasLang) findings.push({ id: "lang", severity: "medium", message: "<html> missing lang attribute.", fix: `Add lang="en".` });
  if (!g.meta.hasTitle) findings.push({ id: "title", severity: "medium", message: "Document missing <title>." });
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  if (h1Count === 0) findings.push({ id: "no-h1", severity: "medium", message: "No <h1> in document." });
  if (h1Count > 1) findings.push({ id: "multi-h1", severity: "low", message: `${h1Count} <h1> elements — use one.` });
  const seen = new Set<string>();
  for (const id of g.ids) {
    if (seen.has(id)) findings.push({ id: `dup-${id}`, severity: "high", message: `Duplicate id: ${id}` });
    seen.add(id);
  }
  const dupIds = g.ids.length - new Set(g.ids).size;
  if (dupIds > 0 && !findings.some((f) => f.id.startsWith("dup-"))) findings.push({ id: "dup-ids", severity: "high", message: `${dupIds} duplicate id(s) detected.` });
  return { category: "accessibility", findings, score: score(findings) };
}

// -------- Performance --------
export function scanPerformance(html: string, g: KnowledgeGraph): ScanReport {
  const findings: Finding[] = [];
  if (g.size > 500_000) findings.push({ id: "size", severity: "high", message: `Document size ${(g.size / 1024).toFixed(0)} KB — over 500 KB.` });
  else if (g.size > 200_000) findings.push({ id: "size-warn", severity: "medium", message: `Document size ${(g.size / 1024).toFixed(0)} KB.` });
  if (g.nodeCount > 1500) findings.push({ id: "nodes", severity: "medium", message: `${g.nodeCount} DOM nodes — excessive.` });
  const dataUrlImgs = g.images.filter((i) => i.src.startsWith("data:")).length;
  if (dataUrlImgs > 3) findings.push({ id: "data-imgs", severity: "medium", message: `${dataUrlImgs} data-URL images — inflates document.`, fix: "Host separately." });
  const eagerImgs = g.images.filter((i) => !/loading=["']lazy["']/.test(html.slice(html.indexOf(i.src) - 200, html.indexOf(i.src) + 20))).length;
  if (g.images.length > 3 && eagerImgs > 0) findings.push({ id: "lazy", severity: "low", message: `${eagerImgs} image(s) not lazy-loaded.`, fix: `Add loading="lazy".` });
  const blockingScripts = g.scripts.filter((s) => s.src && !s.async && !s.defer).length;
  if (blockingScripts > 2) findings.push({ id: "blocking-scripts", severity: "medium", message: `${blockingScripts} blocking <script src>.`, fix: "Add defer or async." });
  if (!g.meta.hasViewport) findings.push({ id: "viewport", severity: "high", message: "Missing responsive viewport meta.", fix: `Add <meta name="viewport" content="width=device-width,initial-scale=1">.` });
  return { category: "performance", findings, score: score(findings) };
}

// -------- Detective --------
export function scanDetective(html: string, g: KnowledgeGraph): ScanReport {
  const findings: Finding[] = [];
  const deadButtons = g.buttons.filter((b) => !b.hasHandler && !/submit|reset/i.test(b.text)).length;
  if (deadButtons > 0) findings.push({ id: "dead-buttons", severity: "medium", message: `${deadButtons} button(s) with no handler or form action.`, fix: "Attach handler or convert to <a>." });
  const brokenLinks = g.links.filter((l) => l.broken).length;
  if (brokenLinks > 0) findings.push({ id: "broken-links", severity: "medium", message: `${brokenLinks} link(s) with empty or "#" href.` });
  const ctas = g.buttons.concat(g.links.map((l) => ({ id: undefined, text: l.text, hasHandler: !l.broken })));
  const primaryCtas = ctas.filter((c) => /sign up|get started|buy|subscribe|book|contact/i.test(c.text));
  if (primaryCtas.length > 4) findings.push({ id: "cta-crowd", severity: "low", message: `${primaryCtas.length} primary CTAs — consider consolidating.` });
  const styleBlocks = (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) || []);
  if (styleBlocks.length > 3) findings.push({ id: "style-frag", severity: "low", message: `${styleBlocks.length} <style> blocks — consider merging.` });
  if (!g.meta.hasDescription) findings.push({ id: "no-desc", severity: "low", message: "No meta description — hurts sharing and SEO." });
  const trustSignals = /testimonial|review|trusted by|as seen in|guarantee/i.test(html);
  if (g.size > 20_000 && !trustSignals) findings.push({ id: "trust", severity: "info", message: "No visible trust signals (testimonials, guarantees)." });
  return { category: "detective", findings, score: score(findings) };
}

export function scanAll(html: string, g: KnowledgeGraph) {
  return {
    security: scanSecurity(html, g),
    accessibility: scanAccessibility(html, g),
    performance: scanPerformance(html, g),
    detective: scanDetective(html, g),
  };
}
