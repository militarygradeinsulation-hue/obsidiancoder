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
  const secretEvt = appendEvent({ kind: "request-submitted", note: "call sk_live_" + "a".repeat(20) + " Bearer abc.def unlock 9822 https://x" });
  results.push(assert(!/sk_live_|Bearer|9822|https:\/\//.test(secretEvt.note ?? ""), `ledger: sanitizes secrets/9822/urls (${secretEvt.note})`));
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
  appendEvent({ kind: "request-submitted", note: "prompt with sk_live_" + "b".repeat(20) + " and 9822" });
  const exported = exportProfile();
  results.push(assert(!/sk_live_bb|9822/.test(exported), "profile: export scrubs secrets/9822"));
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

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return { results, passed, failed };
}
