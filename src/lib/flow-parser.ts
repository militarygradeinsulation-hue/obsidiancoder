// Declarative user-flow parser. Steps are safe strings; execution is
// intentionally deferred (iframe sandbox interaction is unreliable). The
// parser validates syntax so a UI runner can consume it later.

export type FlowStep =
  | { op: "open" }
  | { op: "click"; selector: string }
  | { op: "type"; selector: string; text: string }
  | { op: "submit"; selector: string }
  | { op: "wait"; ms: number }
  | { op: "assertText"; selector: string; text: string }
  | { op: "assertUrl"; url: string }
  | { op: "assertNoConsoleErrors" };

const MAX_STEPS = 40;
const MAX_STR = 200;

function safeStr(s: string): string {
  return s.trim().replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").slice(0, MAX_STR);
}

/** Parse a plain-text DSL, one step per line. Returns steps and per-line errors. */
export function parseFlow(input: string): { steps: FlowStep[]; errors: { line: number; message: string }[] } {
  const lines = (input || "").split(/\r?\n/);
  const steps: FlowStep[] = [];
  const errors: { line: number; message: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (steps.length >= MAX_STEPS) { errors.push({ line: i + 1, message: "step limit reached" }); break; }
    const raw = lines[i].trim();
    if (!raw || raw.startsWith("#")) continue;
    const [op, ...rest] = raw.split(/\s+/);
    const args = rest.join(" ");
    try {
      switch (op.toLowerCase()) {
        case "open": steps.push({ op: "open" }); break;
        case "click": if (!args) throw new Error("click needs selector"); steps.push({ op: "click", selector: safeStr(args) }); break;
        case "type": {
          const m = /^(\S+)\s+"([^"]*)"$/.exec(args); if (!m) throw new Error(`type needs: <selector> "text"`);
          steps.push({ op: "type", selector: safeStr(m[1]), text: safeStr(m[2]) }); break;
        }
        case "submit": if (!args) throw new Error("submit needs selector"); steps.push({ op: "submit", selector: safeStr(args) }); break;
        case "wait": { const n = parseInt(args, 10); if (!Number.isFinite(n) || n < 0 || n > 30_000) throw new Error("wait ms 0-30000"); steps.push({ op: "wait", ms: n }); break; }
        case "asserttext": {
          const m = /^(\S+)\s+"([^"]*)"$/.exec(args); if (!m) throw new Error(`assertText needs: <selector> "text"`);
          steps.push({ op: "assertText", selector: safeStr(m[1]), text: safeStr(m[2]) }); break;
        }
        case "asserturl": if (!args) throw new Error("assertUrl needs url"); steps.push({ op: "assertUrl", url: safeStr(args) }); break;
        case "assertnoconsoleerrors": steps.push({ op: "assertNoConsoleErrors" }); break;
        default: throw new Error(`unknown op: ${op}`);
      }
    } catch (e) {
      errors.push({ line: i + 1, message: (e as Error).message });
    }
  }
  return { steps, errors };
}
