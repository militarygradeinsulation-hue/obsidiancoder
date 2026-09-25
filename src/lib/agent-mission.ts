// Deterministic mission decomposition for the Agent workspace. No model call,
// no pretend autonomy: every role is marked as available now (backed by a
// real Studio capability) or not connected yet.

export type AgentRole =
  | "Architect" | "Builder" | "Designer" | "Chief Engineer" | "Debugger"
  | "QA" | "Data Architect" | "Security" | "Deployment" | "Documenter";

export interface RoleSpec {
  role: AgentRole;
  order: number;
  keywords: RegExp;
  available: boolean;
  /** The real capability that backs this role today (or why it isn't connected). */
  capability: string;
  task: string;
}

export const ROLES: readonly RoleSpec[] = [
  { role: "Architect", order: 1, available: true, keywords: /\b(plan|architect|structure|scope|audit|review|assess)\b/i,
    capability: "Studio plan mode + knowledge graph", task: "Map the current structure and outline the change plan." },
  { role: "Data Architect", order: 2, available: false, keywords: /\b(data|database|schema|table|api|backend|store|persist)\b/i,
    capability: "Not connected — schema design runs manually in Studio today", task: "Model the data and storage the outcome needs." },
  { role: "Designer", order: 3, available: true, keywords: /\b(design|ui|ux|layout|style|visual|brand|mobile|responsive|polish|look)\b/i,
    capability: "Art direction, design DNA and Style Lock", task: "Fix layout, hierarchy and responsive issues without changing the brand." },
  { role: "Builder", order: 4, available: true, keywords: /\b(build|add|create|feature|implement|make|page|section)\b/i,
    capability: "Studio patch-first generation", task: "Implement the requested changes as focused patches." },
  { role: "Chief Engineer", order: 5, available: true, keywords: /\b(refactor|optimi[sz]e|performance|speed|clean|production)\b/i,
    capability: "Patch engine + local repair", task: "Tighten code quality and performance for production." },
  { role: "Debugger", order: 6, available: true, keywords: /\b(fix|bug|broken|error|issue|crash|debug)\b/i,
    capability: "Local script/navigation repair", task: "Find and fix broken behaviour." },
  { role: "QA", order: 7, available: true, keywords: /\b(test|qa|form|check|verify|validate|audit)\b/i,
    capability: "Local safety checks + design floor", task: "Check forms, interactions and structure after changes." },
  { role: "Security", order: 8, available: true, keywords: /\b(secur|vulnerab|xss|safe|secret|auth|production)\b/i,
    capability: "Built-in security scanners", task: "Scan for unsafe patterns and exposed secrets." },
  { role: "Deployment", order: 9, available: true, keywords: /\b(deploy|publish|ship|launch|production|github|export|live)\b/i,
    capability: "Publish, GitHub push and clean export", task: "Prepare the build for publishing or handoff." },
  { role: "Documenter", order: 10, available: false, keywords: /\b(doc|readme|document|explain|handoff)\b/i,
    capability: "Not connected — automatic docs are a future capability", task: "Write handoff notes and a README." },
];

export interface MissionStep extends RoleSpec { reason: string }

export function decomposeMission(mission: string): MissionStep[] {
  const text = mission.trim();
  if (!text) return [];
  const steps: MissionStep[] = [];
  for (const r of ROLES) {
    const m = text.match(r.keywords);
    if (m) steps.push({ ...r, reason: `mentions “${m[0].toLowerCase()}”` });
  }
  // Every mission that changes something needs a builder and a QA pass.
  const ensure = (role: AgentRole, reason: string) => {
    if (!steps.some((s) => s.role === role)) {
      const spec = ROLES.find((r) => r.role === role)!;
      steps.push({ ...spec, reason });
    }
  };
  if (steps.some((s) => ["Designer", "Debugger", "Chief Engineer"].includes(s.role))) ensure("Builder", "applies the changes");
  if (steps.length) ensure("QA", "verifies every mission");
  if (!steps.length) {
    ensure("Architect", "clarifies the outcome");
    ensure("Builder", "applies the changes");
    ensure("QA", "verifies every mission");
  }
  return steps.sort((a, b) => a.order - b.order);
}

/** A single Studio prompt covering only the steps Studio can actually run today. */
export function missionToStudioPrompt(mission: string, steps: readonly MissionStep[]): string {
  const runnable = steps.filter((s) => s.available && s.role !== "Architect" && s.role !== "Deployment");
  const lines = [`Mission: ${mission.trim()}`, "", "Apply as focused patches to the current project (do not regenerate the whole page):"];
  runnable.forEach((s, i) => lines.push(`${i + 1}. ${s.role}: ${s.task}`));
  return lines.join("\n");
}
