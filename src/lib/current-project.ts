// Shared "current project" pointer so Pocket, Studio, Brain and Agent refer
// to the same project. It stores only an identity pointer — the project
// itself stays in the existing session / cloud project stores.

import { safeGet, safeSet, safeRemove } from "./safe-storage";

export const CURRENT_PROJECT_KEY = "obs.currentProject.v1";
export const MISSION_HANDOFF_KEY = "obs.mission.handoff.v1";

export interface CurrentProject {
  /** cloudProjectId when saved to the cloud, else the local session id. */
  id: string;
  cloudId?: string;
  title: string;
  surface: "pocket" | "studio";
  hasBuild: boolean;
  at: number;
}

export function setCurrentProject(p: Omit<CurrentProject, "at">): void {
  if (!p.id) return;
  const prev = readCurrentProject();
  if (prev && prev.id === p.id && prev.title === p.title && prev.surface === p.surface && prev.hasBuild === p.hasBuild && prev.cloudId === p.cloudId) return;
  safeSet(CURRENT_PROJECT_KEY, { ...p, title: (p.title || "Untitled build").slice(0, 80), at: Date.now() });
}

export function readCurrentProject(): CurrentProject | null {
  const raw = safeGet<CurrentProject>(CURRENT_PROJECT_KEY);
  if (!raw || typeof raw.id !== "string" || !raw.id) return null;
  return raw;
}

export interface MissionHandoff { prompt: string; at: number }

export function stageMissionHandoff(prompt: string): boolean {
  return safeSet(MISSION_HANDOFF_KEY, { prompt: prompt.slice(0, 4000), at: Date.now() });
}

export function takeMissionHandoff(maxAgeMs = 10 * 60_000): MissionHandoff | null {
  const raw = safeGet<MissionHandoff>(MISSION_HANDOFF_KEY);
  safeRemove(MISSION_HANDOFF_KEY);
  if (!raw || typeof raw.prompt !== "string" || !raw.prompt.trim()) return null;
  if (typeof raw.at !== "number" || Date.now() - raw.at > maxAgeMs) return null;
  return raw;
}
