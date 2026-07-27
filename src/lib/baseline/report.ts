// Generates a human-readable baseline report from analyzed fixtures.
import { analyzeFixture, BASELINE_PROMPTS, type BaselineReport } from "./harness";
import { FIXTURES } from "./fixtures";

export function runBaseline(): BaselineReport[] {
  return FIXTURES.map((f) => {
    const label = BASELINE_PROMPTS.find((p) => p.id === f.promptId)?.label ?? f.promptId;
    return analyzeFixture(f, label);
  });
}

export function formatBaseline(reports: BaselineReport[]): string {
  const lines: string[] = [];
  lines.push("# Cold-build baseline");
  lines.push("");
  lines.push("Source: representative committed fixtures (see `./fixtures.ts`).");
  lines.push("Live provider calls intentionally skipped — no credits, no ledger writes.");
  lines.push("");
  for (const r of reports) {
    lines.push(`## ${r.label}  (\`${r.promptId}\`)`);
    lines.push(`- model: ${r.model ?? "n/a"}  strategy: ${r.strategy ?? "n/a"}  latency: ${r.latencyMs ?? "n/a"}ms`);
    lines.push(`- validation: ${r.validation.status} — ${r.validation.summary}`);
    lines.push(`- section signature: \`${r.sections.signature}\`  headings: ${r.sections.headingCount}  sections: ${r.sections.sectionCount}`);
    lines.push(`- habitual patterns: hero=${r.sections.hasHero}  triad=${r.sections.hasFeatureTriad}  logoStrip=${r.sections.hasLogoStrip}  ctaBanner=${r.sections.hasCtaBanner}`);
    lines.push(`- theme: fonts=[${r.theme.fontFamilies.join(", ")}]  colors=${r.theme.colors.length}  radii=[${r.theme.radii.join(", ")}]  cssVars=${r.theme.hasCssVars}`);
    const i = r.interaction;
    lines.push(`- interaction defects: external=${i.externalLinks}  _blank=${i.targetBlank}  window.open=${i.windowOpenCalls}  location=${i.locationAssignments}  brokenHash=${i.brokenHashLinks}  formExt=${i.formsExternalAction}  deadButtons=${Math.max(0, i.buttons - i.buttonsWithBehavior)}`);
    lines.push(`- notes: ${r.notes.join("; ")}`);
    lines.push("");
  }
  return lines.join("\n");
}
