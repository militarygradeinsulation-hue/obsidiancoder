/**
 * Component registry — extract and store reusable UI patterns from built HTML.
 *
 * How it works:
 * 1. After a successful build, extractComponents() scans the HTML for
 *    recognisable component patterns (navbars, cards, forms, buttons...).
 * 2. The extracted components are stored client-side (localStorage) keyed by
 *    a stable hash of the component's markup.
 * 3. On the next fresh generation, matchComponents() returns the top N most
 *    relevant components for the current prompt, which are injected as
 *    "REUSABLE PATTERNS" in the system message.
 *
 * Everything is deterministic and local — no AI, no network.
 *
 * Design constraints:
 * - Max 20 stored components (evict oldest when full)
 * - Max 4 KB per component (trimmed if larger)
 * - Soft-matched to prompts by keyword overlap
 */

export interface StoredComponent {
  id: string;           // stable hash of trimmed markup
  label: string;        // human-readable name derived from element type / class
  kind: ComponentKind;
  markup: string;       // trimmed HTML (max 4 KB)
  keywords: string[];   // extracted from class names and attributes
  usageCount: number;
  createdAt: number;
  lastUsedAt: number;
}

export type ComponentKind =
  | "navbar"
  | "hero"
  | "card"
  | "form"
  | "button"
  | "table"
  | "modal"
  | "footer"
  | "pricing-card"
  | "testimonial"
  | "feature-grid"
  | "other";

// ── Extraction patterns ──────────────────────────────────────────────────────
interface ExtractionRule {
  kind: ComponentKind;
  /** Matches against the opening tag + first 200 chars of the element */
  rx: RegExp;
  /** Closing tag (for non-void elements) */
  endTag: RegExp;
  label: string;
  maxCount: number; // max per build
}

const EXTRACTION_RULES: ExtractionRule[] = [
  {
    kind: "navbar", label: "Navigation bar",
    rx: /<(nav|header)\b[^>]*>/i,
    endTag: /<\/(nav|header)>/i,
    maxCount: 1,
  },
  {
    kind: "hero", label: "Hero section",
    rx: /<(section|div)\b[^>]*\b(hero|splash|jumbotron|banner)\b[^>]*>/i,
    endTag: /<\/(section|div)>/i,
    maxCount: 1,
  },
  {
    kind: "pricing-card", label: "Pricing card",
    rx: /<(div|article)\b[^>]*\b(pricing|plan|tier)\b[^>]*>/i,
    endTag: /<\/(div|article)>/i,
    maxCount: 2,
  },
  {
    kind: "card", label: "Card",
    rx: /<(div|article)\b[^>]*\bcard\b[^>]*>/i,
    endTag: /<\/(div|article)>/i,
    maxCount: 3,
  },
  {
    kind: "form", label: "Form",
    rx: /<form\b[^>]*>/i,
    endTag: /<\/form>/i,
    maxCount: 2,
  },
  {
    kind: "table", label: "Data table",
    rx: /<table\b[^>]*>/i,
    endTag: /<\/table>/i,
    maxCount: 1,
  },
  {
    kind: "modal", label: "Modal / dialog",
    rx: /<(div|dialog)\b[^>]*\b(modal|dialog|overlay|popup)\b[^>]*>/i,
    endTag: /<\/(div|dialog)>/i,
    maxCount: 1,
  },
  {
    kind: "footer", label: "Footer",
    rx: /<footer\b[^>]*>/i,
    endTag: /<\/footer>/i,
    maxCount: 1,
  },
  {
    kind: "testimonial", label: "Testimonial",
    rx: /<(div|blockquote)\b[^>]*\b(testimonial|quote|review)\b[^>]*>/i,
    endTag: /<\/(div|blockquote)>/i,
    maxCount: 2,
  },
  {
    kind: "feature-grid", label: "Feature grid",
    rx: /<(section|div)\b[^>]*\b(features?|benefits?|grid)\b[^>]*>/i,
    endTag: /<\/(section|div)>/i,
    maxCount: 1,
  },
];

const MAX_COMPONENT_SIZE = 4096;    // 4 KB
const MAX_STORED = 20;
const STORAGE_KEY = "obs.component-registry.v1";

