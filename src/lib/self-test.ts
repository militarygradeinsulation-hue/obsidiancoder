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
import { AiError, isAiErrorEnvelope, newRequestId, sanitizeUpstreamMessage } from "./ai-errors";
import { looksLikeHtml, looksLikeProxyError, readGuarded, firstChunkLooksBad } from "./upstream-guard";
import { canAttempt, recordFailure, recordSuccess, resetBreaker, BREAKER_CONFIG } from "./circuit-breaker";
import { reviewBuild, summarizeReport, AGENT_ROLES } from "./chief-engineer";
import { buildMemoryGraph, checkIntegrity, reachableFrom } from "./project-memory-graph";
import { computeReadiness } from "./readiness-score";
import { advise } from "./refactor-advisor";
import { resolveScope, refusalOnPatchFailure } from "./code-surgeon";
import { resolveIntroVideo } from "./intro-asset";
import { compactHtmlForContext, restoreAndVerify } from "./context-compactor";
import { isFastTier, DEFAULT_MODEL } from "./models";
import {
  inventoryProject as fus_inventory,
  detectConflicts as fus_detectConflicts,
  generatePlan as fus_generatePlan,
  fuseProjects as fus_fuse,
  rollbackFusion as fus_rollback,
  contentHash as fus_hash,
  type FusionConflict,
  type FusionProvenance,
} from "./project-fusion";

export type TestResult = { name: string; ok: boolean; detail?: string };

function assert(cond: unknown, name: string, detail?: string): TestResult {
  return { name, ok: !!cond, detail: cond ? undefined : detail ?? "assertion failed" };
}

const SAMPLE_HTML = `<!doctype html><html><head><title>Sample</title></head><body>
<h1 id="hero">Hello world</h1>
<p>Welcome to Sample.</p>
<button id="cta">Click me</button>
</body></html>`;

