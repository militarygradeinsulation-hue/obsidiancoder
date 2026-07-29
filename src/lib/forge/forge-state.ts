// Pure helpers for the experimental Obsidian Forge workspace (/forge).
// No side effects, no imports from React — kept separate so the logic can be
// unit-tested and so /forge never forks Obsidian's real project model.

import {
  migrateFromHtml,
  getEntry,
  updateContent,
  type Project,
} from "@/lib/project-model";

export type ForgeDevice = "desktop" | "tablet" | "mobile";

export const FORGE_DEVICES: Array<{ id: ForgeDevice; label: string; width: number | null }> = [
  { id: "desktop", label: "Desktop", width: null },
  { id: "tablet", label: "Tablet", width: 834 },
  { id: "mobile", label: "Mobile", width: 390 },
];

export function deviceWidth(d: ForgeDevice): number | null {
  return FORGE_DEVICES.find((x) => x.id === d)?.width ?? null;
}

export interface ForgeVersion {
  id: string;
  label: string;
  html: string;
  at: number;
}

export function makeForgeVersion(html: string, label: string): ForgeVersion {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random()),
    label: label.slice(0, 120),
    html,
    at: Date.now(),
  };
}

/** Keep the newest N versions, newest first. */
export function pushVersion(list: ForgeVersion[], v: ForgeVersion, max = 25): ForgeVersion[] {
  return [v, ...list].slice(0, max);
}

/** Build a Project from a single HTML document (Obsidian's real model). */
export function projectFromHtml(html: string): Project {
  return migrateFromHtml(html);
}

/** Entry (executable) HTML for the preview runtime. */
export function entryHtml(project: Project): string {
  return getEntry(project)?.content ?? "";
}

/** Replace the entry file content after a generation completes. */
export function setEntryHtml(project: Project, html: string): Project {
  return updateContent(project, project.entryFileId, html);
}

/** A short, human title derived from a prompt. */
export function titleFromPrompt(prompt: string, fallback = "Untitled build"): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.slice(0, 60) + (clean.length > 60 ? "…" : "");
}

/** Which capabilities require a paid/authenticated account in Forge. */
export const FORGE_PAID_CAPABILITIES = [
  "save",
  "github",
  "export",
  "deploy",
] as const;
export type ForgePaidCapability = (typeof FORGE_PAID_CAPABILITIES)[number];

export function forgeCapabilityAllowed(cap: ForgePaidCapability, paid: boolean): boolean {
  void cap;
  return paid;
}
