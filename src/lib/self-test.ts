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
  const amb = { summary: "amb", operations: [{ op: "replace_text" as const, find: "x", replace: "y", allow_multiple: false }] };
  const ambResult = applyPatch("<html><body>x x</body></html>", amb);
  results.push(assert(!ambResult.ok, "patch engine: ambiguous anchor rejected"));

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return { results, passed, failed };
}
