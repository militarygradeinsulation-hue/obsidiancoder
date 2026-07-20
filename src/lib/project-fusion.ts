// Project Fusion — deterministic engine to combine multiple HTML-based
// Obsidian projects into one unified system. Pure functions, no React, no
// storage, no network. All decisions are recorded as provenance.
//
// Sessions in Obsidian are HTML documents. Fusion operates at the HTML level:
// we inventory routes/components/styles/scripts/assets, detect conflicts
// deterministically, then merge under one of three modes:
//   - "module":  each source is preserved as an isolated <section> namespace.
//   - "smart":   dedupe by content hash / structural signature; keep first.
//   - "suite":   generate a shared shell + navigation across sources.
//
// The engine returns a FusionResult with the new HTML, a plan, provenance,
// metrics, and unresolved conflicts. The caller commits (creates a new
// session + checkpoint version) or discards.

import { buildGraph, type KnowledgeGraph } from "./knowledge-graph";
import { extractDesignTokens, type DesignTokens } from "./design-system";
import { validateHtml, blockingIssues, type ValidationReport } from "./validation";

export type FusionMode = "module" | "smart" | "suite";

export type FusionProject = {
  id: string;
  title: string;
  html: string;
};

export type FusionInventory = {
  id: string;
  title: string;
  slug: string;
  byteSize: number;
  contentHash: string;
  graph: KnowledgeGraph;
  tokens: DesignTokens;
  bodyInner: string;
  headInner: string;
  styles: string[];       // extracted <style> bodies
  scripts: string[];      // inline script bodies (external kept in graph.scripts)
  ids: string[];
};

export type FusionConflictKind =
  | "duplicate-id"
  | "route-collision"
  | "duplicate-title"
  | "css-var-collision"
  | "dependency-version"
  | "env-var"
  | "asset-name"
  | "component-name";

export type FusionConflict = {
  kind: FusionConflictKind;
  key: string;
  sources: string[];         // project ids implicated
  severity: "low" | "medium" | "high";
  message: string;
  autoResolvable: boolean;
  recommendedResolution?: string;
};

export type FusionDecision = {
  conflictKey: string;
  choice: string;            // e.g. project id to keep, or "namespace"
  rationale: string;
  automatic: boolean;
};

export type FusionProvenance = {
  // Every emitted node id ("section#p-<slug>", asset name, etc.) maps back
  // to a source project id.
  entries: { key: string; kind: string; sourceProjectId: string; note?: string }[];
};

export type FusionPlanOperation = {
  op: "include" | "namespace" | "dedupe" | "rename" | "isolate" | "shell";
  target: string;
  fromProjectId?: string;
  note: string;
  risk: "low" | "medium" | "high";
};

export type FusionPlan = {
  mode: FusionMode;
  baseProjectId: string;
  projectIds: string[];
  operations: FusionPlanOperation[];
  conflicts: FusionConflict[];
  summary: string;
  estimatedBytes: number;
};

export type FusionMetrics = {
  projectsCombined: number;
  filesAdded: number;         // synthetic (routes/sections created)
  filesDeduplicated: number;
  conflictsResolved: number;
  conflictsRequiringInput: number;
  routesCreated: number;
  validationMs: number;
  totalMs: number;
};

export type FusionResult = {
  ok: boolean;
  html: string;
  plan: FusionPlan;
  provenance: FusionProvenance;
  validation: ValidationReport;
  metrics: FusionMetrics;
  unresolvedConflicts: FusionConflict[];
  checkpointHtml: string;     // pre-fusion base html (for one-click rollback)
  blockers: string[];
};

// ---------- Utilities ----------

const SLUG_RX = /[^a-z0-9]+/g;

export function slugify(input: string): string {
  const s = (input || "").toLowerCase().trim().replace(SLUG_RX, "-").replace(/^-+|-+$/g, "");
  return s || "project";
}

/** Fast, stable non-crypto hash (FNV-1a 32-bit) as hex. */
export function contentHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("00000000" + h.toString(16)).slice(-8);
}

function extractBetween(html: string, tag: "head" | "body"): string {
  const rx = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = rx.exec(html);
  return m ? m[1] : "";
}

function extractAll(html: string, tag: string): string[] {
  const rx = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html))) out.push(m[1]);
  return out;
}

// ---------- Inventory ----------

