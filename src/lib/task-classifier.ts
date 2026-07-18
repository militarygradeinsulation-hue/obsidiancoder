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

  if (mode === "chat") return { taskType: "advisory-chat", executionPath: "low-cost-ai", confidence: 1, reason: "Chat mode is advisory." };
  if (mode === "plan") return { taskType: "planning", executionPath: "low-cost-ai", confidence: 1, reason: "Plan mode is advisory." };

  if (!opts.hasHtml) return { taskType: "full-generation", executionPath: "advanced-ai", confidence: 0.9, reason: "No existing document to edit." };

  if (FULLGEN_WORDS.test(p)) return { taskType: "full-generation", executionPath: "advanced-ai", confidence: 0.9, reason: "Rebuild/redesign requested." };
  if (PLAN_WORDS.test(p) && p.length < 200) return { taskType: "planning", executionPath: "low-cost-ai", confidence: 0.7, reason: "Planning keywords." };
  if (CHAT_WORDS.test(p) && p.length < 160 && !FEATURE_WORDS.test(p)) return { taskType: "advisory-chat", executionPath: "low-cost-ai", confidence: 0.7, reason: "Question-style prompt." };

  for (const rx of REPLACE_PATTERNS) {
    if (rx.test(p)) return { taskType: "content-replacement", executionPath: "deterministic", confidence: 0.95, reason: "Explicit replace/change pattern." };
  }

  if (BUG_WORDS.test(p)) return { taskType: "bug-fix", executionPath: "advanced-ai", confidence: 0.7, reason: "Bug-fix language." };
  if (STYLE_WORDS.test(p) && p.length < 220) return { taskType: "style-edit", executionPath: "deterministic", confidence: 0.7, reason: "Style keywords, short prompt." };
  if (LAYOUT_WORDS.test(p)) return { taskType: "layout-edit", executionPath: "low-cost-ai", confidence: 0.6, reason: "Layout keywords." };
  if (COMPONENT_WORDS.test(p)) return { taskType: "component-change", executionPath: "low-cost-ai", confidence: 0.6, reason: "Component keywords." };
  if (FEATURE_WORDS.test(p)) return { taskType: "new-feature", executionPath: "advanced-ai", confidence: 0.7, reason: "Add/create language." };

  // fallback: treat as text edit if short, otherwise full generation
  if (p.length < 120) return { taskType: "text-edit", executionPath: "low-cost-ai", confidence: 0.4, reason: "Short unspecified edit." };
  return { taskType: "new-feature", executionPath: "advanced-ai", confidence: 0.4, reason: "Long unspecified prompt." };
}
