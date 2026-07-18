// Task classifier — decides how a user prompt should be executed.
// No AI call; pure heuristics over the prompt string.

export type TaskType =
  | "text-edit"
  | "style-edit"
  | "layout-edit"
  | "content-replacement"
  | "component-change"
  | "new-feature"
  | "bug-fix"
  | "full-generation"
  | "advisory-chat"
  | "planning";

export type ExecutionPath = "deterministic" | "low-cost-ai" | "advanced-ai";
export type Strategy = "deterministic" | "ai-patch" | "full-generation" | "advisory";

export type Classification = {
  taskType: TaskType;
  executionPath: ExecutionPath;
  strategy: Strategy;
  confidence: number; // 0..1
  reason: string;
};

function strategyFor(taskType: TaskType, executionPath: ExecutionPath, hasHtml: boolean): Strategy {
  if (taskType === "advisory-chat" || taskType === "planning") return "advisory";
  if (executionPath === "deterministic") return "deterministic";
  if (!hasHtml) return "full-generation";
  if (taskType === "full-generation") return "full-generation";
  // ordinary edits/bug-fix/features against existing doc → patch
  return "ai-patch";
}


const STYLE_WORDS = /\b(color|colour|background|bg|font|size|larger|smaller|bigger|padding|margin|spacing|radius|rounded|border|width|height|align|center|centre|left|right|hide|show|visible|invisible|display|bold|italic|underline)\b/i;
const LAYOUT_WORDS = /\b(grid|flex|column|row|stack|reorder|move|swap|top|bottom|sidebar|nav|header|footer|section)\b/i;
const COMPONENT_WORDS = /\b(button|form|input|card|modal|dialog|dropdown|menu|table|list|carousel|tab|accordion)\b/i;
const BUG_WORDS = /\b(fix|broken|not working|doesn'?t work|error|bug|issue|crash|wrong)\b/i;
const FEATURE_WORDS = /\b(add|create|build|implement|introduce|new)\b/i;
const FULLGEN_WORDS = /\b(rebuild|redesign|start over|from scratch|new (site|page|app))\b/i;
const PLAN_WORDS = /\b(plan|outline|architect|strategy|approach|roadmap|design a plan)\b/i;
const CHAT_WORDS = /^(what|why|how|explain|tell me|is |are |can you explain|thoughts|opinion)/i;
const REPLACE_PATTERNS: RegExp[] = [
  /change\s+["']?([^"']+?)["']?\s+to\s+["']?([^"']+?)["']?$/i,
  /replace\s+["']?([^"']+?)["']?\s+with\s+["']?([^"']+?)["']?$/i,
  /rename\s+["']?([^"']+?)["']?\s+to\s+["']?([^"']+?)["']?$/i,
];

export function classifyTask(prompt: string, opts: { mode?: string; hasHtml: boolean }): Classification {
  const p = prompt.trim();
  const mode = (opts.mode ?? "agent").toLowerCase();
  const mk = (
    taskType: TaskType,
    executionPath: ExecutionPath,
    confidence: number,
    reason: string,
  ): Classification => ({
    taskType,
    executionPath,
    strategy: strategyFor(taskType, executionPath, opts.hasHtml),
    confidence,
    reason,
  });

  if (mode === "chat") return mk("advisory-chat", "low-cost-ai", 1, "Chat mode is advisory.");
  if (mode === "plan") return mk("planning", "low-cost-ai", 1, "Plan mode is advisory.");

  if (!opts.hasHtml) return mk("full-generation", "advanced-ai", 0.9, "No existing document to edit.");

  if (FULLGEN_WORDS.test(p)) return mk("full-generation", "advanced-ai", 0.9, "Rebuild/redesign requested.");
  if (PLAN_WORDS.test(p) && p.length < 200) return mk("planning", "low-cost-ai", 0.7, "Planning keywords.");
  if (CHAT_WORDS.test(p) && p.length < 160 && !FEATURE_WORDS.test(p)) return mk("advisory-chat", "low-cost-ai", 0.7, "Question-style prompt.");

  for (const rx of REPLACE_PATTERNS) {
    if (rx.test(p)) return mk("content-replacement", "deterministic", 0.95, "Explicit replace/change pattern.");
  }

  if (BUG_WORDS.test(p)) return mk("bug-fix", "advanced-ai", 0.7, "Bug-fix language.");
  if (STYLE_WORDS.test(p) && p.length < 220) return mk("style-edit", "deterministic", 0.7, "Style keywords, short prompt.");
  if (LAYOUT_WORDS.test(p)) return mk("layout-edit", "low-cost-ai", 0.6, "Layout keywords.");
  if (COMPONENT_WORDS.test(p)) return mk("component-change", "low-cost-ai", 0.6, "Component keywords.");
  if (FEATURE_WORDS.test(p)) return mk("new-feature", "advanced-ai", 0.7, "Add/create language.");

  if (p.length < 120) return mk("text-edit", "low-cost-ai", 0.4, "Short unspecified edit.");
  return mk("new-feature", "advanced-ai", 0.4, "Long unspecified prompt.");
}