export function inventoryProject(p: FusionProject): FusionInventory {
  const html = p.html || "";
  const graph = buildGraph(html);
  const tokens = extractDesignTokens(html);
  const headInner = extractBetween(html, "head");
  const bodyInner = extractBetween(html, "body") || html; // fragment fallback
  const styles = extractAll(html, "style");
  const scripts = extractAll(html, "script").filter((s) => s.trim().length > 0);
  return {
    id: p.id,
    title: p.title || "Untitled",
    slug: slugify(p.title || p.id),
    byteSize: html.length,
    contentHash: contentHash(html),
    graph,
    tokens,
    headInner,
    bodyInner,
    styles,
    scripts,
    ids: graph.ids,
  };
}

// ---------- Conflict detection ----------

const CSS_VAR_RX = /--([a-zA-Z0-9-]+)\s*:/g;

function collectCssVars(styles: string[]): Set<string> {
  const out = new Set<string>();
  for (const s of styles) {
    let m: RegExpExecArray | null;
    const rx = new RegExp(CSS_VAR_RX.source, "g");
    while ((m = rx.exec(s))) out.add(m[1]);
  }
  return out;
}

export function detectConflicts(invs: FusionInventory[]): FusionConflict[] {
  const conflicts: FusionConflict[] = [];
  if (invs.length < 2) return conflicts;

  // Duplicate DOM ids across projects
  const idOwners = new Map<string, string[]>();
  for (const inv of invs) {
    for (const id of inv.ids) {
      const arr = idOwners.get(id) ?? [];
      arr.push(inv.id);
      idOwners.set(id, arr);
    }
  }
  for (const [id, owners] of idOwners) {
    if (owners.length > 1) {
      conflicts.push({
        kind: "duplicate-id",
        key: `id:${id}`,
        sources: owners,
        severity: "medium",
        message: `DOM id "#${id}" appears in ${owners.length} projects`,
        autoResolvable: true,
        recommendedResolution: "namespace",
      });
    }
  }

  // Duplicate titles (route-collision proxy since we produce section routes)
  const slugOwners = new Map<string, string[]>();
  for (const inv of invs) {
    const arr = slugOwners.get(inv.slug) ?? [];
    arr.push(inv.id);
    slugOwners.set(inv.slug, arr);
  }
  for (const [slug, owners] of slugOwners) {
    if (owners.length > 1) {
      conflicts.push({
        kind: "route-collision",
        key: `route:${slug}`,
        sources: owners,
        severity: "high",
        message: `Route slug "/${slug}" produced by ${owners.length} projects`,
        autoResolvable: true,
        recommendedResolution: "auto-suffix",
      });
    }
  }

  // CSS variable collisions with different values
  const varDefs = new Map<string, Map<string, string[]>>(); // var -> value -> [projectIds]
  const VAR_DEF_RX = /--([a-zA-Z0-9-]+)\s*:\s*([^;{}]+)/g;
  for (const inv of invs) {
    for (const style of inv.styles) {
      let m: RegExpExecArray | null;
      const rx = new RegExp(VAR_DEF_RX.source, "g");
      while ((m = rx.exec(style))) {
        const name = m[1];
        const value = m[2].trim();
        if (!varDefs.has(name)) varDefs.set(name, new Map());
        const byVal = varDefs.get(name)!;
        const arr = byVal.get(value) ?? [];
        if (!arr.includes(inv.id)) arr.push(inv.id);
        byVal.set(value, arr);
      }
    }
  }
  for (const [name, byVal] of varDefs) {
    if (byVal.size > 1) {
      const sources = Array.from(new Set([...byVal.values()].flat()));
      conflicts.push({
        kind: "css-var-collision",
        key: `cssvar:${name}`,
        sources,
        severity: "medium",
        message: `CSS variable --${name} has ${byVal.size} conflicting values`,
        autoResolvable: true,
        recommendedResolution: "namespace",
      });
    }
  }

  // Dependency versions (CDN dep strings)
  const depByName = new Map<string, Map<string, string[]>>();
  for (const inv of invs) {
    for (const dep of inv.graph.dependencies) {
      const [name, version] = dep.split("@");
      if (!name) continue;
      if (!depByName.has(name)) depByName.set(name, new Map());
      const byV = depByName.get(name)!;
      const arr = byV.get(version || "*") ?? [];
      if (!arr.includes(inv.id)) arr.push(inv.id);
      byV.set(version || "*", arr);
    }
  }
  for (const [name, byV] of depByName) {
    if (byV.size > 1) {
      const sources = Array.from(new Set([...byV.values()].flat()));
      conflicts.push({
        kind: "dependency-version",
        key: `dep:${name}`,
        sources,
        severity: "high",
        message: `Dependency "${name}" required at ${byV.size} versions`,
        autoResolvable: false,
      });
    }
  }

  // Environment variable references — flag if same key used across projects
  const envOwners = new Map<string, string[]>();
  for (const inv of invs) {
    for (const env of inv.graph.envRefs) {
      const arr = envOwners.get(env) ?? [];
      if (!arr.includes(inv.id)) arr.push(inv.id);
      envOwners.set(env, arr);
    }
  }
  for (const [key, owners] of envOwners) {
    if (owners.length > 1) {
      conflicts.push({
        kind: "env-var",
        key: `env:${key}`,
        sources: owners,
        severity: "low",
        message: `Env var "${key}" referenced by ${owners.length} projects`,
        autoResolvable: true,
        recommendedResolution: "share",
      });
    }
  }

  // Asset name collisions (images with matching basename but different src)
  const assetByName = new Map<string, Map<string, string[]>>();
  for (const inv of invs) {
    for (const img of inv.graph.images) {
      const src = img.src || "";
      const name = src.split("/").pop() || "";
      if (!name || name.startsWith("data:")) continue;
      if (!assetByName.has(name)) assetByName.set(name, new Map());
      const bySrc = assetByName.get(name)!;
      const arr = bySrc.get(src) ?? [];
      if (!arr.includes(inv.id)) arr.push(inv.id);
      bySrc.set(src, arr);
    }
  }
  for (const [name, bySrc] of assetByName) {
    if (bySrc.size > 1) {
      const sources = Array.from(new Set([...bySrc.values()].flat()));
      conflicts.push({
        kind: "asset-name",
        key: `asset:${name}`,
        sources,
        severity: "low",
        message: `Asset "${name}" resolves to ${bySrc.size} different URLs`,
        autoResolvable: true,
        recommendedResolution: "rename",
      });
    }
  }

  return conflicts;
}

