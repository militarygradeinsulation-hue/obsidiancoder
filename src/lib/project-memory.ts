// Per-session project memory v2. Structured entries with locking so
// downstream agents cannot silently overwrite user-confirmed values.

export type MemoryEntry = {
  value: string;
  locked?: boolean;
  updatedAt?: number;
};

export type ProjectMemory = {
  // legacy fields (kept for back-compat with callers)
  purpose: string;
  audience: string;
  design: string;
  constraints: string;
  doNotChange: string;
  // v2 fields
  brandColors?: string;
  fonts?: string;
  layout?: string;
  framework?: string;
  dependencies?: string;
  protectedElements?: string;
  deploymentTarget?: string;
  knownWarnings?: string;
  workingFeatures?: string;
  /** locked keys cannot be silently overwritten by mergeMemory */
  locked?: Record<string, boolean>;
};

export const EMPTY_MEMORY: ProjectMemory = {
  purpose: "",
  audience: "",
  design: "",
  constraints: "",
  doNotChange: "",
  brandColors: "",
  fonts: "",
  layout: "",
  framework: "",
  dependencies: "",
  protectedElements: "",
  deploymentTarget: "",
  knownWarnings: "",
  workingFeatures: "",
  locked: {},
};

const V2_KEYS: (keyof ProjectMemory)[] = [
  "purpose", "audience", "design", "constraints", "doNotChange",
  "brandColors", "fonts", "layout", "framework", "dependencies",
  "protectedElements", "deploymentTarget", "knownWarnings", "workingFeatures",
];

export function isEmpty(mem: ProjectMemory | null | undefined): boolean {
  if (!mem) return true;
  return V2_KEYS.every((k) => !(mem as Record<string, unknown>)[k]);
}

/** Compact multi-line format for injecting into a system prompt. */
export function memoryToPrompt(mem: ProjectMemory | null | undefined): string {
  if (isEmpty(mem)) return "";
  const m = mem!;
  const parts: string[] = [];
  const push = (label: string, v?: string) => {
    if (v && v.trim()) parts.push(`${label}: ${v.trim()}`);
  };
  push("purpose", m.purpose);
  push("audience", m.audience);
  push("design direction", m.design);
  push("brand colors", m.brandColors);
  push("fonts", m.fonts);
  push("layout preferences", m.layout);
  push("framework", m.framework);
  push("dependencies", m.dependencies);
  push("deployment target", m.deploymentTarget);
  push("technical constraints", m.constraints);
  push("do NOT change", m.doNotChange);
  push("protected elements", m.protectedElements);
  push("known warnings", m.knownWarnings);
  push("confirmed working features", m.workingFeatures);
  return parts.join("\n");
}

/** Merge incoming updates but never overwrite locked keys. */
export function mergeMemory(base: ProjectMemory, incoming: Partial<ProjectMemory>): ProjectMemory {
  const locked = base.locked ?? {};
  const next: ProjectMemory = { ...base };
  for (const k of V2_KEYS) {
    if (locked[k]) continue;
    const v = incoming[k];
    if (typeof v === "string") (next as Record<string, unknown>)[k] = v;
  }
  if (incoming.locked) next.locked = { ...locked, ...incoming.locked };
  return next;
}

export function lockKey(mem: ProjectMemory, key: keyof ProjectMemory): ProjectMemory {
  return { ...mem, locked: { ...(mem.locked ?? {}), [key]: true } };
}

export function unlockKey(mem: ProjectMemory, key: keyof ProjectMemory): ProjectMemory {
  const next = { ...(mem.locked ?? {}) };
  delete next[key as string];
  return { ...mem, locked: next };
}
