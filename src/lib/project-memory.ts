// Per-session project memory. Persisted alongside the Session via localStorage
// by src/routes/index.tsx. Small, editable, and sent as compact context to the
// AI patch route.

export type ProjectMemory = {
  purpose: string;
  audience: string;
  design: string;
  constraints: string;
  doNotChange: string;
};

export const EMPTY_MEMORY: ProjectMemory = {
  purpose: "",
  audience: "",
  design: "",
  constraints: "",
  doNotChange: "",
};

export function isEmpty(mem: ProjectMemory | null | undefined): boolean {
  if (!mem) return true;
  return !mem.purpose && !mem.audience && !mem.design && !mem.constraints && !mem.doNotChange;
}

/** Compact multi-line format suitable for injecting into a system prompt. */
export function memoryToPrompt(mem: ProjectMemory | null | undefined): string {
  if (isEmpty(mem)) return "";
  const m = mem!;
  const parts: string[] = [];
  if (m.purpose) parts.push(`purpose: ${m.purpose.trim()}`);
  if (m.audience) parts.push(`audience: ${m.audience.trim()}`);
  if (m.design) parts.push(`design direction: ${m.design.trim()}`);
  if (m.constraints) parts.push(`technical constraints: ${m.constraints.trim()}`);
  if (m.doNotChange) parts.push(`do NOT change: ${m.doNotChange.trim()}`);
  return parts.join("\n");
}