// ---------- Plan generation ----------

export function generatePlan(
  invs: FusionInventory[],
  baseProjectId: string,
  mode: FusionMode,
): FusionPlan {
  const conflicts = detectConflicts(invs);
  const operations: FusionPlanOperation[] = [];

  const base = invs.find((i) => i.id === baseProjectId) ?? invs[0];
  operations.push({
    op: "include",
    target: base.slug,
    fromProjectId: base.id,
    note: `Base project preserved as root`,
    risk: "low",
  });

  const usedSlugs = new Set<string>([base.slug]);
  for (const inv of invs) {
    if (inv.id === base.id) continue;
    let slug = inv.slug;
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${inv.slug}-${n++}`;
    usedSlugs.add(slug);
    if (mode === "module") {
      operations.push({
        op: "namespace",
        target: slug,
        fromProjectId: inv.id,
        note: `Include "${inv.title}" as isolated module (all ids/styles namespaced)`,
        risk: "low",
      });
    } else if (mode === "smart") {
      operations.push({
        op: "include",
        target: slug,
        fromProjectId: inv.id,
        note: `Merge "${inv.title}"; dedupe shared components by content hash`,
        risk: "medium",
      });
    } else {
      operations.push({
        op: "namespace",
        target: slug,
        fromProjectId: inv.id,
        note: `Route "/${slug}" under shared shell`,
        risk: "medium",
      });
    }
  }

  if (mode === "suite") {
    operations.push({
      op: "shell",
      target: "app-shell",
      note: `Generate shared nav, design tokens, and services layer`,
      risk: "medium",
    });
  }

  const estimatedBytes = invs.reduce((n, i) => n + i.byteSize, 0);
  const summary = describePlan(mode, invs, base, conflicts);
  return {
    mode,
    baseProjectId: base.id,
    projectIds: invs.map((i) => i.id),
    operations,
    conflicts,
    summary,
    estimatedBytes,
  };
}

function describePlan(
  mode: FusionMode,
  invs: FusionInventory[],
  base: FusionInventory,
  conflicts: FusionConflict[],
): string {
  const others = invs.filter((i) => i.id !== base.id).map((i) => i.title).join(", ");
  const modeLabel =
    mode === "module" ? "Add as Module (isolated)" :
    mode === "smart"  ? "Smart Merge (dedupe shared)" :
                        "Unified Suite (shared shell)";
  const hi = conflicts.filter((c) => c.severity === "high").length;
  const md = conflicts.filter((c) => c.severity === "medium").length;
  return (
    `${modeLabel}. Base: "${base.title}". Combining with: ${others || "—"}. ` +
    `${conflicts.length} conflicts detected (${hi} high, ${md} medium).`
  );
}

// ---------- Merge (HTML-level) ----------

function namespaceHtml(html: string, ns: string): string {
  if (!html) return html;
  // Prefix ids and id references (#id) in class selectors are not touched;
  // only DOM id attributes and attr-referenced ids get namespaced.
  let out = html.replace(/\bid=(["'])([^"']+)\1/g, (_m, q, id) => `id=${q}${ns}__${id}${q}`);
  out = out.replace(/\bfor=(["'])([^"']+)\1/g, (_m, q, id) => `for=${q}${ns}__${id}${q}`);
  out = out.replace(/\bhref=(["'])#([^"']+)\1/g, (_m, q, id) => `href=${q}#${ns}__${id}${q}`);
  return out;
}

function namespaceCss(css: string, ns: string): string {
  // Rewrite #id selectors to #ns__id and scope root vars under a wrapper class.
  let out = css.replace(/#([a-zA-Z][\w-]*)/g, (_m, id) => `#${ns}__${id}`);
  out = out.replace(/:root\b/g, `.${ns}-scope`);
  return out;
}

function collectExternalStyleHrefs(inv: FusionInventory): string[] {
  return inv.graph.styles.filter((s) => !s.inline && s.href).map((s) => s.href!) as string[];
}

function collectExternalScriptSrcs(inv: FusionInventory): string[] {
  return inv.graph.scripts.filter((s) => s.src).map((s) => s.src!) as string[];
}

function buildHead(title: string, sharedHeadTags: string[]): string {
  const uniq = Array.from(new Set(sharedHeadTags));
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>\n${uniq.join("\n")}`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export type FuseOptions = {
  title?: string;
  decisions?: FusionDecision[];
};

export function fuseProjects(
  projects: FusionProject[],
  baseProjectId: string,
  mode: FusionMode,
  opts: FuseOptions = {},
): FusionResult {
  const t0 = Date.now();
  const cleanProjects = projects.filter((p) => p && typeof p.html === "string");
  if (cleanProjects.length < 2) {
    return emptyResult("At least 2 projects are required for fusion.", cleanProjects[0]?.html ?? "");
  }
  const base = cleanProjects.find((p) => p.id === baseProjectId) ?? cleanProjects[0];
  const invs = cleanProjects.map(inventoryProject);
  const baseInv = invs.find((i) => i.id === base.id)!;
  const plan = generatePlan(invs, base.id, mode);

  const provenance: FusionProvenance = { entries: [] };
  const sharedHead: string[] = [];
  const sharedStyles: string[] = [];
  const sharedScripts: string[] = [];
  const sectionsHtml: string[] = [];
  const navItems: { slug: string; title: string }[] = [];
  const seenExtCss = new Set<string>();
  const seenExtJs = new Set<string>();
  const seenContentHashes = new Set<string>();
  let filesDeduplicated = 0;
  let filesAdded = 0;

  const usedSlugs = new Set<string>();
  const slugFor = new Map<string, string>();
  for (const inv of invs) {
    let s = inv.slug;
    let n = 2;
    while (usedSlugs.has(s)) s = `${inv.slug}-${n++}`;
    usedSlugs.add(s);
    slugFor.set(inv.id, s);
  }

  for (const inv of invs) {
    const slug = slugFor.get(inv.id)!;
    navItems.push({ slug, title: inv.title });

    // External stylesheets — always dedupe by href
    for (const href of collectExternalStyleHrefs(inv)) {
      if (seenExtCss.has(href)) { filesDeduplicated++; continue; }
      seenExtCss.add(href);
      sharedHead.push(`<link rel="stylesheet" href="${escapeHtml(href)}">`);
      provenance.entries.push({ key: `css:${href}`, kind: "stylesheet", sourceProjectId: inv.id });
    }
    for (const src of collectExternalScriptSrcs(inv)) {
      if (seenExtJs.has(src)) { filesDeduplicated++; continue; }
      seenExtJs.add(src);
      sharedHead.push(`<script src="${escapeHtml(src)}" defer></script>`);
      provenance.entries.push({ key: `js:${src}`, kind: "script", sourceProjectId: inv.id });
    }

    // Inline styles — namespace in module/suite; smart mode dedupes by hash
    for (const s of inv.styles) {
      const h = contentHash(s);
      if (mode === "smart" && seenContentHashes.has(`css:${h}`)) {
        filesDeduplicated++;
        continue;
      }
      seenContentHashes.add(`css:${h}`);
      const out = (mode === "module" || mode === "suite") ? namespaceCss(s, slug) : s;
      sharedStyles.push(`/* from ${escapeHtml(inv.title)} */\n${out}`);
      provenance.entries.push({ key: `style:${h}`, kind: "style-block", sourceProjectId: inv.id });
    }

    // Inline scripts — dedupe by hash in smart mode; wrap in IIFE otherwise
    for (const js of inv.scripts) {
      const h = contentHash(js);
      if (mode === "smart" && seenContentHashes.has(`js:${h}`)) {
        filesDeduplicated++;
        continue;
      }
      seenContentHashes.add(`js:${h}`);
      sharedScripts.push(`;(function(){\n/* from ${escapeHtml(inv.title)} */\n${js}\n})();`);
      provenance.entries.push({ key: `script:${h}`, kind: "inline-script", sourceProjectId: inv.id });
    }

    // Body — always namespace ids in module mode; in suite mode wrap in section
    let body = inv.bodyInner;
    if (mode === "module" || mode === "suite") body = namespaceHtml(body, slug);
    const sectionHtml =
      mode === "module"
        ? `<section id="${slug}" data-obs-source="${escapeHtml(inv.id)}" class="${slug}-scope obs-fusion-module">${body}</section>`
        : mode === "suite"
        ? `<section id="route-${slug}" data-obs-route="/${slug}" data-obs-source="${escapeHtml(inv.id)}" class="${slug}-scope obs-fusion-route">${body}</section>`
        : `<section data-obs-source="${escapeHtml(inv.id)}" class="obs-fusion-merged">${body}</section>`;
    sectionsHtml.push(sectionHtml);
    filesAdded++;
    provenance.entries.push({ key: `section:${slug}`, kind: "section", sourceProjectId: inv.id, note: inv.title });
  }

  // Suite mode: shared shell + nav
  const shellCss =
    mode === "suite"
      ? `body{margin:0;font-family:system-ui,sans-serif;background:#050607;color:#f2eee7}
.obs-fusion-shell-nav{position:sticky;top:0;display:flex;gap:12px;padding:12px 16px;background:#0b0d10;border-bottom:1px solid #1a1d22;z-index:1000}
.obs-fusion-shell-nav a{color:#c9953d;text-decoration:none;font-weight:600}
.obs-fusion-shell-nav a[aria-current="page"]{color:#f4a125}
.obs-fusion-route{padding:24px;min-height:calc(100vh - 56px)}
.obs-fusion-route[hidden]{display:none}`
      : "";
  const shellNavHtml =
    mode === "suite"
      ? `<nav class="obs-fusion-shell-nav" role="navigation" aria-label="Fused projects">${navItems
          .map((n, i) => `<a href="#route-${n.slug}" data-obs-nav="${n.slug}" ${i === 0 ? 'aria-current="page"' : ""}>${escapeHtml(n.title)}</a>`)
          .join("")}</nav>`
      : "";
  const shellScript =
    mode === "suite"
      ? `;(function(){var links=document.querySelectorAll('[data-obs-nav]');function show(slug){document.querySelectorAll('.obs-fusion-route').forEach(function(el){el.hidden=el.id!=='route-'+slug});links.forEach(function(a){a.setAttribute('aria-current',a.dataset.obsNav===slug?'page':'false')});}links.forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();show(a.dataset.obsNav);history.replaceState(null,'','#route-'+a.dataset.obsNav);});});var initial=(location.hash||'').replace('#route-','')||links[0]&&links[0].dataset.obsNav;if(initial)show(initial);})();`
      : "";

  const title = opts.title || `Fusion — ${invs.map((i) => i.title).join(" + ")}`;
  const headHtml = buildHead(title, sharedHead);
  const styleBlock = (shellCss ? shellCss + "\n" : "") + sharedStyles.join("\n\n");
  const scriptBlock = sharedScripts.join("\n\n") + (shellScript ? "\n\n" + shellScript : "");

  const bodyContent = mode === "suite"
    ? shellNavHtml + "\n<main>" + sectionsHtml.join("\n") + "</main>"
    : sectionsHtml.join("\n");

  const fusedHtml =
    `<!doctype html><html lang="en"><head>${headHtml}\n<style>${styleBlock}</style></head>` +
    `<body data-obs-fusion="${mode}">${bodyContent}\n<script>${scriptBlock}</script></body></html>`;

  // Metrics
  const conflicts = plan.conflicts;
  const autoResolved = conflicts.filter((c) => c.autoResolvable).length;
  const unresolved = conflicts.filter((c) => !c.autoResolvable);
  // Apply user decisions to remove matching unresolved conflicts.
  const decidedKeys = new Set((opts.decisions || []).map((d) => d.conflictKey));
  const remainingUnresolved = unresolved.filter((c) => !decidedKeys.has(c.key));

  const tValidate0 = Date.now();
  const validation = validateHtml(fusedHtml);
  const validationMs = Date.now() - tValidate0;
  const blockers = blockingIssues(validation).map((i) => `validation: ${i.message}`);

  const metrics: FusionMetrics = {
    projectsCombined: invs.length,
    filesAdded,
    filesDeduplicated,
    conflictsResolved: autoResolved + (opts.decisions?.length || 0),
    conflictsRequiringInput: remainingUnresolved.length,
    routesCreated: mode === "suite" ? navItems.length : 0,
    validationMs,
    totalMs: Date.now() - t0,
  };

  return {
    ok: blockers.length === 0 && remainingUnresolved.length === 0,
    html: fusedHtml,
    plan,
    provenance,
    validation,
    metrics,
    unresolvedConflicts: remainingUnresolved,
    checkpointHtml: baseInv.bodyInner ? base.html : "",
    blockers,
  };
}

function emptyResult(reason: string, checkpoint: string): FusionResult {
  return {
    ok: false,
    html: "",
    plan: {
      mode: "module",
      baseProjectId: "",
      projectIds: [],
      operations: [],
      conflicts: [],
      summary: reason,
      estimatedBytes: 0,
    },
    provenance: { entries: [] },
    validation: { status: "passed", issues: [], summary: reason },
    metrics: {
      projectsCombined: 0, filesAdded: 0, filesDeduplicated: 0,
      conflictsResolved: 0, conflictsRequiringInput: 0, routesCreated: 0,
      validationMs: 0, totalMs: 0,
    },
    unresolvedConflicts: [],
    checkpointHtml: checkpoint,
    blockers: [reason],
  };
}

// ---------- Rollback ----------

export function rollbackFusion(checkpointHtml: string): { html: string; ok: boolean } {
  return { html: checkpointHtml || "", ok: typeof checkpointHtml === "string" };
}

// ---------- Persistence abstraction (local, DB-swappable) ----------

export type FusionRecord = {
  id: string;
  createdAt: number;
  plan: FusionPlan;
  provenance: FusionProvenance;
  metrics: FusionMetrics;
  checkpointHtml: string;
  title: string;
};

export interface FusionStore {
  save(rec: FusionRecord): Promise<void> | void;
  list(): Promise<FusionRecord[]> | FusionRecord[];
  get(id: string): Promise<FusionRecord | undefined> | FusionRecord | undefined;
}

export function createLocalFusionStore(storageKey = "obsidian.fusion.records.v1"): FusionStore {
  function read(): FusionRecord[] {
    try {
      if (typeof window === "undefined") return [];
      const raw = window.localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as FusionRecord[]) : [];
    } catch { return []; }
  }
  function write(all: FusionRecord[]) {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(storageKey, JSON.stringify(all));
    } catch { /* quota — silently drop */ }
  }
  return {
    save(rec) { const all = read(); all.unshift(rec); write(all.slice(0, 50)); },
    list() { return read(); },
    get(id) { return read().find((r) => r.id === id); },
  };
}