// ── Helpers ──────────────────────────────────────────────────────────────────
function simpleHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function extractKeywords(markup: string): string[] {
  const words = new Set<string>();
  // class names
  for (const m of markup.matchAll(/class=["']([^"']+)["']/g)) {
    for (const cls of m[1].split(/[\s-_]+/)) {
      const w = cls.toLowerCase().trim();
      if (w.length >= 3 && w.length <= 20) words.add(w);
    }
  }
  // data attributes
  for (const m of markup.matchAll(/data-[\w-]+=["']([^"']{2,30})["']/g)) {
    words.add(m[1].toLowerCase());
  }
  // ARIA roles
  for (const m of markup.matchAll(/role=["'](\w+)["']/g)) {
    words.add(m[1].toLowerCase());
  }
  return [...words].slice(0, 30);
}

/** Find the extent of one element starting at `startIdx` in `html`. */
function findElementEnd(html: string, startIdx: number, endTag: RegExp): number {
  const search = html.slice(startIdx + 1);
  const m = endTag.exec(search);
  return m ? startIdx + 1 + m.index + m[0].length : Math.min(startIdx + MAX_COMPONENT_SIZE, html.length);
}

// ── Public API ───────────────────────────────────────────────────────────────
/** Extract reusable components from a built HTML string. */
export function extractComponents(html: string): StoredComponent[] {
  const results: StoredComponent[] = [];
  const now = Date.now();
  for (const rule of EXTRACTION_RULES) {
    let count = 0;
    let searchHtml = html;
    let offset = 0;
    const tagRx = new RegExp(rule.rx.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = tagRx.exec(searchHtml)) !== null && count < rule.maxCount) {
      const start = offset + m.index;
      const end = findElementEnd(html, start, rule.endTag);
      const raw = html.slice(start, end).trim();
      const markup = raw.length > MAX_COMPONENT_SIZE ? raw.slice(0, MAX_COMPONENT_SIZE) : raw;
      if (markup.length < 40) continue; // skip tiny fragments
      const id = `${rule.kind}-${simpleHash(markup)}`;
      results.push({
        id,
        label: rule.label,
        kind: rule.kind,
        markup,
        keywords: extractKeywords(markup),
        usageCount: 0,
        createdAt: now,
        lastUsedAt: now,
      });
      count++;
      offset = end;
      searchHtml = html.slice(offset);
      tagRx.lastIndex = 0;
    }
  }
  return results;
}

/** Load the stored registry from localStorage. */
export function loadRegistry(): StoredComponent[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredComponent[];
  } catch { return []; }
}

/** Save components to the registry, merging with existing. Evicts oldest when full. */
export function saveToRegistry(incoming: StoredComponent[]): void {
  try {
    if (typeof window === "undefined") return;
    const existing = loadRegistry();
    const merged = new Map<string, StoredComponent>();
    for (const c of existing) merged.set(c.id, c);
    for (const c of incoming) {
      if (merged.has(c.id)) {
        // Increment usage count on re-extraction
        const ex = merged.get(c.id)!;
        merged.set(c.id, { ...ex, usageCount: ex.usageCount + 1, lastUsedAt: Date.now() });
      } else {
        merged.set(c.id, c);
      }
    }
    // Evict oldest if over cap
    let sorted = [...merged.values()].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    if (sorted.length > MAX_STORED) sorted = sorted.slice(0, MAX_STORED);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  } catch { /* quota — fail silently */ }
}

/** Find components relevant to a prompt (keyword overlap). Returns top N. */
export function matchComponents(prompt: string, topN = 3): StoredComponent[] {
  const registry = loadRegistry();
  if (!registry.length) return [];
  const promptWords = new Set(
    prompt.toLowerCase().split(/[\s,.:!?]+/).filter((w) => w.length >= 3)
  );
  const scored = registry.map((c) => {
    const kindMatch = prompt.toLowerCase().includes(c.kind.replace("-", " ")) ||
                      prompt.toLowerCase().includes(c.label.toLowerCase());
    const kwOverlap = c.keywords.filter((kw) => promptWords.has(kw)).length;
    const recencyBonus = Math.max(0, 1 - (Date.now() - c.lastUsedAt) / (7 * 24 * 60 * 60 * 1000));
    const score = (kindMatch ? 3 : 0) + kwOverlap + recencyBonus;
    return { component: c, score };
  });
  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ component }) => component);
}

/**
 * Render matched components as a system message block.
 * Gives the model concrete markup to reuse rather than generating from scratch.
 */
export function componentsToSystemBlock(components: StoredComponent[]): string {
  if (!components.length) return "";
  const lines = [
    "REUSABLE PATTERNS FROM YOUR BUILD HISTORY:",
    "These are real components you've built before. Reuse their structure and style where relevant.",
    "",
  ];
  for (const c of components) {
    lines.push(`--- ${c.label} (${c.kind}) ---`);
    lines.push(c.markup.slice(0, 1500)); // hard cap in system message
    lines.push("");
  }
  lines.push("Adapt these patterns to fit the current build. Prefer consistency over novelty.");
  return lines.join("\n");
}

/** Clear the entire registry. */
export function clearRegistry(): void {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
