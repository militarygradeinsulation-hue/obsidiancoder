// Self-tests — pure module fixtures that verify the build pipeline. No AI
// calls, no network. Runnable via the /api/self-test route.

import { classifyTask } from "./task-classifier";
import { tryDeterministicEdit } from "./deterministic-edits";
import { validateHtml } from "./validation";
import { applyPatch } from "./patch-engine";
import { parsePatchResponse } from "./patch-protocol";
import { planFor } from "./orchestrator";
import { anchorsFromPrompt, budgetSnippets, snippetsAround } from "./context-manager";
import { extractOutline } from "./document-outline";

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

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return { results, passed, failed };
}