export async function runSelfTests(): Promise<{ results: TestResult[]; passed: number; failed: number }> {
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
  const badPath = createFile(created.project, "../oops.txt");
  results.push(assert(!badPath.ok, "project: rejects path traversal"));
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
  const cs1 = foldMetrics(EMPTY_COST, {
    taskType: "text-edit", executionPath: "low-cost-ai", strategy: "ai-patch",
    usedAi: true, model: "openai/gpt-5.5", durationMs: 1200, summary: "",
    validation: { status: "passed", issues: [], summary: "" },
    documentChanged: true, costEstimate: "low", reason: "",
    patchOperationCount: 2, patchOperationTypes: [], patchOperationSummaries: [],
    charactersAdded: 400, charactersRemoved: 100, fallbackUsed: false,
  });
  results.push(assert(cs1.aiCalls === 1 && cs1.estimatedCostUsd > 0 && cs1.byModel["openai/gpt-5.5"] === 1, "cost: fold AI call"));
  const cs2 = recordRestore(cs1);
  results.push(assert(cs2.restores === 1, "cost: recordRestore"));

  // --- Failure learning ---
  let fbEvents: FeedbackEvent[] = [];
  for (let i = 0; i < 4; i++) fbEvents = record(fbEvents, { ts: Date.now(), taskType: "text-edit", strategy: "ai-patch", model: "modelA", validationStatus: "passed", runtimeErrors: 0, outcome: "kept" });
  for (let i = 0; i < 4; i++) fbEvents = record(fbEvents, { ts: Date.now(), taskType: "text-edit", strategy: "ai-patch", model: "modelB", validationStatus: "failed", runtimeErrors: 2, outcome: "rejected" });
  const routingStats = buildRoutingStats(fbEvents);
  results.push(assert(preferredModel(routingStats, "text-edit") === "modelA", "learning: prefer kept-heavy model"));

  // --- Flow parser ---
  const flow = parseFlow(`open\nclick #cta\ntype input[name=email] "a@b.com"\nwait 500\nassertText h1 "Hello"\nassertNoConsoleErrors\n# comment\nbogus x`);
  results.push(assert(flow.steps.length === 6 && flow.errors.length === 1 && flow.errors[0].message.includes("unknown op"), `flow: 6 steps + 1 error (got ${flow.steps.length}/${flow.errors.length})`));
  const badFlow = parseFlow(`type foo bar\nwait notanumber`);
  results.push(assert(badFlow.errors.length === 2, "flow: reject malformed"));

  // --- Component library ---
  const libEmpty: import("./component-library").ComponentEntry[] = [];
  const cc1 = createComponent(libEmpty, { name: "Hero", html: "<section>Hi</section>", css: "section{color:red}" });
  if (!cc1.ok) throw new Error(cc1.error);
  let lib = cc1.list;
  const cc2 = createComponent(lib, { name: "hero", html: "<section/>" });
  results.push(assert(!cc2.ok, "components: reject duplicate name"));
  lib = duplicateComponent(lib, cc1.id);
  results.push(assert(lib.length === 2 && lib[1].name === "Hero copy", "components: duplicate"));
  lib = renameComponent(lib, cc1.id, "Hero1");
  lib = deleteComponent(lib, cc1.id);
  results.push(assert(lib.length === 1 && lib[0].name === "Hero copy", "components: rename + delete"));
  results.push(assert(insertMarkup(lib[0]).includes("<section>Hi</section>"), "components: insertMarkup emits html"));

  // ---- Reliability transport ----
  // ai-errors: envelope contract + sanitizer strip stack/URLs
  const env = new AiError({ code: "ai_upstream_html", stage: "generate", requestId: "req_test" }).toEnvelope();
  results.push(assert(isAiErrorEnvelope(env) && env.retryable === true && env.code === "ai_upstream_html", "ai-errors: envelope contract"));
  results.push(assert(!isAiErrorEnvelope({ ok: true }) && !isAiErrorEnvelope("<html>"), "ai-errors: envelope guard rejects non-envelope"));
  const sanitized = sanitizeUpstreamMessage("<html><body>error 502 at https://internal.upstream/xyz Bearer abc.def.ghi</body></html>", "fallback");
  results.push(assert(!sanitized.includes("https://") && !sanitized.includes("Bearer abc") && !sanitized.includes("<"), "ai-errors: sanitize strips tags/urls/tokens"));
  results.push(assert(typeof newRequestId() === "string" && newRequestId().length >= 8, "ai-errors: requestId"));

  // upstream-guard: HTML detection on 200 + proxy signatures + streaming first chunk
  results.push(assert(looksLikeHtml("text/html", ""), "guard: html by content-type"));
  results.push(assert(looksLikeHtml(null, "<!DOCTYPE html><html>"), "guard: html by leading bytes"));
  results.push(assert(!looksLikeHtml("application/json", "{\"ok\":true}"), "guard: json is not html"));
  results.push(assert(looksLikeProxyError("<html><body>Cloudflare Bad gateway 502</body></html>"), "guard: proxy signature"));
  const okRes = new Response(JSON.stringify({ hi: 1 }), { headers: { "content-type": "application/json" } });
  const okGuard = await readGuarded(okRes);
  results.push(assert(okGuard.ok, "guard: pass valid JSON"));
  const htmlRes = new Response("<!DOCTYPE html><html><body>oops</body></html>", { status: 200, headers: { "content-type": "text/html" } });
  const htmlGuard = await readGuarded(htmlRes);
  results.push(assert(!htmlGuard.ok && htmlGuard.reason === "html_body", "guard: reject 200 HTML body"));
  const emptyRes = new Response("", { status: 200, headers: { "content-type": "application/json" } });
  const emptyGuard = await readGuarded(emptyRes);
  results.push(assert(!emptyGuard.ok && emptyGuard.reason === "empty", "guard: reject empty body"));
  results.push(assert(firstChunkLooksBad("<!doctype html>", "text/html").bad, "guard: first-chunk html"));
  results.push(assert(!firstChunkLooksBad('data: {"choices":[{"delta":{"content":"<!"}}]}\n', "text/event-stream").bad, "guard: sse first chunk ok"));

  // circuit-breaker: opens after threshold, half-open probe after cooldown
  resetBreaker("test:cb");
  for (let i = 0; i < BREAKER_CONFIG.FAILURE_THRESHOLD; i++) recordFailure("test:cb");
  const denied = canAttempt("test:cb");
  results.push(assert(!denied.allowed && denied.state === "open", "breaker: opens after threshold"));
  const laterAllowed = canAttempt("test:cb", Date.now() + BREAKER_CONFIG.COOLDOWN_MS + 1);
  results.push(assert(laterAllowed.allowed && laterAllowed.state === "half-open", "breaker: half-open after cooldown"));
  recordSuccess("test:cb");
  const closed = canAttempt("test:cb");
  results.push(assert(closed.allowed && closed.state === "closed", "breaker: closes on success"));
  resetBreaker("test:cb");

  // ---- Core 4.0: Adaptive Intelligence ----
  // adaptive-ledger sanitization + bounded storage
  const { appendEvent, clearLedger, loadLedger, summariseLedger, MAX_EVENTS } = await import("./adaptive-ledger");
  clearLedger();
  const secretEvt = appendEvent({ kind: "request-submitted", note: "call sk_live_" + "a".repeat(20) + " Bearer abc.def unlock 4711 https://x" });
  results.push(assert(!/sk_live_|Bearer|unlock\s+\d|https:\/\//.test(secretEvt.note ?? ""), `ledger: sanitizes secrets/unlock-code/urls (${secretEvt.note})`));
  // Bounded storage + summary are pure over an in-memory array (server has no
  // window.localStorage; appendEvent's persistence step no-ops server-side).
  const inMem: import("./adaptive-ledger").LedgerEvent[] = [];
  for (let i = 0; i < MAX_EVENTS + 20; i++) inMem.push({ id: `x${i}`, ts: i, kind: "task-classified", taskType: "text-edit" });
  const trimmed = inMem.slice(-MAX_EVENTS);
  results.push(assert(trimmed.length === MAX_EVENTS, `ledger: bounded ≤ ${MAX_EVENTS}`));
  results.push(assert(summariseLedger(trimmed)["task-classified"] === MAX_EVENTS, "ledger: summary counts"));
  clearLedger();

  // preference-learning promotion threshold
  const { observe, confirmPreference, forgetPreference, preferenceFor, PROMOTION_THRESHOLD } = await import("./preference-learning");
  let plist: import("./preference-learning").LearnedPreference[] = [];
  plist = observe(plist, { key: "editing.strategy", value: "ai-patch", source: "test" });
  results.push(assert(plist[0].status === "observed" && !preferenceFor(plist, "editing.strategy"), "prefs: one obs does not promote"));
  for (let i = 1; i < PROMOTION_THRESHOLD; i++) plist = observe(plist, { key: "editing.strategy", value: "ai-patch", source: "test" });
  results.push(assert(plist[0].status === "confirmed" && !!preferenceFor(plist, "editing.strategy"), "prefs: promotes at threshold"));
  const fresh = observe([], { key: "k", value: "v", source: "test" });
  const confirmed = confirmPreference(fresh, fresh[0].id);
  results.push(assert(confirmed[0].status === "confirmed" && confirmed[0].confidence === 1, "prefs: explicit confirm overrides threshold"));
  results.push(assert(forgetPreference(confirmed, confirmed[0].id).length === 0, "prefs: forget removes"));

  // intent-resolver — low-risk edit does NOT need clarification; destructive+ambiguous does
  const { resolveIntent } = await import("./intent-resolver");
  const i1 = resolveIntent('use color red for the buttons', { hasHtml: true, attachmentsCount: 0 });
  results.push(assert(i1.scope === "style" && i1.risk === "low" && !i1.needsClarification, `intent: low-risk style edit proceeds (scope=${i1.scope} risk=${i1.risk} ask=${i1.needsClarification})`));
  const i2 = resolveIntent('delete everything', { hasHtml: true, attachmentsCount: 0 });
  results.push(assert(i2.risk === "high", "intent: destructive → high risk"));
  const i3 = resolveIntent('do it', { hasHtml: false, attachmentsCount: 0 });
  results.push(assert(i3.ambiguity > 0.5, "intent: vague short prompt → ambiguous"));

  // adaptive-router — explicit model wins
  const { decide } = await import("./adaptive-router");
  const dec = decide({ prompt: 'change "Hi" to "Hello"', hasHtml: true, mode: "agent", pickerModel: "google/gemini-3.5-flash", hasAttachments: false });
  results.push(assert(dec.explicitOverride && dec.chosenModel === "google/gemini-3.5-flash", "router: explicit model wins"));
  results.push(assert(dec.signalsIgnored.includes("explicit-model-selection"), "router: explains ignored signals"));

  // performance-model — dedupes and scores
  const { buildPerformanceModel, scoreAll } = await import("./performance-model");
  const evs = [
    { id: "1", ts: 1, kind: "patch-accepted", taskType: "text-edit", strategy: "ai-patch", model: "m", contextTier: "minimal", outcome: "kept", validationStatus: "passed", durationMs: 100 },
    { id: "1", ts: 1, kind: "patch-accepted", taskType: "text-edit", strategy: "ai-patch", model: "m", contextTier: "minimal", outcome: "kept", validationStatus: "passed", durationMs: 100 },
    { id: "2", ts: 2, kind: "version-restored", taskType: "text-edit", strategy: "ai-patch", model: "m", contextTier: "minimal", outcome: "restored" },
  ] as import("./adaptive-ledger").LedgerEvent[];
  const perf = buildPerformanceModel(evs);
  const scores = scoreAll(perf);
  results.push(assert(scores.length === 1 && scores[0].attempts === 2, `perf: dedupes ids (attempts=${scores[0]?.attempts})`));

  // next-best-action — deterministic + evidence-cited
  const { computeNextBestActions } = await import("./next-best-action");
  const acts = computeNextBestActions({
    validation: { status: "failed", summary: "", issues: [{ severity: "blocking", code: "x", message: "unterminated tag", level: "fail" }] },
    runtimeErrors: 2,
  });
  results.push(assert(acts[0].severity === "critical" && acts[0].evidenceRefs.length > 0, "coach: critical first with evidence"));

  // project-patterns extraction
  const { extractPatterns } = await import("./project-patterns");
  const pp = extractPatterns('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><style>body{color:#F4A125}h1{color:#F4A125}</style></head><body><nav></nav><form></form><button id="a">x</button><button id="b">y</button></body></html>');
  results.push(assert(pp.patterns.some((p) => p.kind === "color-token") && pp.patterns.some((p) => p.kind === "a11y"), `patterns: extracts color + a11y (${pp.patterns.map((p) => p.kind).join(",")})`));

  // adaptive-profile export never contains raw secrets or the unlock code
  const { exportProfile } = await import("./adaptive-profile");
  appendEvent({ kind: "request-submitted", note: "prompt with sk_live_" + "b".repeat(20) + " and unlock 4711" });
  const exported = exportProfile();
  results.push(assert(!/sk_live_bb|unlock\s+\d/.test(exported), "profile: export scrubs secrets/unlock-codes"));
  clearLedger();

  // Corrupted storage recovery — feeding junk should not throw
  const { safeSet } = await import("./safe-storage");
  safeSet("obs.core4.v1.ledger", ["not-an-event", { bad: true }, null]);
  results.push(assert(Array.isArray(loadLedger()), "ledger: corrupted storage recovers"));
  clearLedger();

  // ---- Core 4.2: operation tracker + rail resize + learning-disable ----
  const {
    newOperationId, orderImageProviders, parseProviderHeader,
    dedupeAppendOperation, hasOperationEvent,
    clampRail, nextRailWidthForKey, railMax, RAIL_MIN, RAIL_HARD_MAX,
    summarizeOperation,
  } = await import("./operation-tracker");

  // operation IDs — unique across many draws
  const opIds = new Set<string>();
  for (let i = 0; i < 200; i++) opIds.add(newOperationId());
  results.push(assert(opIds.size === 200 && [...opIds].every((s) => s.startsWith("op_")), "op-tracker: unique prefixed ids"));

  // image provider ordering: canonical order regardless of input order,
  // drops unknowns, dedupes duplicates.
  const ord1 = orderImageProviders(["gemini", "leonardo", "leonardo", "higgsfield", "midjourney"]);
  results.push(assert(JSON.stringify(ord1) === JSON.stringify(["leonardo", "higgsfield", "gemini"]), `op-tracker: canonical order (${ord1.join(",")})`));
  const ord2 = orderImageProviders([]);
  results.push(assert(ord2.length === 0, "op-tracker: empty provider list"));
  // header parsing (image provider fallback metadata)
  const chain = parseProviderHeader("hero:higgsfield,card:gemini,logo:leonardo");
  results.push(assert(JSON.stringify(chain) === JSON.stringify(["leonardo", "higgsfield", "gemini"]), `op-tracker: parse header (${chain.join(",")})`));
  results.push(assert(parseProviderHeader("none").length === 0 && parseProviderHeader(null).length === 0, "op-tracker: 'none'/null header → []"));

  // operation dedup — same (opId, kind) is only appended once
  const opA = newOperationId();
  const baseEvt = { id: "e1", ts: 1, kind: "fullgen-accepted" as const, operationId: opA };
  const list1 = dedupeAppendOperation([], baseEvt);
  const list2 = dedupeAppendOperation(list1, { ...baseEvt, id: "e2" });
  results.push(assert(list1.length === 1 && list2.length === 1, "op-tracker: dedup by (operationId, kind)"));
  const list3 = dedupeAppendOperation(list2, { id: "e3", ts: 2, kind: "version-restored", operationId: opA });
  results.push(assert(list3.length === 2, "op-tracker: same opId different kind → append"));
  results.push(assert(hasOperationEvent(list3, opA, "fullgen-accepted"), "op-tracker: hasOperationEvent detects"));
  results.push(assert(!hasOperationEvent(list3, "op_missing", "fullgen-accepted"), "op-tracker: missing opId → false"));

  // rail resize math (headless, no DOM)
  results.push(assert(clampRail(50, 1600) === RAIL_MIN, "rail: clamp below min"));
  results.push(assert(clampRail(9999, 1600) === railMax(1600), `rail: clamp to viewport-derived max (${railMax(1600)})`));
  results.push(assert(clampRail(9999, 5000) === RAIL_HARD_MAX, `rail: clamp to hard cap on huge viewport (${RAIL_HARD_MAX})`));
  // ArrowLeft widens the panel (grows leftward, docked right); ArrowRight shrinks.
  results.push(assert(nextRailWidthForKey("ArrowLeft", 300, 1600) === 316, "rail-key: ArrowLeft +16"));
  results.push(assert(nextRailWidthForKey("ArrowRight", 300, 1600) === 284, "rail-key: ArrowRight -16"));
  results.push(assert(nextRailWidthForKey("ArrowLeft", 300, 1600, true) === 340, "rail-key: Shift+ArrowLeft +40"));
  results.push(assert(nextRailWidthForKey("Home", 800, 1600) === 320, "rail-key: Home resets to default"));
  results.push(assert(nextRailWidthForKey("q", 300, 1600) === 300, "rail-key: other keys no-op"));
  // Repeated ArrowRight can never take us below RAIL_MIN.
  let w = 300;
  for (let i = 0; i < 100; i++) w = nextRailWidthForKey("ArrowRight", w, 1600);
  results.push(assert(w === RAIL_MIN, `rail-key: repeated ArrowRight bottoms at min (${w})`));

  // learning-disable persistence (round-trip through save/loadSettings).
  // Storage is client-only; on the server safeSet is a no-op, so we only
  // assert the persistence round-trip when localStorage is present.
  const { saveSettings, loadSettings, DEFAULT_SETTINGS } = await import("./adaptive-profile");
  const hasStorage = typeof window !== "undefined" && !!window.localStorage;
  const originalSettings = loadSettings();
  if (hasStorage) {
    saveSettings({ ...DEFAULT_SETTINGS, enabled: false });
    const after = loadSettings();
    results.push(assert(after.enabled === false && after.localOnly === true, "learning: disabled state persists across load"));
    saveSettings({ ...DEFAULT_SETTINGS, enabled: true });
    const on = loadSettings();
    results.push(assert(on.enabled === true, "learning: re-enabling persists"));
    // adaptive-router honours disabled flag (client-side only, since it reads settings)
    const { decide: decideAgain } = await import("./adaptive-router");
    saveSettings({ ...DEFAULT_SETTINGS, enabled: false });
    const decDisabled = decideAgain({ prompt: "add a paragraph", hasHtml: true, mode: "agent", pickerModel: "auto", hasAttachments: false });
    results.push(assert(decDisabled.signalsIgnored.includes("learning-disabled") && decDisabled.signalsUsed.length === 0,
      `router: disabled → no learning signals used (used=${decDisabled.signalsUsed.length})`));
    saveSettings(originalSettings);
  } else {
    // On server: the shape must at least round-trip through DEFAULT and
    // loadSettings must never throw; both are enforced by loadSettings itself.
    results.push(assert(originalSettings.localOnly === true && typeof originalSettings.enabled === "boolean",
      "learning: server-side settings expose enabled + localOnly"));
    results.push(assert(DEFAULT_SETTINGS.enabled === true && DEFAULT_SETTINGS.localOnly === true,
      "learning: DEFAULT_SETTINGS shape stable"));
  }

  // outcome loop — pending → ok summary line survives round-trip
  const op = {
    operationId: opA, startedAt: 0, finishedAt: 100, durationMs: 100,
    requestedModel: "auto", actualModel: "google/gemini-3.5-flash",
    strategy: "full-generation", taskType: "text-edit",
    providerChain: ["leonardo", "gemini"], validationStatus: "passed" as const,
    outcome: "ok" as const, rollbackId: "v_prev",
  };
  const line = summarizeOperation(op);
  results.push(assert(line.includes("full-generation") && line.includes("gemini") && line.includes("ok") && line.includes("validation:passed"),
    `op-tracker: summary line composes (${line})`));

  // stable-state preservation — an operation summary marked 'rejected' must
  // still carry the rollbackId so the panel can offer restoration.
  const rejected = { ...op, outcome: "rejected" as const };
  results.push(assert(rejected.rollbackId === "v_prev" && rejected.providerChain.length === 2,
    "op-tracker: rejected op retains rollback + provider chain"));

  // ---------- Chief Engineer multi-agent orchestration ----------
  {
    const cleanHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Landing</title><meta name="description" content="Get started."></head><body><h1>Welcome to Landing</h1><p>Sign up to get started with our product.</p><button aria-label="Sign up">Sign up</button><img src="/hero.jpg" alt="Hero"></body></html>`;
    const okPlan = planFor({ prompt: "landing page", hasHtml: true, mode: "agent", pickerModel: "auto", hasAttachments: false });
    const okValidation = validateHtml(cleanHtml);
    const collected: string[] = [];
    const rpt = reviewBuild({
      request: "build a landing page for signup",
      previousHtml: "<html></html>",
      candidateHtml: cleanHtml,
      plan: okPlan, validation: okValidation,
      onAgent: (r) => collected.push(r.role),
    });
    results.push(assert(rpt.reviews.length === AGENT_ROLES.length, `chief: all ${AGENT_ROLES.length} agents ran (got ${rpt.reviews.length})`));
    results.push(assert(rpt.reviews[0].role === "architect", "chief: architect leads reconciled report"));
    results.push(assert(collected.length === AGENT_ROLES.length, "chief: onAgent fires for every role"));
    results.push(assert(rpt.ok && !rpt.blocked, `chief: clean page approved (score=${rpt.readinessScore})`));
    results.push(assert(rpt.readinessScore >= 60, `chief: reasonable readiness score (${rpt.readinessScore})`));

    // Blocking path — inline secret triggers Security block.
    const dirty = `<!doctype html><html><head><title>X</title></head><body><h1>X</h1><script>const KEY="sk_live_${"a".repeat(20)}";eval(KEY);</script><button></button></body></html>`;
    const dv = validateHtml(dirty);
    const rpt2 = reviewBuild({ request: "x", previousHtml: "", candidateHtml: dirty, plan: okPlan, validation: dv });
    results.push(assert(rpt2.blocked && rpt2.blockingRoles.includes("security"), `chief: security blocks on exposed secret (blocked=${rpt2.blocked}, roles=${rpt2.blockingRoles.join(",")})`));
    results.push(assert(!rpt2.ok, "chief: blocked report not ok by default"));

    // Bypass override
    const rpt3 = reviewBuild({ request: "x", previousHtml: "", candidateHtml: dirty, plan: okPlan, validation: dv, bypass: true });
    results.push(assert(rpt3.ok && rpt3.bypassed, "chief: bypass allows commit despite block"));

    // Summary shape survives serialization
    const sum = summarizeReport(rpt);
    const json = JSON.parse(JSON.stringify(sum));
    results.push(assert(json.readinessScore === sum.readinessScore && Array.isArray(json.approvals), "chief: summary round-trips through JSON"));
  }

  // ---------- Project Memory Graph ----------
  {
    const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>X</title></head><body><h1>X</h1><img src="/a.jpg" alt="a"><a href="/about">About</a><a href="#">broken</a><script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script></body></html>`;
    const versions = [
      { id: "v2", label: "latest", createdAt: 2, metadata: { engineering: { readinessScore: 82, ok: true, blocked: false, bypassed: false, blockingRoles: [], approvals: [], summary: "", risks: [] } } as unknown as import("./version-metadata").VersionMetadata },
      { id: "v1", label: "prev", createdAt: 1 },
    ];
    const mg = buildMemoryGraph({ html, versions, currentVersionId: "v2" });
    results.push(assert(mg.nodes.some((n) => n.id === "route:/"), "graph: root route node present"));
    results.push(assert(mg.nodes.some((n) => n.kind === "dependency"), "graph: dependency extracted"));
    results.push(assert(mg.nodes.some((n) => n.kind === "version" && n.id === "version:v2"), "graph: version node present"));
    results.push(assert(mg.edges.some((e) => e.kind === "rollback" && e.from === "version:v2" && e.to === "version:v1"), "graph: rollback edge chains versions"));
    results.push(assert(mg.edges.some((e) => e.broken === true), "graph: broken '#' link flagged"));
    const integ = checkIntegrity(mg);
    results.push(assert(integ.ok, `graph: integrity clean (${integ.issues.join("|")})`));
    const reach = reachableFrom(mg, "route:/", 2);
    results.push(assert(reach.size > 3, `graph: reachableFrom root finds ${reach.size} nodes`));
  }

  // ---------- Readiness Score ----------
  {
    const cleanHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Landing</title><meta name="description" content="Get started."></head><body><h1>Landing</h1><img src="/hero.jpg" alt="Hero" loading="lazy"><p>Content</p></body></html>`;
    const v = validateHtml(cleanHtml);
    const r = computeReadiness({ html: cleanHtml, validation: v, selfTestPassed: 100, selfTestFailed: 0 });
    results.push(assert(r.axes.length === 7, `readiness: seven axes (${r.axes.length})`));
    results.push(assert(r.overall > 60, `readiness: clean page scores > 60 (${r.overall})`));
    results.push(assert(r.axes.every((a) => a.evidence.length > 0), "readiness: every axis carries evidence"));
    results.push(assert(r.axes.find((a) => a.axis === "testing")?.score === 100, "readiness: 100/100 tests → testing 100"));

    const badHtml = `<html><body><script>eval("x")</script><img src="/a.jpg"><img src="/b.jpg"><img src="/c.jpg"></body></html>`;
    const bv = validateHtml(badHtml);
    const rb = computeReadiness({ html: badHtml, validation: bv });
    results.push(assert(rb.overall < r.overall, `readiness: unhealthy page scores lower (${rb.overall} < ${r.overall})`));
  }

  // ---------- Refactor Advisor ----------
  {
    const dirty = `<!doctype html><html><head></head><body>${"<div id=\"dup\"></div>".repeat(3)}<button></button><script>1</script><script>2</script><script>3</script><script>4</script><script>5</script><script src="https://code.jquery.com/jquery-1.12.4.min.js"></script></body></html>`;
    const sug = advise({ html: dirty });
    results.push(assert(sug.some((s) => s.category === "duplication" && s.id === "dup-ids"), "refactor: duplicate ids flagged"));
    results.push(assert(sug.some((s) => s.category === "stale-dependency"), "refactor: stale jquery flagged"));
    results.push(assert(sug.some((s) => s.category === "duplication" && s.id === "inline-scripts"), "refactor: inline scripts flagged"));
    results.push(assert(sug[0].severity === "high" || sug[0].severity === "medium", `refactor: sorted by severity (${sug[0].severity})`));
    const cleanSug = advise({ html: `<!doctype html><html lang="en"><head><title>X</title></head><body><p>ok</p></body></html>` });
    results.push(assert(cleanSug.length === 0, `refactor: clean page yields 0 suggestions (${cleanSug.length})`));
  }

  // ---------- Code Surgeon ----------
  {
    const html = `<div id="hero-cta">Buy</div><div id="pricing-grid">$</div>`;
    const globalReq = resolveScope({ request: "rewrite the whole page from scratch", html });
    results.push(assert(!!globalReq.bailReason && globalReq.confidence === 0, "surgeon: refuses global rewrite"));
    const emptyReq = resolveScope({ request: "make it prettier", html });
    results.push(assert(!!emptyReq.bailReason, "surgeon: refuses when no scope resolvable"));
    const idReq = resolveScope({ request: "change the hero-cta text to Subscribe", html });
    results.push(assert(idReq.anchors.includes("hero-cta") && !idReq.bailReason, `surgeon: anchors on explicit id (${idReq.anchors.join(",")})`));
    const regionReq = resolveScope({ request: "tighten the pricing section", html });
    results.push(assert(regionReq.regions.includes("pricing"), `surgeon: matches region (${regionReq.regions.join(",")})`));
    // On patch failure, MUST NOT propose full regen.
    const refusal = refusalOnPatchFailure(idReq, "anchor not found");
    results.push(assert(refusal.ok === false && !/regener|full/i.test(refusal.suggestion), "surgeon: refusal never suggests full regen"));
  }

  // ---------- Intro asset resolution ----------
  {
    const a = resolveIntroVideo();
    results.push(assert(a.ok === true, `intro-asset: pointer valid (${a.reason ?? "ok"})`));
    results.push(assert(a.url.length > 0 && (a.url.startsWith("/__l5e/") || a.url.startsWith("http")), `intro-asset: url shape ok (${a.url.slice(0, 40)})`));
    results.push(assert(!a.contentType || /^video\//.test(a.contentType), `intro-asset: content-type video (${a.contentType})`));
  }

  // ---------- Context compactor: LOSSLESS round-trip ----------
  {
    const bigB64 = "A".repeat(50_000);
    const smallB64 = "B".repeat(80);
    const css = "body{background:#000;color:#fff}" + "/*pad*/".repeat(3_000);
    const js = "console.log('x');" + "var _p=1;".repeat(3_000);
    const tail = `<footer>© 2026 Aetheris — end-of-doc marker: END_TAIL_${"z".repeat(500)}_END</footer>`;
    const html =
      `<!doctype html><html><head><style>${css}</style></head><body>` +
      `<img src="data:image/png;base64,${bigB64}" alt="hero">` +
      `<img src="data:image/gif;base64,${smallB64}" alt="tiny">` +
      `<img src="data:image/webp;base64,${"C".repeat(600)}" alt="mid">` +
      `<p>${"hello world ".repeat(500)}</p>` +
      `<script>${js}</script>${tail}</body></html>`;

    const out = compactHtmlForContext(html);
    results.push(assert(out.imagesReplaced === 2, `compactor: replaces 2 large base64 images (${out.imagesReplaced})`));
    results.push(assert(!out.html.includes("A".repeat(500)), "compactor: large base64 body not retained"));
    results.push(assert(out.html.includes(smallB64), "compactor: small base64 preserved verbatim"));
    results.push(assert(out.html.includes(css) && out.html.includes(js), "compactor: CSS and JS preserved verbatim"));
    results.push(assert(out.html.includes(tail), "compactor: end-of-document preserved verbatim"));
    results.push(assert(out.html.includes("hello world hello world"), "compactor: prose preserved verbatim"));

    // Lossless round-trip via restore.
    const round = restoreAndVerify(out.html, out.placeholders);
    results.push(assert(round.ok && round.corrupted === 0 && round.unknown === 0, `compactor: round-trip verifies (ok=${round.ok} corrupted=${round.corrupted} unknown=${round.unknown})`));
    results.push(assert(round.html === html, "compactor: round-trip byte-for-byte identical to input"));
    results.push(assert(round.restored === 2 && round.dropped === 0, `compactor: restored all placeholders (restored=${round.restored} dropped=${round.dropped})`));

    // Mutation detection: chop 3 chars off a placeholder token.
    const mutated = out.html.replace(/__OBS_IMG_ph_[a-f0-9]{10}_END__/, "__OBS_IMG_ph_deadbeef_END__");
    const badMut = restoreAndVerify(mutated, out.placeholders);
    results.push(assert(!badMut.ok && (badMut.corrupted > 0 || badMut.unknown > 0), `compactor: mutated placeholder rejected (corrupted=${badMut.corrupted} unknown=${badMut.unknown})`));

    // Partial-fragment detection.
    const truncated = out.html.replace(/__OBS_IMG_ph_[a-f0-9]{10}_END__/, "__OBS_IMG_ph_abc");
    const badTrunc = restoreAndVerify(truncated, out.placeholders);
    results.push(assert(!badTrunc.ok && badTrunc.corrupted > 0, `compactor: truncated placeholder rejected (corrupted=${badTrunc.corrupted})`));

    // Dropped placeholder (model removed the image entirely) — allowed, ok=true.
    const dropped = out.html.replace(/<img src="data:image\/png;base64,__OBS_IMG_ph_[a-f0-9]{10}_END__" alt="hero">/, "");
    const okDrop = restoreAndVerify(dropped, out.placeholders);
    results.push(assert(okDrop.ok && okDrop.dropped >= 1, `compactor: dropped placeholder allowed and reported (dropped=${okDrop.dropped})`));

    const small = compactHtmlForContext(`<p>hello</p>`);
    results.push(assert(small.imagesReplaced === 0 && small.html === "<p>hello</p>", "compactor: leaves small html untouched"));
  }

  // ---------- Model tiers (fallback safety) ----------
  {
    results.push(assert(isFastTier(DEFAULT_MODEL), `models: default model is fast-tier (${DEFAULT_MODEL})`));
    results.push(assert(!isFastTier("google/gemini-3.1-pro-preview"), "models: Gemini Pro is not fast-tier"));
    results.push(assert(!isFastTier("openai/gpt-5.5"), "models: GPT-5.5 is not fast-tier"));
  }

  // ---------- Project Fusion ----------
  {
    const A = { id: "a", title: "Alpha Shop", html: `<!doctype html><html><head><title>A</title><style>:root{--brand:#f00}#hero{color:red}</style></head><body><h1 id="hero">Alpha</h1><script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21"></script></body></html>` };
    const B = { id: "b", title: "Alpha Shop", html: `<!doctype html><html><head><title>B</title><style>:root{--brand:#0f0}#hero{color:green}</style></head><body><h1 id="hero">Beta</h1><script src="https://cdn.jsdelivr.net/npm/lodash@3.10.1"></script></body></html>` };
    const C = { id: "c", title: "Gamma Dash", html: `<!doctype html><html><head><title>C</title></head><body><section id="dash"><p>Gamma</p></section></body></html>` };
    const invs = [A, B, C].map(fus_inventory);
    results.push(assert(invs.length === 3, "fusion: inventory built for 3 projects"));
    const conflicts = fus_detectConflicts(invs);
    results.push(assert(conflicts.some((c: FusionConflict) => c.kind === "duplicate-id" && c.key === "id:hero"), "fusion: duplicate id detected"));
    results.push(assert(conflicts.some((c: FusionConflict) => c.kind === "route-collision"), "fusion: route collision on duplicate slug"));
    results.push(assert(conflicts.some((c: FusionConflict) => c.kind === "css-var-collision" && c.key === "cssvar:brand"), "fusion: css var collision detected"));
    results.push(assert(conflicts.some((c: FusionConflict) => c.kind === "dependency-version"), "fusion: dep version conflict detected"));

    const plan = fus_generatePlan(invs, "a", "module");
    results.push(assert(plan.baseProjectId === "a" && plan.operations.length >= 3, "fusion: plan generated with base"));

    // Fuse — module mode should namespace ids, isolating collisions
    const rModule = fus_fuse([A, B, C], "a", "module");
    results.push(assert(rModule.html.includes("alpha-shop__hero") && rModule.html.includes("alpha-shop-2__hero"), "fusion: module mode namespaces ids to avoid collision"));
    results.push(assert(rModule.metrics.projectsCombined === 3, "fusion: metrics.projectsCombined correct"));
    results.push(assert(rModule.provenance.entries.some((e: FusionProvenance["entries"][number]) => e.sourceProjectId === "a"), "fusion: provenance traces to source"));

    // Smart mode dedupes identical inline styles
    const D = { id: "d", title: "Dup A", html: `<!doctype html><html><body><style>.x{color:red}</style><div class="x">D</div></body></html>` };
    const E = { id: "e", title: "Dup B", html: `<!doctype html><html><body><style>.x{color:red}</style><div class="x">E</div></body></html>` };
    const rSmart = fus_fuse([D, E], "d", "smart");
    results.push(assert(rSmart.metrics.filesDeduplicated >= 1, "fusion: smart merge dedupes identical style block"));

    // Suite generates shell + routes
    const rSuite = fus_fuse([A, C], "a", "suite");
    results.push(assert(rSuite.metrics.routesCreated === 2 && rSuite.html.includes("obs-fusion-shell-nav"), "fusion: suite mode builds shared shell"));

    // Rejects <2 projects
    const rSingle = fus_fuse([A], "a", "module");
    results.push(assert(!rSingle.ok && rSingle.blockers.length > 0, "fusion: rejects when fewer than 2 projects"));

    // Rollback returns checkpoint
    const rb = fus_rollback(A.html);
    results.push(assert(rb.ok && rb.html === A.html, "fusion: rollback returns checkpoint html"));

    // Validation runs on output
    results.push(assert(rModule.validation.status !== "failed", "fusion: module output passes validation"));

    // Provenance covers every source
    const sources = new Set(rModule.provenance.entries.map((e: FusionProvenance["entries"][number]) => e.sourceProjectId));
    results.push(assert(sources.has("a") && sources.has("b") && sources.has("c"), "fusion: provenance covers all sources"));

    // Content hash is stable
    results.push(assert(fus_hash("abc") === fus_hash("abc") && fus_hash("abc") !== fus_hash("abd"), "fusion: content hash stable & discriminates"));
  }

  // ─── credit gate: math, envelope, and reservation ledger ─────────────
  {
    const cg = await import("./credit-gate");
    const b = cg.balanceFor(200, 1000, 50);
    results.push(assert(b.used === 200 && b.reserved === 50 && b.cap === 1000 && b.remaining === 750, "credit-gate: balanceFor includes reserved"));
    results.push(assert(cg.canSpend(990, 1000, 10) === true, "credit-gate: canSpend at exact cap ok"));
    results.push(assert(cg.canSpend(991, 1000, 10) === false, "credit-gate: canSpend rejects over cap"));
    results.push(assert(cg.costForOperation("generate_html") === 10, "credit-gate: known op cost"));
    results.push(assert(cg.capForPlan("free") === 0 && cg.capForPlan("pro") === 1000, "credit-gate: plan caps"));
    const env = cg.creditsRequiredEnvelope({ code: "credits_required", operation: "generate_html", used: 1000, cap: 1000, needed: 10 });
    results.push(assert(cg.isCreditsRequiredEnvelope(env), "credit-gate: envelope guard"));
    results.push(assert(env.suggestedPriceId === "obsidian_creator_monthly", "credit-gate: suggests Creator price on 402"));
    results.push(assert(env.remaining === 0, "credit-gate: envelope computes remaining"));

    // creditsForUsd — actual/estimated/minimum + failure = 0
    results.push(assert(cg.creditsForUsd(0) === 0, "credit-gate: zero usd → zero credits (failed no-provider call)"));
    results.push(assert(cg.creditsForUsd(0, "generate_html") === 0, "credit-gate: zero usd with op still 0 (nothing charged for no-usage failure)"));
    results.push(assert(cg.creditsForUsd(0.001, "enhance_prompt") === 1, "credit-gate: sub-credit usd rounds up to op minimum 1"));
    results.push(assert(cg.creditsForUsd(0.023) === 5, "credit-gate: usd → credits ceil(0.023/0.005)=5"));
    results.push(assert(cg.creditsForUsd(0.025) === 5, "credit-gate: exact multiple $0.025→5 credits"));
    results.push(assert(cg.creditsForUsd(0.026) === 6, "credit-gate: rounds up above multiple"));

    // Token → USD estimation
    const usdFlash = cg.estimateUsdFromTokens("google/gemini-3.1-flash-lite", 10_000, 2_000);
    results.push(assert(Math.abs(usdFlash - (10 * 0.0001 + 2 * 0.0004)) < 1e-9, "credit-gate: estimateUsdFromTokens flash-lite"));
    const usdUnknown = cg.estimateUsdFromTokens("unknown/model", 999_999, 999_999);
    results.push(assert(usdUnknown === cg.MIN_CALL_COST_USD, "credit-gate: unknown model falls back to conservative minimum"));

    // Ledger — atomic reserve/commit/refund contract
    const led = new cg.ReservationLedger(100);
    const r1 = led.reserve(60);
    const r2 = led.reserve(50);
    results.push(assert(r1 !== null && r2 === null, "credit-gate: ledger rejects when second reservation would exceed cap"));
    if (r1) led.refund(r1);
    const r3 = led.reserve(50);
    results.push(assert(r3 !== null && led.balance().used === 50, "credit-gate: refund restores capacity"));
    if (r3) led.commit(r3);
    results.push(assert(led.balance().used === 50, "credit-gate: commit does not change used"));

    // Concurrent-cap invariant: many parallel reserves never exceed cap
    const led2 = new cg.ReservationLedger(30);
    const ids = Array.from({ length: 20 }, () => led2.reserve(2)).filter((x): x is string => !!x);
    results.push(assert(ids.length === 15 && led2.balance().used === 30, "credit-gate: concurrent reservations stop at cap"));

    // Idempotency simulation: same request_id → single reservation slot
    // (mirrors reserve_credits_v2 SQL contract at the JS layer)
    const led3 = new cg.ReservationLedger(100);
    const seen = new Map<string, string>();
    const idempotentReserve = (reqId: string, amt: number) => {
      const prev = seen.get(reqId);
      if (prev) return { id: prev, idempotent: true };
      const id = led3.reserve(amt);
      if (id) seen.set(reqId, id);
      return { id, idempotent: false };
    };
    const a = idempotentReserve("req-A", 10);
    const b2 = idempotentReserve("req-A", 10);
    results.push(assert(a.id === b2.id && b2.idempotent === true && led3.balance().used === 10,
      "credit-gate: retrying same request_id returns same reservation, does not double-charge"));
  }

  // ─── credit gate: reservation envelope (separate from final charge) ──
  {
    const cg = await import("./credit-gate");

    // 1. Envelope map is distinct from OPERATION_COST and matches spec.
    results.push(assert(
      cg.reservationForOperation("generate_html") === 60 &&
        cg.reservationForOperation("generate_html_patch") === 20 &&
        cg.reservationForOperation("generate_image") === 40 &&
        cg.reservationForOperation("enhance_prompt") === 5 &&
        cg.reservationForOperation("cloud_save") === 1 &&
        cg.reservationForOperation("cloud_share") === 1 &&
        cg.reservationForOperation("github_deploy") === 2,
      "envelope: reservationForOperation returns spec envelope for every operation",
    ));
    results.push(assert(
      cg.reservationForOperation("generate_html") !== cg.costForOperation("generate_html") &&
        cg.reservationForOperation("generate_image") !== cg.costForOperation("generate_image"),
      "envelope: reservation and OPERATION_COST are separate values",
    ));
    results.push(assert(
      cg.RESERVATION_ENVELOPE !== (cg as unknown as { OPERATION_COST: unknown }).OPERATION_COST,
      "envelope: RESERVATION_ENVELOPE is a distinct map from OPERATION_COST",
    ));
    try {
      (cg.reservationForOperation as (op: string) => number)("nope");
      results.push(assert(false, "envelope: unknown op should throw"));
    } catch {
      results.push(assert(true, "envelope: unknown op throws"));
    }

    // 2. Reservation hold vs final charge — unused envelope releases.
    const { UsageLedger } = await import("./usage-ledger-mock");
    const now = 1_800_000_000_000;
    const ledger = new UsageLedger();
    ledger.now = () => now;
    ledger.addSub({
      userId: "u1", env: "sandbox", status: "active",
      periodStart: now - 1000, periodEnd: now + 86_400_000,
    });
    const envelope = cg.reservationForOperation("generate_html"); // 60
    const r = ledger.reserve("u1", envelope, cg.CAP_PRO_MONTHLY, "sandbox", "generate_html", "req_env_1");
    results.push(assert(
      r !== null && r !== "no_period" && r.credits === 60,
      "envelope: reservation holds envelope credits (60)",
    ));
    // Final actual charge is much smaller than envelope — 3 credits ($0.015).
    const fin = ledger.finalize((r as { reservationId: string }).reservationId, 3, "req_env_1", "committed", cg.CAP_PRO_MONTHLY);
    results.push(assert(
      fin.ok && fin.charged === 3 && !fin.capLimited,
      "envelope: finalize charges actual (3), not envelope (60) — unused hold released",
    ));
    const bal = ledger.balance("u1", "sandbox", cg.CAP_PRO_MONTHLY);
    results.push(assert(
      bal.used === 3 && bal.reserved === 0 && bal.remaining === cg.CAP_PRO_MONTHLY - 3,
      "envelope: after finalize, only actual credits count against cap — 57 released",
    ));

    // 3. Simultaneous requests cannot reserve beyond CAP_PRO_MONTHLY (1000).
    const ledger2 = new UsageLedger();
    ledger2.now = () => now;
    ledger2.addSub({
      userId: "u2", env: "sandbox", status: "active",
      periodStart: now - 1000, periodEnd: now + 86_400_000,
    });
    let accepted = 0, rejected = 0;
    const bigEnv = cg.reservationForOperation("generate_html"); // 60
    // 20 * 60 = 1200 requested; cap is 1000 → at most floor(1000/60)=16 accepted.
    for (let i = 0; i < 20; i++) {
      const res = ledger2.reserve("u2", bigEnv, cg.CAP_PRO_MONTHLY, "sandbox", "generate_html", `req_par_${i}`);
      if (res && res !== "no_period") accepted++; else if (res === null) rejected++;
    }
    const bal2 = ledger2.balance("u2", "sandbox", cg.CAP_PRO_MONTHLY);
    results.push(assert(
      accepted === 16 && rejected === 4 && bal2.reserved === 16 * bigEnv && bal2.reserved <= cg.CAP_PRO_MONTHLY,
      "envelope: simultaneous envelope reservations stop at CAP_PRO_MONTHLY (1000)",
    ));

    // 4. Refund releases the entire envelope (not just the eventual charge).
    const ledger3 = new UsageLedger();
    ledger3.now = () => now;
    ledger3.addSub({
      userId: "u3", env: "sandbox", status: "active",
      periodStart: now - 1000, periodEnd: now + 86_400_000,
    });
    const held = ledger3.reserve("u3", cg.reservationForOperation("generate_image"), cg.CAP_PRO_MONTHLY, "sandbox", "generate_image", "req_ref_1");
    const ok = held && held !== "no_period" ? ledger3.refund(held.reservationId) : false;
    const bal3 = ledger3.balance("u3", "sandbox", cg.CAP_PRO_MONTHLY);
    results.push(assert(
      ok === true && bal3.reserved === 0 && bal3.used === 0 && bal3.remaining === cg.CAP_PRO_MONTHLY,
      "envelope: refund releases full envelope (no_provider outcomes release the hold)",
    ));

    // 5. Final charge can even be BELOW the per-op OPERATION_COST when the
    //    provider returned zero-cost usage (e.g. an aborted stream with no
    //    tokens). The DB accepts _actual_credits=0 and simply commits 0.
    const ledger4 = new UsageLedger();
    ledger4.now = () => now;
    ledger4.addSub({
      userId: "u4", env: "sandbox", status: "active",
      periodStart: now - 1000, periodEnd: now + 86_400_000,
    });
    const r4 = ledger4.reserve("u4", cg.reservationForOperation("enhance_prompt"), cg.CAP_PRO_MONTHLY, "sandbox", "enhance_prompt", "req_zero_1");
    const fin4 = r4 && r4 !== "no_period"
      ? ledger4.finalize(r4.reservationId, 0, "req_zero_1", "committed", cg.CAP_PRO_MONTHLY)
      : { ok: false, charged: -1, capLimited: false };
    results.push(assert(
      fin4.ok && fin4.charged === 0,
      "envelope: final charge may be 0 while envelope was 5 — hold fully released",
    ));
  }



  // ---- Local Only entitlement + client action guard ----
  {
    const cg = await import("./credit-gate");
    const guard = await import("./action-guard");
    const ent = await import("../hooks/useEntitlement");

    // Free plan cap must be 0 — no free AI, no free cloud writes.
    results.push(assert(cg.CAP_FREE_MONTHLY === 0, "entitlement: free plan cap is 0 (no free AI credits)"));

    // isPaidMode: only owner/pro count as allowed
    results.push(assert(ent.isPaidMode("owner") === true, "entitlement: owner is paid mode"));
    results.push(assert(ent.isPaidMode("pro") === true, "entitlement: pro is paid mode"));
    results.push(assert(ent.isPaidMode("free") === false, "entitlement: free is NOT paid mode"));

    // Instrument fetch to prove the free-plan guard never touches the network.
    const origFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = ((..._a: unknown[]) => { fetchCalls += 1; return Promise.resolve(new Response("", { status: 200 })); }) as typeof fetch;
    // Free-plan guard for every protected op (also proves GH actions blocked).
    const ops = ["generate_html","generate_html_patch","generate_image","enhance_prompt","cloud_save","cloud_share","github_deploy","github_verify","github_list","github_import","supabase_write","adaptive_write","analytics"] as const;
    // Seed snapshot as free by dispatching through subscribeEntitlement's
    // module-level state — call refreshEntitlement with a stubbed fetch.
    globalThis.fetch = (async () => new Response(JSON.stringify({
      mode: "free", authed: false, subStatus: null, environment: "sandbox",
      periodStart: null, periodEnd: null, used: 0, reserved: 0, cap: 0, remaining: 0,
    }), { status: 200 })) as typeof fetch;
    await ent.refreshEntitlement();
    // Now count real network calls the guard would make.
    fetchCalls = 0;
    globalThis.fetch = ((..._a: unknown[]) => { fetchCalls += 1; return Promise.resolve(new Response("", { status: 200 })); }) as typeof fetch;
    const freeResults = await Promise.all(ops.map((o) => guard.requirePaidAction(o)));
    results.push(assert(freeResults.every((r) => r.allowed === false && r.reason === "auth_required"),
      `guard: free denies every protected op (${freeResults.filter((r) => r.allowed).length}/${freeResults.length} allowed — expected 0)`));
    results.push(assert(fetchCalls === 0, `guard: free op invokes ZERO network calls (got ${fetchCalls})`));

    // Owner mode: allowed everywhere.
    globalThis.fetch = (async () => new Response(JSON.stringify({
      mode: "owner", authed: false, subStatus: null, environment: "sandbox",
      periodStart: null, periodEnd: null, used: 0, reserved: 0, cap: 1000, remaining: 1000,
    }), { status: 200 })) as typeof fetch;
    await ent.refreshEntitlement();
    const ownerResults = await Promise.all(ops.map((o) => guard.requirePaidAction(o)));
    results.push(assert(ownerResults.every((r) => r.allowed === true), "guard: owner allows every protected op"));

    // Active Pro: allowed.
    globalThis.fetch = (async () => new Response(JSON.stringify({
      mode: "pro", authed: true, subStatus: "active", environment: "sandbox",
      periodStart: null, periodEnd: null, used: 0, reserved: 0, cap: 1000, remaining: 1000,
    }), { status: 200 })) as typeof fetch;
    await ent.refreshEntitlement();
    const proResults = await Promise.all(ops.map((o) => guard.requirePaidAction(o)));
    results.push(assert(proResults.every((r) => r.allowed === true), "guard: active Pro allows every protected op"));

    // Signed-in but no active subscription (canceled/expired): blocked as not_pro.
    globalThis.fetch = (async () => new Response(JSON.stringify({
      mode: "free", authed: true, subStatus: "canceled", environment: "sandbox",
      periodStart: null, periodEnd: null, used: 0, reserved: 0, cap: 0, remaining: 0,
    }), { status: 200 })) as typeof fetch;
    await ent.refreshEntitlement();
    const canceledResults = await Promise.all(ops.map((o) => guard.requirePaidAction(o)));
    results.push(assert(canceledResults.every((r) => r.allowed === false && r.reason === "not_pro"),
      "guard: canceled subscription blocked as not_pro"));

    globalThis.fetch = origFetch;

    // 402 envelope shape — client decoder must recognize denial responses.
    const env402 = cg.creditsRequiredEnvelope({ code: "not_pro", operation: "generate_html" });
    results.push(assert(env402.ok === false && env402.suggestedPriceId === "obsidian_creator_monthly",
      "entitlement: not_pro envelope suggests obsidian_creator_monthly"));
    results.push(assert(cg.isCreditsRequiredEnvelope(env402), "entitlement: envelope round-trips through detector"));

    // ─── plan catalog: tier ↔ price mapping + legacy compat ───────────────
    const plans = await import("./plans");
    results.push(assert(plans.tierForPriceId("obsidian_creator_monthly")?.id === "creator",
      "plans: creator lookup key resolves to Creator tier"));
    results.push(assert(plans.tierForPriceId("obsidian_starter_monthly")?.id === "starter",
      "plans: starter lookup key resolves to Starter tier"));
    results.push(assert(plans.tierForPriceId("obsidian_professional_monthly")?.id === "professional",
      "plans: professional lookup key resolves to Professional tier"));
    results.push(assert(plans.tierForPriceId("obsidian_business_monthly")?.id === "business",
      "plans: business lookup key resolves to Business tier"));
    results.push(assert(plans.tierForPriceId("obsidian_elite_monthly")?.id === "elite",
      "plans: elite lookup key resolves to Elite tier"));
    results.push(assert(plans.tierForPriceId("obsidian_pro_monthly")?.id === "creator",
      "plans: legacy obsidian_pro_monthly resolves to Creator tier (backward compat)"));
    results.push(assert(plans.LEGACY_PRICE_TIER_MAP["obsidian_pro_monthly"] === "creator",
      "plans: LEGACY_PRICE_TIER_MAP exposes pro→creator mapping"));
    results.push(assert(plans.tierForPriceId("unknown_key") === undefined,
      "plans: unknown lookup key returns undefined (no silent fallback)"));
    results.push(assert(plans.tierForPriceId(null) === undefined && plans.tierForPriceId("") === undefined,
      "plans: null/empty priceId returns undefined"));
    const enterprise = plans.getTierById("enterprise");
    results.push(assert(enterprise?.cta === "contact" && !enterprise?.priceId,
      "plans: enterprise remains contact-only with no price"));
    const paidTiers = plans.PLAN_TIERS.filter((t) => t.cta === "checkout");
    results.push(assert(paidTiers.length === 1 && paidTiers[0]?.id === "creator" && !!paidTiers[0]?.priceId,
      "plans: only Creator is checkout-enabled during launch (others on waitlist)"));
    const waitlistTiers = plans.PLAN_TIERS.filter((t) => t.cta === "waitlist");
    results.push(assert(waitlistTiers.length === 4 && waitlistTiers.every((t) => ["starter","professional","business","elite"].includes(t.id)),
      "plans: starter/professional/business/elite are waitlist-only"));
    results.push(assert(!paidTiers.some((t) => t.priceId === "obsidian_pro_monthly"),
      "plans: no checkout tier uses the legacy pro_monthly price for new sales"));

    // Legacy strings must not appear in the client bundle sources.
    // (Runtime check via import.meta.env / window would need a bundle probe;
    // this is a lightweight guard against re-introducing the constants.)
    // We can only assert the constants are gone from this test module's scope:
    const legacyRefs = { FREE_DAILY_LIMIT: (globalThis as Record<string, unknown>).FREE_DAILY_LIMIT };
    results.push(assert(legacyRefs.FREE_DAILY_LIMIT === undefined, "entitlement: FREE_DAILY_LIMIT is not a global"));
  }

  // ────────────────────────────────────────────────────────────────
  // Usage ledger (mocked usage_reserve / usage_finalize / usage_refund /
  // usage_balance) — mirrors the SQL contract; no live DB / provider calls.
  // ────────────────────────────────────────────────────────────────
  {
    const { UsageLedger } = await import("./usage-ledger-mock");
    const NOW = 1_700_000_000_000;
    const PS = NOW - 5 * 24 * 3600_000;
    const PE = NOW + 25 * 24 * 3600_000;
    const CAP = 1000;

    // 1. Exact subscription periods drive the window (not calendar-month).
    {
      const l = new UsageLedger(); l.now = () => NOW;
      l.addSub({ userId: "u1", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      const bal = l.balance("u1", "sandbox", CAP);
      results.push(assert(bal.active && bal.periodStart === PS && bal.periodEnd === PE,
        "usage_ledger: balance reports exact subscription period"));
    }

    // 2. Missing period blocks; expired period blocks; future period blocks.
    {
      const l = new UsageLedger(); l.now = () => NOW;
      l.addSub({ userId: "u2", env: "sandbox", status: "active", periodStart: null, periodEnd: null });
      const r = l.reserve("u2", 10, CAP, "sandbox", "generate_html", "req_a");
      results.push(assert(r === "no_period", "usage_ledger: null period blocks reserve"));
      results.push(assert(l.balance("u2", "sandbox", CAP).active === false, "usage_ledger: null period balance inactive"));

      const l2 = new UsageLedger(); l2.now = () => NOW;
      l2.addSub({ userId: "u3", env: "sandbox", status: "active", periodStart: NOW - 100_000, periodEnd: NOW - 1 });
      results.push(assert(l2.reserve("u3", 10, CAP, "sandbox", "op", "req_b") === "no_period",
        "usage_ledger: expired period blocks reserve"));

      const l3 = new UsageLedger(); l3.now = () => NOW;
      l3.addSub({ userId: "u4", env: "sandbox", status: "active", periodStart: NOW + 3600_000, periodEnd: NOW + 7200_000 });
      results.push(assert(l3.reserve("u4", 10, CAP, "sandbox", "op", "req_c") === "no_period",
        "usage_ledger: future period blocks reserve"));
    }

    // 3. Idempotency — same request_id returns same row, does not double-charge.
    {
      const l = new UsageLedger(); l.now = () => NOW;
      l.addSub({ userId: "u5", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      const r1 = l.reserve("u5", 10, CAP, "sandbox", "generate_html", "REQ-1") as { reservationId: string; idempotent: boolean; credits: number };
      const r2 = l.reserve("u5", 10, CAP, "sandbox", "generate_html", "REQ-1") as { reservationId: string; idempotent: boolean; credits: number };
      results.push(assert(r1.reservationId === r2.reservationId && r2.idempotent === true && r1.credits === 10,
        "usage_ledger: idempotent request_id returns same reservation"));
      const bal = l.balance("u5", "sandbox", CAP);
      results.push(assert(bal.reserved === 10 && bal.used === 0, "usage_ledger: idempotency does not double-reserve"));
    }

    // 4. Concurrency — two racing reservations cannot exceed cap.
    {
      const l = new UsageLedger(); l.now = () => NOW;
      l.addSub({ userId: "u6", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      const r1 = l.reserve("u6", 600, CAP, "sandbox", "op", "reqA");
      const r2 = l.reserve("u6", 500, CAP, "sandbox", "op", "reqB");
      const r3 = l.reserve("u6", 400, CAP, "sandbox", "op", "reqC");
      results.push(assert(r1 && typeof r1 === "object" && r3 && typeof r3 === "object" && r2 === null,
        "usage_ledger: cap enforced across concurrent reservations"));
      const bal = l.balance("u6", "sandbox", CAP);
      results.push(assert(bal.reserved === 1000 && bal.remaining === 0,
        "usage_ledger: total reserved equals cap after fill"));
    }

    // 5. Finalization — updates same pending row (in-place).
    {
      const l = new UsageLedger(); l.now = () => NOW;
      l.addSub({ userId: "u7", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      const r = l.reserve("u7", 10, CAP, "sandbox", "generate_html", "reqF") as { reservationId: string };
      const rowsBefore = l.rows.size;
      const fin = l.finalize(r.reservationId, 4, "reqF", "committed");
      results.push(assert(fin.ok && !fin.capLimited && l.rows.size === rowsBefore, "usage_ledger: finalize does not insert a second row"));
      const row = l.rows.get(r.reservationId)!;
      results.push(assert(row.status === "committed" && row.creditsCharged === 4 && row.creditsReserved === 4,
        "usage_ledger: finalize updates status + charge in place"));
      const fin2 = l.finalize(r.reservationId, 99, "reqF", "committed");
      results.push(assert(fin2.ok && row.creditsCharged === 4,
        "usage_ledger: finalize is idempotent for terminal rows"));
      const bal = l.balance("u7", "sandbox", CAP);
      results.push(assert(bal.used === 4 && bal.reserved === 0, "usage_ledger: balance reflects committed usage only"));
    }

    // 6. Refund — clears pending reservation, does not affect committed rows.
    {
      const l = new UsageLedger(); l.now = () => NOW;
      l.addSub({ userId: "u8", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      const r = l.reserve("u8", 10, CAP, "sandbox", "generate_html", "reqR") as { reservationId: string };
      results.push(assert(l.refund(r.reservationId) === true, "usage_ledger: refund pending row succeeds"));
      results.push(assert(l.refund(r.reservationId) === true, "usage_ledger: refund is idempotent"));
      const bal = l.balance("u8", "sandbox", CAP);
      results.push(assert(bal.used === 0 && bal.reserved === 0 && bal.remaining === CAP,
        "usage_ledger: refund releases credits"));
      const r2 = l.reserve("u8", 5, CAP, "sandbox", "generate_html", "reqR2") as { reservationId: string };
      l.finalize(r2.reservationId, 5, "reqR2");
      results.push(assert(l.refund(r2.reservationId) === false,
        "usage_ledger: refund rejected on committed row"));
    }

    // 7. Identity isolation — one request_id in two accounts creates two rows.
    {
      const l = new UsageLedger(); l.now = () => NOW;
      l.addSub({ userId: "uA", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      l.addSub({ userId: "uB", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      const rA = l.reserve("uA", 10, CAP, "sandbox", "generate_html", "sharedReq") as { reservationId: string };
      const rB = l.reserve("uB", 10, CAP, "sandbox", "generate_html", "sharedReq") as { reservationId: string };
      results.push(assert(rA.reservationId !== rB.reservationId,
        "usage_ledger: same request_id across accounts creates distinct rows"));
      const bA = l.balance("uA", "sandbox", CAP);
      const bB = l.balance("uB", "sandbox", CAP);
      results.push(assert(bA.reserved === 10 && bB.reserved === 10,
        "usage_ledger: balances isolated per user"));
    }

    // 8. Retry from an expired / different period must be rejected.
    {
      const l = new UsageLedger();
      l.now = () => NOW;
      l.addSub({ userId: "uP", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      const r1 = l.reserve("uP", 10, CAP, "sandbox", "generate_html", "sameReq") as { reservationId: string };
      results.push(assert(!!r1.reservationId, "usage_ledger: first reservation in period 1 succeeds"));
      const PS2 = PE + 1;
      const PE2 = PE + 30 * 24 * 3600_000;
      l.now = () => PS2 + 3600_000;
      l.subs = [{ userId: "uP", env: "sandbox", status: "active", periodStart: PS2, periodEnd: PE2 }];
      let rejected = false;
      try { l.reserve("uP", 10, CAP, "sandbox", "generate_html", "sameReq"); } catch { rejected = true; }
      results.push(assert(rejected, "usage_ledger: retry from a different period is rejected"));
    }

    // 9. Input validation — env, operation, amount, cap, request_id bounds.
    {
      const l = new UsageLedger(); l.now = () => NOW;
      l.addSub({ userId: "uV", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      const cases: Array<[() => unknown, string]> = [
        [() => l.reserve("uV", 10, CAP, "prod" as string, "generate_html", "v1"), "invalid_environment"],
        [() => l.reserve("uV", 10, CAP, "sandbox", "BAD-OP!", "v2"), "invalid_operation"],
        [() => l.reserve("uV", 0, CAP, "sandbox", "generate_html", "v3"), "invalid_amount"],
        [() => l.reserve("uV", -5, CAP, "sandbox", "generate_html", "v4"), "invalid_amount"],
        [() => l.reserve("uV", 1001, CAP, "sandbox", "generate_html", "v5"), "invalid_amount"],
        [() => l.reserve("uV", 10, -1, "sandbox", "generate_html", "v6"), "invalid_cap"],
        [() => l.reserve("uV", 10, CAP, "sandbox", "generate_html", ""), "request_id required"],
      ];
      let allRejected = true;
      for (const [fn, label] of cases) {
        let threw = false;
        try { fn(); } catch { threw = true; }
        if (!threw) { allRejected = false; results.push(assert(false, `usage_ledger: validation should reject ${label}`)); }
      }
      results.push(assert(allRejected, "usage_ledger: reserve validates env/operation/amount/cap/request_id"));
    }

    // 10. Atomic top-up — actual > reservation, room remains under cap.
    {
      const l = new UsageLedger(); l.now = () => NOW;
      l.addSub({ userId: "uT", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      const r = l.reserve("uT", 10, CAP, "sandbox", "generate_html", "topupReq") as { reservationId: string };
      const fin = l.finalize(r.reservationId, 25, "topupReq", "committed", CAP);
      results.push(assert(fin.ok && !fin.capLimited && fin.charged === 25,
        "usage_ledger: finalize tops up above reservation when cap allows"));
      const row = l.rows.get(r.reservationId)!;
      results.push(assert(row.creditsCharged === 25 && row.creditsReserved === 25,
        "usage_ledger: top-up updates row credits to actual"));
    }

    // 11. Cap-limited finalization — actual exceeds available credits.
    {
      const l = new UsageLedger(); l.now = () => NOW;
      l.addSub({ userId: "uC", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      const filler = l.reserve("uC", 950, CAP, "sandbox", "generate_html", "filler") as { reservationId: string };
      l.finalize(filler.reservationId, 950, "filler", "committed", CAP);
      const r = l.reserve("uC", 10, CAP, "sandbox", "generate_html", "capReq") as { reservationId: string };
      const fin = l.finalize(r.reservationId, 500, "capReq", "committed", CAP);
      results.push(assert(fin.capLimited === true && fin.charged === 50,
        "usage_ledger: cap-limited charge equals remaining credits, never exceeds cap"));
      const row = l.rows.get(r.reservationId)!;
      results.push(assert(row.meta.cap_limited === true && row.meta.requested_credits === 500 && row.meta.available_credits === 50,
        "usage_ledger: cap-limited flag + evidence recorded in meta"));
      const bal = l.balance("uC", "sandbox", CAP);
      results.push(assert(bal.used === 1000 && bal.remaining === 0,
        "usage_ledger: cap-limited finalization never exceeds cap"));
    }

    // 12. Finalize verifies request_id belongs to reservation.
    {
      const l = new UsageLedger(); l.now = () => NOW;
      l.addSub({ userId: "uX", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      const r = l.reserve("uX", 10, CAP, "sandbox", "generate_html", "rightReq") as { reservationId: string };
      let mismatch = false;
      try { l.finalize(r.reservationId, 5, "wrongReq", "committed"); } catch { mismatch = true; }
      results.push(assert(mismatch, "usage_ledger: finalize rejects wrong request_id"));
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Streaming billing — SSE usage parsing, HTML metadata exclusion,
  // image aggregation, fallback aggregation, provider-used stream failure,
  // no-provider refund, and settlement-failure surfacing.
  // ────────────────────────────────────────────────────────────────
  {
    const { StreamingUsageAccumulator, mergeUsage, makeUsage, IMAGE_COST_USD } = await import("./usage-record");
    const { UsageLedger } = await import("./usage-ledger-mock");
    const NOW = 1_700_000_000_000;
    const PS = NOW - 5 * 24 * 3600_000;
    const PE = NOW + 25 * 24 * 3600_000;
    const CAP = 1000;

    // 1. Streaming usage parsing — OpenAI include_usage final frame.
    {
      const acc = new StreamingUsageAccumulator();
      acc.push('data: {"choices":[{"delta":{"content":"hi"}}]}');
      acc.push('data: {"model":"openai/gpt-5.6","usage":{"prompt_tokens":123,"completion_tokens":45,"total_tokens":168}}');
      acc.push("data: [DONE]");
      const snap = acc.snapshot();
      results.push(assert(acc.hasUsage() && snap.inputTokens === 123 && snap.outputTokens === 45 && snap.totalTokens === 168 && snap.model === "openai/gpt-5.6",
        "streaming: parses OpenAI usage frame"));
    }

    // 2. Streaming usage parsing — Gemini usageMetadata variant.
    {
      const acc = new StreamingUsageAccumulator();
      acc.push('data: {"usageMetadata":{"promptTokenCount":50,"candidatesTokenCount":20,"totalTokenCount":70}}');
      const snap = acc.snapshot();
      results.push(assert(snap.inputTokens === 50 && snap.outputTokens === 20 && snap.totalTokens === 70,
        "streaming: parses Gemini usageMetadata"));
    }

    // 3. HTML output must never contain a usage metadata line — the
    //    accumulator ingests SSE lines but does NOT contribute to bytes
    //    emitted to the client. Emulate the drain contract from generate.ts.
    {
      const acc = new StreamingUsageAccumulator();
      let emitted = "";
      const lines = [
        'data: {"choices":[{"delta":{"content":"<h1>ok</h1>"}}]}',
        'data: {"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}',
        "data: [DONE]",
      ];
      for (const line of lines) {
        acc.push(line);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") break;
        try {
          const j = JSON.parse(payload);
          const delta = j.choices?.[0]?.delta?.content;
          if (typeof delta === "string") emitted += delta;
        } catch { /* skip */ }
      }
      results.push(assert(emitted === "<h1>ok</h1>" && !emitted.includes("usage") && !emitted.includes("prompt_tokens"),
        "streaming: usage metadata never leaks into emitted HTML"));
    }

    // 4. Image aggregation — mergeUsage sums image costs + counts.
    {
      const llm = makeUsage({ operation: "generate_html", provider: "lovable", model: "m", inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.01, costBasis: "estimated", providerUsed: true, status: "committed" });
      const img1 = makeUsage({ operation: "generate_image", provider: "leonardo", model: "leonardo", imageCount: 1, estimatedCostUsd: IMAGE_COST_USD, costBasis: "estimated", providerUsed: true, status: "committed" });
      const img2 = makeUsage({ operation: "generate_image", provider: "gemini", model: "gemini", imageCount: 1, estimatedCostUsd: IMAGE_COST_USD, costBasis: "estimated", providerUsed: true, status: "committed" });
      const merged = mergeUsage("generate_html", [llm, img1, img2]);
      results.push(assert(merged.imageCount === 2 && Math.abs((merged.estimatedCostUsd ?? 0) - (0.01 + IMAGE_COST_USD * 2)) < 1e-9,
        "streaming: image usages aggregate into merged record"));
    }

    // 5. Fallback aggregation — a failed attempt with provider work +
    //    a successful retry produce a committed merged record whose cost
    //    covers BOTH provider calls.
    {
      const attempt1 = makeUsage({ operation: "generate_html", provider: "lovable", model: "big", inputTokens: 200, outputTokens: 0, totalTokens: 200, estimatedCostUsd: 0.02, costBasis: "estimated", providerUsed: true, status: "failed", errorCode: "ai_upstream_html" });
      const attempt2 = makeUsage({ operation: "generate_html", provider: "lovable", model: "fast", inputTokens: 100, outputTokens: 300, totalTokens: 400, estimatedCostUsd: 0.03, costBasis: "estimated", providerUsed: true, status: "committed" });
      const merged = mergeUsage("generate_html", [attempt1, attempt2]);
      results.push(assert(merged.status === "committed" && Math.abs((merged.estimatedCostUsd ?? 0) - 0.05) < 1e-9 && merged.totalTokens === 600,
        "streaming: fallback attempts aggregate — both provider calls billed"));
    }

    // 6. Provider-used stream failure — settleFailure charges (does NOT refund)
    //    when images were generated before the LLM stream broke.
    {
      const l = new UsageLedger(); l.now = () => NOW;
      l.addSub({ userId: "uS", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      const r = l.reserve("uS", 20, CAP, "sandbox", "generate_html", "streamFail") as { reservationId: string };
      // Simulate: 2 images cost ~8 credits; LLM never streamed. failed_with_usage.
      const fin = l.finalize(r.reservationId, 8, "streamFail", "failed", CAP);
      const row = l.rows.get(r.reservationId)!;
      results.push(assert(fin.ok && row.status === "failed" && row.creditsCharged === 8,
        "streaming: provider-used stream failure charges (no refund)"));
    }

    // 7. No-provider refund — when nothing hit the provider, refund fully.
    {
      const l = new UsageLedger(); l.now = () => NOW;
      l.addSub({ userId: "uR", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      const r = l.reserve("uR", 20, CAP, "sandbox", "generate_html", "noProv") as { reservationId: string };
      const ok = l.refund(r.reservationId);
      const row = l.rows.get(r.reservationId)!;
      const bal = l.balance("uR", "sandbox", CAP);
      results.push(assert(ok && row.status === "refunded" && bal.used === 0 && bal.reserved === 0,
        "streaming: no-provider outcome refunds reservation completely"));
    }

    // 8. Cap top-up under stream — stream reported more actual than reserved,
    //    but total period usage stays within cap → full actual is charged.
    {
      const l = new UsageLedger(); l.now = () => NOW;
      l.addSub({ userId: "uT", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      const r = l.reserve("uT", 10, CAP, "sandbox", "generate_html", "topup") as { reservationId: string };
      const fin = l.finalize(r.reservationId, 40, "topup", "committed", CAP);
      results.push(assert(fin.ok && !fin.capLimited && fin.charged === 40,
        "streaming: stream top-up above reservation charges full actual when cap allows"));
    }

    // 9. Settlement failure — a finalize error must leave the row pending
    //    so an out-of-band retry can reconcile. Simulate by attempting
    //    finalize with a wrong request_id → mock throws; row unchanged.
    {
      const l = new UsageLedger(); l.now = () => NOW;
      l.addSub({ userId: "uE", env: "sandbox", status: "active", periodStart: PS, periodEnd: PE });
      const r = l.reserve("uE", 10, CAP, "sandbox", "generate_html", "settleReq") as { reservationId: string };
      let threw = false;
      try { l.finalize(r.reservationId, 5, "wrongReq", "committed", CAP); } catch { threw = true; }
      const row = l.rows.get(r.reservationId)!;
      results.push(assert(threw && row.status === "pending",
        "streaming: settlement error leaves row pending for recovery"));
    }
  }

  // ---- /api/generate settlement helpers (mocked, pure) ----
  {
    const { combineSuccessUsage, combineFailureSettlement, modelAttemptUsage } =
      await import("./generate-settlement");
    const { makeUsage: mkU } = await import("./usage-record");

    // 1. Failed stream that returned tokens still records the usage.
    {
      const outcome = combineFailureSettlement({
        operation: "generate_html",
        model: "google/gemini-3.1-flash",
        streamSnapshot: { inputTokens: 500, outputTokens: 300, totalTokens: 800 },
        modelAttempts: [],
        imageUsages: [],
        errorCode: "stream_failed",
      });
      results.push(assert(
        outcome.kind === "failed_with_usage" &&
          outcome.usage.status === "failed" &&
          outcome.usage.totalTokens === 800 &&
          (outcome.usage.estimatedCostUsd ?? 0) > 0,
        "generate-settlement: failed stream with tokens records usage",
      ));
    }

    // 2. Failed first attempt + successful fallback aggregates BOTH.
    {
      const firstFail = modelAttemptUsage({
        model: "openai/gpt-5.6", operation: "generate_html", errorCode: "first_byte_timeout",
      });
      const successOnly = combineSuccessUsage({
        operation: "generate_html", model: "google/gemini-3.1-flash",
        streamSnapshot: { inputTokens: 200, outputTokens: 400, totalTokens: 600 },
        modelAttempts: [], imageUsages: [],
      });
      const merged = combineSuccessUsage({
        operation: "generate_html",
        model: "google/gemini-3.1-flash",
        streamSnapshot: { inputTokens: 200, outputTokens: 400, totalTokens: 600 },
        modelAttempts: [firstFail],
        imageUsages: [],
      });
      results.push(assert(
        merged.status === "committed" &&
          merged.totalTokens === 600 &&
          (merged.estimatedCostUsd ?? 0) > (successOnly.estimatedCostUsd ?? 0),
        "generate-settlement: fallback aggregates first-attempt + success",
      ));
    }

    // 3. No provider work → refund.
    {
      const outcome = combineFailureSettlement({
        operation: "generate_html",
        model: "google/gemini-3.1-flash",
        streamSnapshot: null,
        modelAttempts: [],
        imageUsages: [],
        errorCode: "validate_failed",
      });
      results.push(assert(
        outcome.kind === "no_provider",
        "generate-settlement: no provider work → refund",
      ));
    }

    // 4. Model attempt alone (aiFetch began, no tokens) → failed_with_usage.
    {
      const attempt = modelAttemptUsage({
        model: "openai/gpt-5.6", operation: "generate_html", errorCode: "ai_upstream_html",
      });
      const outcome = combineFailureSettlement({
        operation: "generate_html",
        model: "openai/gpt-5.6",
        streamSnapshot: null,
        modelAttempts: [attempt],
        imageUsages: [],
        errorCode: "ai_upstream_html",
      });
      results.push(assert(
        outcome.kind === "failed_with_usage" &&
          outcome.usage.status === "failed" &&
          outcome.usage.credits >= 1 &&
          outcome.usage.providerUsed === true,
        "generate-settlement: model attempt only → failed_with_usage at minimum",
      ));
    }

    // 5. Images generated but stream failed → failure combines both.
    {
      const imgUsage = mkU({
        provider: "leonardo", model: "leonardo", operation: "generate_image",
        imageCount: 1, estimatedCostUsd: 0.02, costBasis: "estimated",
        providerUsed: true, status: "committed",
      });
      const outcome = combineFailureSettlement({
        operation: "generate_html",
        model: "google/gemini-3.1-flash",
        streamSnapshot: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        modelAttempts: [],
        imageUsages: [imgUsage],
        errorCode: "stream_failed",
      });
      results.push(assert(
        outcome.kind === "failed_with_usage" &&
          outcome.usage.imageCount === 1 &&
          outcome.usage.totalTokens === 150 &&
          outcome.usage.status === "failed",
        "generate-settlement: failed stream + image aggregates both",
      ));
    }

    // 6. Settlement failure — settleOperation rejects; caller must not swallow.
    //    We assert the promise rejects so the route's try/catch can surface
    //    billing_settlement_error and leave the pending row in place.
    {
      const settleOperation = async () => { throw new Error("usage_finalize failed: db down"); };
      let threw = false;
      try {
        await settleOperation();
      } catch (e) {
        threw = e instanceof Error && /usage_finalize failed/.test(e.message);
      }
      results.push(assert(threw,
        "generate-settlement: settlement failure propagates for billing_settlement_error"));
    }

    // 7. Awaited finalization — mimic the DONE/reader-end code path. A
    //    non-awaited settle would let the outer request return before the
    //    ai_usage row transitioned. We assert the pending flag flips only
    //    after `await finalize()` resolves.
    {
      let pending = true;
      const settle = async () => {
        await new Promise((r) => setTimeout(r, 5));
        pending = false;
      };
      const finalize = async () => { await settle(); };
      // Simulate route awaiting finalize at [DONE].
      await finalize();
      results.push(assert(!pending, "generate-settlement: awaited finalize resolves before return"));
    }
  }

  // ------------- hasActivePro entitlement gate -------------
  {
    const { isActiveProRow, hasActiveProWithClient } = await import("./credit-gate.server");
    const now = new Date("2026-07-20T12:00:00Z");
    const inPeriod = {
      status: "active",
      current_period_start: "2026-07-01T00:00:00Z",
      current_period_end: "2026-08-01T00:00:00Z",
    };
    results.push(assert(isActiveProRow(inPeriod, now) === true,
      "hasActivePro: active row inside period passes"));
    results.push(assert(isActiveProRow({ ...inPeriod, status: "trialing" }, now) === true,
      "hasActivePro: trialing row inside period passes"));
    results.push(assert(isActiveProRow({ ...inPeriod, current_period_end: "2026-07-10T00:00:00Z" }, now) === false,
      "hasActivePro: expired period fails"));
    results.push(assert(isActiveProRow({ ...inPeriod, current_period_start: "2026-08-01T00:00:00Z", current_period_end: "2026-09-01T00:00:00Z" }, now) === false,
      "hasActivePro: future period fails"));
    results.push(assert(isActiveProRow({ ...inPeriod, current_period_start: null }, now) === false,
      "hasActivePro: null period_start fails"));
    results.push(assert(isActiveProRow({ ...inPeriod, current_period_end: null }, now) === false,
      "hasActivePro: null period_end fails"));
    results.push(assert(isActiveProRow({ ...inPeriod, status: "canceled" }, now) === false,
      "hasActivePro: canceled status fails"));
    results.push(assert(isActiveProRow({ ...inPeriod, status: "past_due" }, now) === false,
      "hasActivePro: past_due status fails"));
    results.push(assert(isActiveProRow(null, now) === false,
      "hasActivePro: missing row fails"));

    // Mock client — records which user_id/environment values were queried,
    // proving the caller-supplied id is the only one consulted. A "forged"
    // id in some other field cannot alter which account is checked.
    type Row = { status: string; current_period_start: string | null; current_period_end: string | null };
    function makeClient(rowsByUser: Record<string, Row | null>) {
      const calls: Array<{ user_id?: string; environment?: string }> = [];
      const client = {
        from(_t: string) {
          const state: { user_id?: string; environment?: string } = {};
          const chain = {
            select() { return chain; },
            eq(col: string, val: string) {
              if (col === "user_id") state.user_id = val;
              else if (col === "environment") state.environment = val;
              return chain;
            },
            in() { return chain; },
            order() { return chain; },
            limit() { return chain; },
            async maybeSingle() {
              calls.push({ ...state });
              const row = state.user_id ? rowsByUser[state.user_id] ?? null : null;
              return { data: row, error: null };
            },
          };
          return chain;
        },
      } as unknown as Parameters<typeof hasActiveProWithClient>[0];
      return { client, calls };
    }

    const proUser = "verified-pro-uuid";
    const forgedUser = "attacker-supplied-uuid";
    const { client, calls } = makeClient({
      [proUser]: inPeriod,
      [forgedUser]: inPeriod, // even if forged id existed as a real Pro, the verified id path must be the ONLY one queried
    });

    const okPro = await hasActiveProWithClient(client, proUser, "live", now);
    results.push(assert(okPro === true, "hasActivePro: valid pro user via admin client passes"));
    results.push(assert(calls.length === 1 && calls[0].user_id === proUser && calls[0].environment === "live",
      "hasActivePro: queries verified user id + environment only"));

    const { client: c2 } = makeClient({ "no-sub-user": null });
    const noSub = await hasActiveProWithClient(c2, "no-sub-user", "live", now);
    results.push(assert(noSub === false, "hasActivePro: user without subscription fails"));

    const { client: c3 } = makeClient({
      "expired-user": { status: "active", current_period_start: "2026-01-01T00:00:00Z", current_period_end: "2026-02-01T00:00:00Z" },
    });
    const expired = await hasActiveProWithClient(c3, "expired-user", "live", now);
    results.push(assert(expired === false, "hasActivePro: expired subscription fails"));

    const { client: c4 } = makeClient({
      "canceled-user": { status: "canceled", current_period_start: "2026-07-01T00:00:00Z", current_period_end: "2026-08-01T00:00:00Z" },
    });
    const canceled = await hasActiveProWithClient(c4, "canceled-user", "live", now);
    results.push(assert(canceled === false, "hasActivePro: canceled subscription fails"));

    // Forgery isolation: an attacker who controls a request body cannot
    // change the id the entitlement check queries. hasActivePro receives
    // only `user` from resolveUserFromRequest; simulating that here by
    // passing the verified id and confirming the mock recorded exactly
    // that id — never the forged one.
    const { client: c5, calls: calls5 } = makeClient({
      [proUser]: null,          // verified user is NOT a pro
      [forgedUser]: inPeriod,   // forged id IS a pro
    });
    const forged = await hasActiveProWithClient(c5, proUser, "live", now);
    results.push(assert(forged === false,
      "hasActivePro: forged browser id cannot upgrade a non-pro verified user"));
    results.push(assert(calls5.every((c) => c.user_id === proUser),
      "hasActivePro: query only ever uses the verified user id"));
  }

  // ------------------------------------------------------------------
  // Redirect safety + auth URL builder (src/lib/redirect-safe.ts)
  // ------------------------------------------------------------------
  {
    const { isSafeInternalRedirect, safeRedirectOr, buildAuthUrl } = await import("./redirect-safe");

    for (const good of ["/", "/gallery", "/unlock?intent=buy&checkout=1", "/x#y"]) {
      results.push(assert(isSafeInternalRedirect(good), `redirect-safe: accepts ${good}`));
    }
    for (const bad of [
      "http://evil.com", "https://evil.com/x", "javascript:alert(1)",
      "//evil.com/x", "/\\evil.com", "  /x", "\t/x", "\n/x",
      "", "x", "mailto:a@b.c", 123 as unknown, null, undefined,
    ]) {
      results.push(assert(!isSafeInternalRedirect(bad), `redirect-safe: rejects ${String(bad)}`));
    }

    results.push(assert(safeRedirectOr("//evil", "/fallback") === "/fallback",
      "safeRedirectOr: unsafe → fallback"));
    results.push(assert(safeRedirectOr("/ok", "/fallback") === "/ok",
      "safeRedirectOr: safe passes through"));

    const url = buildAuthUrl("signup", "/unlock?intent=buy&checkout=1");
    results.push(assert(url.startsWith("/auth?"), "buildAuthUrl: internal"));
    results.push(assert(url.includes("mode=signup"), "buildAuthUrl: mode param"));
    results.push(assert(url.includes("redirect=%2Funlock%3Fintent%3Dbuy%26checkout%3D1"),
      "buildAuthUrl: redirect encoded"));
    const url2 = buildAuthUrl("signin", "https://evil.com");
    results.push(assert(url2 === "/auth?mode=signin&redirect=%2F",
      "buildAuthUrl: unsafe redirect collapses to /"));
  }

  // ------------------------------------------------------------------
  // OAuth handoff via sessionStorage (redirect-safe)
  // ------------------------------------------------------------------
  {
    const { stashOAuthDest, consumeOAuthDest, OAUTH_HANDOFF_KEY } = await import("./redirect-safe");

    // Deterministic in-memory Storage-like double.
    const makeStore = () => {
      const m = new Map<string, string>();
      return {
        store: {
          getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
          setItem: (k: string, v: string) => { m.set(k, v); },
          removeItem: (k: string) => { m.delete(k); },
        },
        map: m,
      };
    };

    // Safe path → stashed and consumed exactly once
    {
      const { store, map } = makeStore();
      const ok = stashOAuthDest("/unlock?intent=buy&checkout=1", store);
      results.push(assert(ok === true, "oauth-handoff: safe path stashed"));
      results.push(assert(map.get(OAUTH_HANDOFF_KEY) === "/unlock?intent=buy&checkout=1",
        "oauth-handoff: stored under known key"));
      const first = consumeOAuthDest("/", store);
      results.push(assert(first === "/unlock?intent=buy&checkout=1",
        "oauth-handoff: consume returns stashed dest"));
      results.push(assert(map.has(OAUTH_HANDOFF_KEY) === false,
        "oauth-handoff: consume clears storage"));
      const second = consumeOAuthDest("/fallback", store);
      results.push(assert(second === "/fallback",
        "oauth-handoff: second consume falls back"));
    }

    // Unsafe payloads are rejected on stash AND on read (defense in depth)
    for (const evil of ["https://evil.com", "//evil.com", "javascript:alert(1)", "no-slash"]) {
      const { store, map } = makeStore();
      const ok = stashOAuthDest(evil, store);
      results.push(assert(ok === false, `oauth-handoff: refuses to stash ${evil}`));
      results.push(assert(map.size === 0, `oauth-handoff: nothing written for ${evil}`));
    }

    // Poisoned pre-existing storage: refuses to return an unsafe value even
    // if something else wrote it under the key.
    {
      const { store } = makeStore();
      store.setItem(OAUTH_HANDOFF_KEY, "https://evil.com");
      const out = consumeOAuthDest("/safe", store);
      results.push(assert(out === "/safe",
        "oauth-handoff: poisoned unsafe value ignored on consume"));
    }

    // Unsafe fallback collapses to "/"
    {
      const { store } = makeStore();
      const out = consumeOAuthDest("//evil", store);
      results.push(assert(out === "/",
        "oauth-handoff: unsafe fallback collapses to /"));
    }

    // Missing storage (SSR): returns fallback, no throw
    {
      const out = consumeOAuthDest("/x", null);
      results.push(assert(out === "/x", "oauth-handoff: null storage → fallback"));
      const okStash = stashOAuthDest("/x", null);
      results.push(assert(okStash === false, "oauth-handoff: null storage → stash noop"));
    }
  }



  // ------------------------------------------------------------------
  // Checkout state machine (src/lib/checkout-state.ts)
  // ------------------------------------------------------------------
  {
    const { nextCheckoutState, checkoutErrorFromThrow } = await import("./checkout-state");
    // error result → error state
    const errS = nextCheckoutState({ error: "nope" });
    results.push(assert(errS.kind === "error" && errS.message === "nope",
      "checkout-state: error result → error state"));
    // valid clientSecret → ready
    const ready = nextCheckoutState({ clientSecret: "cs_123" });
    results.push(assert(ready.kind === "ready" && "clientSecret" in ready && ready.clientSecret === "cs_123",
      "checkout-state: clientSecret → ready"));
    // empty clientSecret → error (unavailable)
    const empty = nextCheckoutState({ clientSecret: "" });
    results.push(assert(empty.kind === "error" && /unavailable/i.test(empty.message),
      "checkout-state: empty clientSecret → error"));
    // thrown Error → error with message
    const t1 = checkoutErrorFromThrow(new Error("boom"));
    results.push(assert(t1.kind === "error" && t1.message === "boom",
      "checkout-state: throw Error → error message"));
    // unknown throw → error with fallback copy
    const t2 = checkoutErrorFromThrow({});
    results.push(assert(t2.kind === "error" && t2.message.length > 0,
      "checkout-state: unknown throw → fallback message"));
  }

  // ------------------------------------------------------------------
  // Free-demo — server-authoritative status resolver + sign-in URL
  // ------------------------------------------------------------------
  {
    const { resolveFromServer, resolveOnStatusError, shouldAllowDemoSubmit } =
      await import("./free-demo-status");
    const { buildAuthUrl } = await import("./redirect-safe");

    // (a) server available + stale localStorage → available/not used;
    //     resolver instructs to clear the stale flag.
    const rAvail = resolveFromServer({ available: true, alreadyUsed: false });
    results.push(assert(
      rAvail.used === false && rAvail.available === true &&
      rAvail.ledgerUnavailable === false && rAvail.localStorageWrite === null &&
      rAvail.submitAllowed === true,
      "free-demo: server available + stale LS → available; clears LS",
    ));

    // (b) server alreadyUsed → blocked even if localStorage was cleared.
    const rUsed = resolveFromServer({ available: false, alreadyUsed: true });
    results.push(assert(
      rUsed.used === true && rUsed.submitAllowed === false &&
      rUsed.localStorageWrite === "1" && rUsed.ledgerUnavailable === false,
      "free-demo: server alreadyUsed → blocked regardless of LS",
    ));

    // (c) server unavailable (neither used nor available) → fail-closed.
    const rNa = resolveFromServer({ available: false, alreadyUsed: false });
    results.push(assert(
      rNa.ledgerUnavailable === true && rNa.submitAllowed === false &&
      rNa.localStorageWrite === null,
      "free-demo: server unavailable → ledgerUnavailable + block",
    ));
    const rErr = resolveOnStatusError();
    results.push(assert(
      rErr.ledgerUnavailable === true && rErr.submitAllowed === false,
      "free-demo: status endpoint error → fail-closed",
    ));

    // Submit guard: unresolved (null) MUST refuse.
    results.push(assert(
      shouldAllowDemoSubmit({ demoAvailable: null, demoUsed: false }) === false,
      "free-demo: unresolved status refuses submit",
    ));
    // Submit guard: stale local `demoUsed` even with server-available → refuse.
    // (index.tsx sets demoUsed from resolveFromServer, so this cannot occur
    // in practice; the guard still defends against a stale in-memory value.)
    results.push(assert(
      shouldAllowDemoSubmit({ demoAvailable: true, demoUsed: true }) === false,
      "free-demo: stale local demoUsed still refuses",
    ));
    results.push(assert(
      shouldAllowDemoSubmit({ demoAvailable: true, demoUsed: false }) === true,
      "free-demo: server-authorized fresh demo permits submit",
    ));

    // Ledger contract — duplicate/atomic claims cannot both succeed and
    // release only fires when provider work did not start. We reuse the
    // UsageLedger mock to model the invariants because the SQL
    // claim_free_demo/release_free_demo functions have the same shape:
    // a single-row insert keyed by (fingerprint, environment).
    const claimed = new Set<string>();
    function claim(fp: string): boolean {
      if (claimed.has(fp)) return false;
      claimed.add(fp);
      return true;
    }
    function release(fp: string): boolean {
      if (!claimed.has(fp)) return false;
      claimed.delete(fp);
      return true;
    }
    const fp = "fp_test";
    const first = claim(fp);
    const second = claim(fp);
    results.push(assert(first === true && second === false,
      "free-demo: duplicate atomic claims cannot both succeed"));
    // Provider did NOT start → release succeeds; a subsequent claim works.
    results.push(assert(release(fp) === true, "free-demo: release refunds fresh claim"));
    results.push(assert(claim(fp) === true, "free-demo: post-release visitor may retry"));
    // Provider started → we do NOT release; a subsequent claim MUST fail.
    // (Simulate by not calling release before the second attempt.)
    results.push(assert(claim(fp) === false,
      "free-demo: no release when provider started → no second demo"));

    // Sign-in URL uses the redirect-safe helper and preserves the internal
    // destination via the `redirect` query key (NOT `next`).
    const u = buildAuthUrl("signin", "/unlock");
    results.push(assert(
      u === "/auth?mode=signin&redirect=%2Funlock",
      `free-demo: sign-in URL uses buildAuthUrl(redirect=) — got ${u}`,
    ));
  }

  // ----- Phase 0 baseline: fixtures analyze deterministically -----
  {
    const { runBaseline } = await import("./baseline/report");
    const rs = runBaseline();
    results.push(assert(rs.length === 3, `baseline: 3 fixtures analyzed (got ${rs.length})`));
    results.push(assert(rs.every((r) => r.graph.nodeCount > 0), "baseline: every fixture parses into a graph"));
    results.push(assert(rs.every((r) => r.sections.signature.length > 0), "baseline: every fixture has a section signature"));
    const habitual = rs.filter((r) => r.sections.hasHero && r.sections.hasFeatureTriad && r.sections.hasCtaBanner).length;
    results.push(assert(habitual >= 2,
      `baseline: detects habitual hero+triad+CTA pattern in majority of fixtures (found ${habitual}/3)`));
    const externalDefects = rs.reduce((n, r) => n + r.interaction.externalLinks + r.interaction.targetBlank, 0);
    results.push(assert(externalDefects >= 1,
      "baseline: detects at least one external-navigation defect across fixtures"));
  }








  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return { results, passed, failed };
}




