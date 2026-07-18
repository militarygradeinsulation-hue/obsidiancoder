// Self-tests — pure module fixtures that verify the build pipeline. No AI
// calls, no network. Runnable via the /api/self-test route.

import { classifyTask } from "./task-classifier";
import { tryDeterministicEdit } from "./deterministic-edits";
import { validateHtml, blockingIssues } from "./validation";
import { applyPatch } from "./patch-engine";
import { parsePatchResponse } from "./patch-protocol";
import { planFor } from "./orchestrator";
import { anchorsFromPrompt, budgetSnippets, snippetsAround } from "./context-manager";
import { extractOutline } from "./document-outline";
import { repairHtml } from "./repair";
import { extractDesignTokens, replaceColor, setCssVariable } from "./design-system";
import { EMPTY_MEMORY, mergeMemory, lockKey } from "./project-memory";
import { createPipeline } from "./pipeline";
import { buildContext, nextTier } from "./staged-context";
import { sanitizeErrorMessage, safeGet } from "./safe-storage";
import { buildGraph } from "./knowledge-graph";
import { scanAll } from "./scanners";
import { computeConfidence } from "./confidence";
import { migrateFromHtml, createFile, renameFile, duplicateFile, deleteFile, updateContent, toJSON, isProject } from "./project-model";
import { DEFAULT_RULES, runRules, blockingViolations } from "./rules-engine";
import { injectRuntimeBridge, parseRuntimeMessage } from "./runtime-bridge";
import { EMPTY_COST, foldMetrics, recordRestore } from "./cost-metrics";
import { record, buildRoutingStats, preferredModel, type FeedbackEvent } from "./failure-learning";
import { parseFlow } from "./flow-parser";
import { createComponent, renameComponent, deleteComponent, duplicateComponent, insertMarkup } from "./component-library";

export type TestResult = { name: string; ok: boolean; detail?: string };

function assert(cond: unknown, name: string, detail?: string): TestResult {
  return { name, ok: !!cond, detail: cond ? undefined : detail ?? "assertion failed" };
}

const SAMPLE_HTML = `<!doctype html><html><head><title>Sample</title></head><body>
<h1 id="hero">Hello world</h1>
<p>Welcome to Sample.</p>
<button id="cta">Click me</button>
</body></html>`;

