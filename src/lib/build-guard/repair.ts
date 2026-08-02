import type { BuildManifest, BuildPage, Violation } from './types';
import { lintBuild } from './linter';
import { manifestPromptFragment } from './manifest';

/** Repair passes on the cheap model before we stop trusting it. */
export const MAX_REPAIR_PASSES = 3;

/**
 * Caller-supplied repair function. Receives the current pages and a
 * targeted repair prompt; returns repaired pages. In production this
 * wraps a cheap-model completion; in tests it's a stub.
 */
export type RepairFn = (pages: BuildPage[], repairPrompt: string) => Promise<BuildPage[]>;

export interface GuardOutcome {
  /** Final pages: repaired where possible, hard-gated where not. */
  pages: BuildPage[];
  /** Repair passes actually used. */
  passes: number;
  /** Violations still present after gating. Should always be empty. */
  violationsRemaining: Violation[];
  /** Count of elements neutralized by the hard gate. */
  hardGated: number;
  /** True only if the build ended fully working with nothing gated. */
  clean: boolean;
}

/** Targeted repair prompt: only the offenders, plus the contract. */
export function buildRepairPrompt(violations: Violation[], manifest: BuildManifest): string {
  const lines = violations.map(
    (v, i) => `${i + 1}. [${v.cls}] on page ${v.route}: ${v.element} -> ${v.fixHint}`,
  );
  return [
    'Fix ONLY the following broken interactive elements. Change nothing else in the markup.',
    ...lines,
    manifestPromptFragment(manifest),
  ].join('\n');
}

/**
 * Neutralize an offending element: strip its destination and handler,
 * mark it gated, kill pointer events, drop it to 45% opacity. A gated
 * element can never misroute because it can no longer do anything.
 */
function gateElement(tag: string): string {
  let t = tag
    .replace(/\shref\s*=\s*("[^"]*"|'[^']*')/i, '')
    .replace(/\sdata-href\s*=\s*("[^"]*"|'[^']*')/i, '')
    .replace(/\sonclick\s*=\s*("[^"]*"|'[^']*')/i, '')
    .replace(/\saction\s*=\s*("[^"]*"|'[^']*')/i, '');
  const disabled = t.toLowerCase().startsWith('<button') ? ' disabled' : '';
  const inject =
    ` data-guard-gated="1" aria-disabled="true" tabindex="-1"${disabled}` +
    ' style="opacity:.45;pointer-events:none;cursor:default"';
  return t.replace(/>$/, `${inject}>`);
}

/**
 * The full guard: lint, repair up to MAX_REPAIR_PASSES on the cheap
 * model, then hard-gate anything that survives. A build never ships a
 * dead button; worst case it ships a visibly disabled one.
 */
export async function guardBuild(
  pages: BuildPage[],
  manifest: BuildManifest,
  repair?: RepairFn,
): Promise<GuardOutcome> {
  let current: BuildPage[] = pages.map((p) => ({ ...p }));
  let passes = 0;
  let violations = lintBuild(current, manifest);

  while (violations.length > 0 && repair && passes < MAX_REPAIR_PASSES) {
    passes++;
    current = (await repair(current, buildRepairPrompt(violations, manifest))).map((p) => ({ ...p }));
    violations = lintBuild(current, manifest);
  }

  let hardGated = 0;
  if (violations.length > 0) {
    for (const v of violations) {
      const page = current.find((p) => p.route === v.route);
      if (page && page.html.includes(v.element)) {
        page.html = page.html.replace(v.element, gateElement(v.element));
        hardGated++;
      }
    }
    violations = lintBuild(current, manifest);
  }

  return {
    pages: current,
    passes,
    violationsRemaining: violations,
    hardGated,
    clean: violations.length === 0 && hardGated === 0,
  };
}