export function runSelfTests(): { results: TestResult[]; passed: number; failed: number } {
  const results: TestResult[] = [];

  // Classifier
  const c1 = classifyTask('change "Hello world" to "Hi"', { mode: "agent", hasHtml: true });
  results.push(assert(c1.strategy === "deterministic", "classifier: replace → deterministic", c1.strategy));

  const c2 = classifyTask("Rebuild the site from scratch as a portfolio", { mode: "agent", hasHtml: true });
  results.push(assert(c2.strategy === "full-generation", "classifier: rebuild → full-generation", c2.strategy));

  const c3 = classifyTask("Explain what this page does", { mode: "chat", hasHtml: true });
  results.push(assert(c3.strategy === "advisory", "classifier: chat mode → advisory", c3.strategy));

  // Orchestrator plan
  const plan = planFor({ prompt: 'change "Hello world" to "Hi"', hasHtml: true, mode: "agent", pickerModel: "auto", hasAttachments: false });
  results.push(assert(plan.useDeterministic && !plan.usePatch, "orchestrator: deterministic plan"));

  // Deterministic edit
  const det = tryDeterministicEdit('change "Hello world" to "Hi"', SAMPLE_HTML);
  results.push(assert(det.ok && det.ok && det.html.includes("Hi") && !det.html.includes("Hello world"),
    "deterministic edit: text replace", det.ok ? undefined : (det as { reason: string }).reason));

  // Validation
  const v = validateHtml(SAMPLE_HTML);
  results.push(assert(v.status !== "failed", "validation: sample passes", `status=${v.status}`));

  const bad = validateHtml("<html><body><h1>oops");
  results.push(assert(bad.status === "failed", "validation: unterminated html fails"));

  // Patch protocol + engine
  const patchJson = JSON.stringify({
    summary: "rename cta",
    operations: [{ op: "replace_element_by_id", id: "cta", content: "Buy now" }],
  });
  const parsed = parsePatchResponse(patchJson);
  results.push(assert(parsed.ok, "patch parse: valid json accepted"));
  if (parsed.ok) {
    const applied = applyPatch(SAMPLE_HTML, parsed.patch);
    results.push(assert(applied.ok && applied.ok && applied.html.includes("Buy now"),
      "patch engine: replace_element_by_id"));
  }

  const badPatch = parsePatchResponse('{"summary":"x","operations":[]}');
  results.push(assert(!badPatch.ok, "patch parse: empty operations rejected"));

  // Context manager
  const anchors = anchorsFromPrompt('update "Hello world" and #hero');
  results.push(assert(anchors.includes("Hello world") && anchors.includes("#hero"),
    "context: anchor extraction"));

  const snips = budgetSnippets(snippetsAround(SAMPLE_HTML, ["Hello world"]));
  results.push(assert(snips.length === 1 && snips[0].text.includes("Hello world"),
    "context: snippets around anchor"));

  // Outline
  const outline = extractOutline(SAMPLE_HTML);
  results.push(assert(outline.headings.length === 1 && outline.buttons.length === 1,
    "outline: headings & buttons"));

  // Validation v2 — severities
  const sev = validateHtml('<!doctype html><html><body><button></button><a href="#missing">x</a><img src=""></body></html>');
  results.push(assert(sev.issues.some((i) => i.severity === "warning"), "validation v2: severity present"));
  const bad2 = validateHtml("<html><body><style>.a{ color:red;</style>");
  results.push(assert(bad2.status === "failed" && blockingIssues(bad2).length > 0, "validation v2: css imbalance blocks"));

  // Auto-repair
  const secretHtml = '<!doctype html><html><body>key=sk_live_abcdefghij1234567890</body></html>';
  const secretReport = validateHtml(secretHtml);
  const repaired = repairHtml(secretHtml, secretReport.issues);
  results.push(assert(!/sk_live_abcdefghij/.test(repaired.html) && repaired.fixes.length > 0, "repair: secret redaction"));
  const brokenHtml = "<!doctype html><html><body><h1>hi</h1>";
  const brokenReport = validateHtml(brokenHtml);
  const repaired2 = repairHtml(brokenHtml, brokenReport.issues);
  results.push(assert(/<\/html>/i.test(repaired2.html), "repair: appends missing </html>"));

  // Design system
  const dsHtml = '<!doctype html><html><head><style>body{color:#F4A125;font-family:Inter;border-radius:8px;padding:16px;box-shadow:0 1px 2px #000}</style></head><body></body></html>';
  const tokens = extractDesignTokens(dsHtml);
  results.push(assert(tokens.colors.includes("#F4A125") && tokens.fonts.some((f) => /Inter/.test(f)), "design: extract tokens"));
  const rc = replaceColor(dsHtml, "#F4A125", "#DD9324");
  results.push(assert(rc.changes === 1 && rc.html.includes("#DD9324"), "design: replace color"));
  const setv = setCssVariable(dsHtml, "brand", "#000");
  results.push(assert(setv.changed && /--brand:\s*#000/.test(setv.html), "design: set css var"));

  // Project memory v2 locks
  const m0 = { ...EMPTY_MEMORY, purpose: "landing" };
  const m1 = lockKey(m0, "purpose");
  const m2 = mergeMemory(m1, { purpose: "different" });
  results.push(assert(m2.purpose === "landing", "memory: locked key preserved"));
  const m3 = mergeMemory(m1, { audience: "devs" });
  results.push(assert(m3.audience === "devs", "memory: unlocked key merged"));

  // Patch engine — anchor ambiguity should fail atomically
  const ambJson = JSON.stringify({ summary: "amb", operations: [{ op: "replace_text", find: "x", replace: "y", allow_multiple: false }] });
  const ambParsed = parsePatchResponse(ambJson);
  const ambResult = ambParsed.ok ? applyPatch("<html><body>x x</body></html>", ambParsed.patch) : { ok: false as const };
  results.push(assert(!ambResult.ok, "patch engine: ambiguous anchor rejected"));

  // --- Patch engine V2 ops ---
  const applyOp = (html: string, op: unknown) => {
    const parsed = parsePatchResponse(JSON.stringify({ summary: "t", operations: [op] }));
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    return applyPatch(html, parsed.patch);
  };
  const removeRes = applyOp(SAMPLE_HTML, { op: "remove_element_by_id", id: "cta" });
  results.push(assert(removeRes.ok && !removeRes.html.includes('id="cta"'), "patch v2: remove_element_by_id"));

  const addClsRes = applyOp(SAMPLE_HTML, { op: "add_class", id: "hero", class_name: "big" });
  results.push(assert(addClsRes.ok && /id="hero"[^>]*class="big"/.test(addClsRes.html), "patch v2: add_class"));

  const withClass = '<!doctype html><html><body><h1 id="hero" class="big red">hi</h1></body></html>';
  const rmClsRes = applyOp(withClass, { op: "remove_class", id: "hero", class_name: "red" });
  results.push(assert(rmClsRes.ok && !/red/.test(rmClsRes.html), "patch v2: remove_class"));

  const insChildRes = applyOp(SAMPLE_HTML, { op: "insert_child", id: "hero", position: "last", content: "<span>!</span>" });
  results.push(assert(insChildRes.ok && insChildRes.html.includes("<span>!</span></h1>"), "patch v2: insert_child last"));

  const styleRes = applyOp(SAMPLE_HTML, { op: "update_inline_style", id: "cta", property: "color", value: "red" });
  results.push(assert(styleRes.ok && /style="color:\s*red"/.test(styleRes.html), "patch v2: update_inline_style"));

  const cssHtml = '<!doctype html><html><head><style>.btn{color:blue}</style></head><body></body></html>';
  const cssRes = applyOp(cssHtml, { op: "replace_css_rule", selector: ".btn", body: "color:green" });
  results.push(assert(cssRes.ok && cssRes.html.includes("color:green") && !cssRes.html.includes("color:blue"), "patch v2: replace_css_rule"));

  const scriptHtml = '<!doctype html><html><body><script>/*MARK-A*/ console.log(1)</script></body></html>';
  const scriptRes = applyOp(scriptHtml, { op: "replace_script_block", marker: "MARK-A", code: "console.log(2)" });
  results.push(assert(scriptRes.ok && scriptRes.html.includes("console.log(2)") && !scriptRes.html.includes("console.log(1)"), "patch v2: replace_script_block"));

  const renameHtml = '<!doctype html><html><body><h1 id="hero">a</h1><a href="#hero">go</a></body></html>';
  const renameRes = applyOp(renameHtml, { op: "rename_id", from: "hero", to: "banner" });
  results.push(assert(renameRes.ok && /id="banner"/.test(renameRes.html) && /href="#banner"/.test(renameRes.html), "patch v2: rename_id updates refs"));

  const jsonHtml = '<!doctype html><html><body><script type="application/json" id="d">/*MARK-CFG*/{"a":1}</script></body></html>';
  const jsonRes = applyOp(jsonHtml, { op: "update_json_block", marker: "MARK-CFG", json: '{"a":2}' });
  results.push(assert(jsonRes.ok && jsonRes.html.includes('{"a":2}'), "patch v2: update_json_block"));

  const badJsonRes = applyOp(jsonHtml, { op: "update_json_block", marker: "MARK-CFG", json: "not json" });
  results.push(assert(!badJsonRes.ok, "patch v2: invalid JSON rejected"));

  // Dry-run does not mutate returned html
  const preParsed = parsePatchResponse(JSON.stringify({ summary: "p", operations: [{ op: "remove_element_by_id", id: "cta" }] }));
  if (preParsed.ok) {
    const pre = applyPatch(SAMPLE_HTML, preParsed.patch, { dryRun: true });
    results.push(assert(pre.ok && pre.html === SAMPLE_HTML && pre.applied.length === 1, "patch v2: dry-run preflight"));
  }

  // Transactional rollback: 2nd op fails → caller keeps original
  const rbParsed = parsePatchResponse(JSON.stringify({
    summary: "rb",
    operations: [
      { op: "replace_text", find: "Hello world", replace: "Hi" },
      { op: "remove_element_by_id", id: "does-not-exist" },
    ],
  }));
  if (rbParsed.ok) {
    const rb = applyPatch(SAMPLE_HTML, rbParsed.patch);
    results.push(assert(!rb.ok && !rb.ok && rb.failedAt === 2, "patch v2: transactional failure preserves stable doc"));
  }

  // --- Pipeline ---
  const events: number[] = [];
  const pipe = createPipeline((snap) => events.push(snap.filter((s) => s.status === "ok").length));
  pipe.start("classify"); pipe.ok("classify");
  pipe.start("plan"); pipe.ok("plan");
  results.push(assert(events[events.length - 1] >= 2, "pipeline: emits stage snapshots"));

  // --- Staged context ---
  const bigHtml = '<!doctype html><html><body>' + 'lorem ipsum '.repeat(400) + '<h1 id="hero">Hello world</h1>' + 'dolor sit amet '.repeat(400) + '</body></html>';
  const ctxMin = buildContext(bigHtml, 'change "Hello world"', "minimal");
  const ctxFull = buildContext(bigHtml, 'change "Hello world"', "full");
  results.push(assert(ctxMin.chars < ctxFull.chars && ctxMin.tier === "minimal", `staged-context: minimal(${ctxMin.chars}) < full(${ctxFull.chars})`));
  results.push(assert(nextTier("minimal") === "nearby" && nextTier("full") === null, "staged-context: escalation order"));

  // --- Safe storage ---
  results.push(assert(sanitizeErrorMessage(new Error("Failed at https://x.co Bearer abc.def.ghi")).includes("[url]"), "safe: sanitize URL in error"));
  results.push(assert(safeGet("__no_such_key__") === undefined, "safe: missing key returns undefined"));

  // --- Knowledge graph (Core 3.0) ---
  const kgHtml = `<!doctype html><html lang="en"><head><title>T</title><meta name="viewport" content="width=device-width"><script src="https://cdn.jsdelivr.net/npm/htmx.org@1.9.0"></script></head><body><h1>x</h1><button id="a">Go</button><a href="#">bad</a><img src="/x.png"><script>fetch("/api/x")</script></body></html>`;
  const g = buildGraph(kgHtml);
  results.push(assert(g.ids.includes("a"), "kg: extracts ids"));
  results.push(assert(g.buttons.length === 1 && g.buttons[0].text === "Go", "kg: extracts buttons + text"));
  results.push(assert(g.links[0].broken, "kg: detects broken '#' link"));
  results.push(assert(g.endpoints.includes("/api/x"), "kg: extracts fetch endpoint"));
  results.push(assert(g.dependencies.some((d) => d.includes("htmx")), "kg: extracts CDN dependency"));
  results.push(assert(g.meta.hasLang && g.meta.hasViewport, "kg: meta flags"));

  // --- Scanners ---
  const scans = scanAll(kgHtml, g);
  results.push(assert(scans.accessibility.findings.some((f) => f.id.startsWith("alt-")), "scan a11y: missing alt"));
  results.push(assert(scans.detective.findings.some((f) => f.id === "broken-links"), "scan detective: broken links"));
  const secHtml = kgHtml + "<script>const k='sk_live_" + "a".repeat(24) + "'</script>";
  const secScan = scanAll(secHtml, buildGraph(secHtml)).security;
  results.push(assert(secScan.findings.some((f) => f.severity === "critical"), "scan security: detects exposed secret"));

  // --- Confidence ---
  const conf = computeConfidence({ validation: validateHtml(kgHtml), security: scans.security, accessibility: scans.accessibility, performance: scans.performance, detective: scans.detective, runtimeErrors: 0 });
  results.push(assert(conf.score >= 0 && conf.score <= 100 && conf.evidence.length >= 5, `confidence: composite score (${conf.score}, ${conf.evidence.length} signals)`));

  // --- Project model (Core 3.0 F2) ---
  const proj0 = migrateFromHtml("<!doctype html><html><body>hi</body></html>");
  results.push(assert(isProject(proj0) && proj0.files.length === 1 && proj0.files[0].protected === true, "project: migrate → 1 protected entry"));
  const created = createFile(proj0, "assets/logo.svg", "<svg/>"); if (!created.ok) throw new Error(created.error);
  results.push(assert(created.project.files.length === 2, "project: createFile"));
  const bad = createFile(created.project, "../oops.txt");
  results.push(assert(!bad.ok, "project: rejects path traversal"));
  const delEntry = deleteFile(created.project, proj0.entryFileId);
  results.push(assert(!delEntry.ok, "project: entry file undeletable"));
  const dup = duplicateFile(created.project, created.fileId); if (!dup.ok) throw new Error("dup failed");
  results.push(assert(dup.project.files.some((f) => f.path === "assets/logo-copy.svg"), "project: duplicate → -copy"));
  const ren = renameFile(dup.project, dup.fileId, "assets/renamed.svg"); if (!ren.ok) throw new Error("rename failed");
  const del = deleteFile(ren.project, dup.fileId); if (!del.ok) throw new Error("delete failed");
  results.push(assert(del.project.files.length === 2, "project: rename + delete"));
  const updated = updateContent(del.project, del.project.files[0].id, "<!doctype html><body>new</body>");
  results.push(assert(updated.files[0].content.includes("new"), "project: updateContent"));
  results.push(assert(toJSON(updated).includes("\"version\": 1"), "project: JSON export"));

  // --- Rules engine ---
  const rulesHtml = `<!doctype html><html><body><nav><button></button></nav><script>eval("x")</script></body></html>`;
  const vs = runRules(DEFAULT_RULES, rulesHtml, buildGraph(rulesHtml));
  results.push(assert(blockingViolations(vs).length >= 2, `rules: blocks nav-no-viewport + eval (${blockingViolations(vs).length})`));
  results.push(assert(vs.some((v) => v.ruleId === "accessible-labels"), "rules: warn on empty button"));

  // --- Runtime bridge ---
  const injected = injectRuntimeBridge("<html><head></head><body></body></html>");
  results.push(assert(injected.includes("obsidian.runtime") && injected.includes("</head>"), "runtime: bridge injected before </head>"));
  const goodMsg = parseRuntimeMessage({ data: { ns: "obsidian.runtime", kind: "console-error", message: "boom" } } as MessageEvent);
  results.push(assert(goodMsg?.kind === "console-error" && goodMsg?.message === "boom", "runtime: parse valid message"));
  const badMsg = parseRuntimeMessage({ data: { ns: "other", kind: "console-error", message: "x" } } as MessageEvent);
  results.push(assert(badMsg === null, "runtime: reject foreign namespace"));
  const bogusKind = parseRuntimeMessage({ data: { ns: "obsidian.runtime", kind: "eval-code", message: "x" } } as MessageEvent);
  results.push(assert(bogusKind === null, "runtime: reject unknown kind"));

  // --- Cost metrics ---
  const cs1 = foldMetrics(EMPTY_COST, { taskType: "modify", executionPath: "ai-patch", strategy: "ai-patch", usedAi: true, model: "openai/gpt-5.5", durationMs: 1200, summary: "", validation: { status: "passed", issues: [], summary: "" }, documentChanged: true, costEstimate: "low", reason: "", patchOperationCount: 2, patchOperationTypes: [], patchOperationSummaries: [], charactersAdded: 400, charactersRemoved: 100, fallbackUsed: false });
  results.push(assert(cs1.aiCalls === 1 && cs1.estimatedCostUsd > 0 && cs1.byModel["openai/gpt-5.5"] === 1, "cost: fold AI call"));
  const cs2 = recordRestore(cs1);
  results.push(assert(cs2.restores === 1, "cost: recordRestore"));

  // --- Failure learning ---
  let events: FeedbackEvent[] = [];
  for (let i = 0; i < 4; i++) events = record(events, { ts: Date.now(), taskType: "modify", strategy: "ai-patch", model: "modelA", validationStatus: "passed", runtimeErrors: 0, outcome: "kept" });
  for (let i = 0; i < 4; i++) events = record(events, { ts: Date.now(), taskType: "modify", strategy: "ai-patch", model: "modelB", validationStatus: "failed", runtimeErrors: 2, outcome: "rejected" });
  const stats = buildRoutingStats(events);
  results.push(assert(preferredModel(stats, "modify") === "modelA", "learning: prefer kept-heavy model"));

  // --- Flow parser ---
  const flow = parseFlow(`open\nclick #cta\ntype input[name=email] "a@b.com"\nwait 500\nassertText h1 "Hello"\nassertNoConsoleErrors\n# comment\nbogus x`);
  results.push(assert(flow.steps.length === 6 && flow.errors.length === 1 && flow.errors[0].message.includes("unknown op"), `flow: 6 steps + 1 error (got ${flow.steps.length}/${flow.errors.length})`));
  const badFlow = parseFlow(`type foo bar\nwait notanumber`);
  results.push(assert(badFlow.errors.length === 2, "flow: reject malformed"));

  // --- Component library ---
  let lib: ReturnType<typeof createComponent> extends { list: infer L } ? L : never = [] as never;
  const c1 = createComponent(lib, { name: "Hero", html: "<section>Hi</section>", css: "section{color:red}" }); if (!c1.ok) throw new Error(c1.error);
  lib = c1.list;
  const c2 = createComponent(lib, { name: "hero", html: "<section/>" });
  results.push(assert(!c2.ok, "components: reject duplicate name"));
  lib = duplicateComponent(lib, c1.id);
  results.push(assert(lib.length === 2 && lib[1].name === "Hero copy", "components: duplicate"));
  lib = renameComponent(lib, c1.id, "Hero1");
  lib = deleteComponent(lib, c1.id);
  results.push(assert(lib.length === 1 && lib[0].name === "Hero copy", "components: rename + delete"));
  results.push(assert(insertMarkup(lib[0]).includes("<style>") === false, "components: insertMarkup handles no css"));

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return { results, passed, failed };
}
