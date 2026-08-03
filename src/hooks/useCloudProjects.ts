// Hook: cloud project list + save/load/delete for signed-in users.
// Used by both the IDE (index.tsx) and Pocket (pocket.tsx).
// Never throws — all operations return Result shapes.

import { useState, useCallback, useRef } from "react";
import {
  saveCloudProject,
  listCloudProjects,
  loadCloudProject,
  deleteCloudProject,
  newCloudProjectId,
  type CloudProjectMeta,
  type CloudProjectFull,
} from "@/lib/cloud-projects";
import { thisDeviceId } from "@/hooks/useLiveSync";


export type { CloudProjectMeta, CloudProjectFull };

export interface UseCloudProjectsOptions {
  /** Only fetch the list when the user is authenticated. */
  isAuthenticated: boolean;
  /** Which builder these saves come from — recorded for live sync. */
  surface?: "coder" | "pocket";
}


export interface CloudSaveArgs {
  cloudId?: string;            // undefined = first save; we generate a new id
  name: string;
  html: string;
  prompt: string;
  projectJson?: unknown;
  model?: string;
  surface?: "coder" | "pocket";
  device?: string;
}


export interface CloudSaveResult {
  ok: boolean;
  cloudId: string;             // the id that was used (new or existing)
  error?: string;
}

export function useCloudProjects({ isAuthenticated, surface = "coder" }: UseCloudProjectsOptions) {
  const [projects, setProjects] = useState<CloudProjectMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Fetch the project list. No-ops when unauthenticated. */
  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const result = await listCloudProjects();
      if (result.ok) setProjects(result.data);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  /**
   * Save a project to the cloud. Generates a new cloudId on first save,
   * reuses the existing one on updates. Returns the cloudId so the caller
   * can persist it in session state.
   */
  const save = useCallback(async (args: CloudSaveArgs): Promise<CloudSaveResult> => {
    if (!isAuthenticated) return { ok: false, cloudId: args.cloudId ?? "", error: "Not signed in." };
    const cloudId = args.cloudId ?? newCloudProjectId();
    setSaveStatus("saving");
    const result = await saveCloudProject({
      ...args,
      id: cloudId,
      surface: args.surface ?? surface,
      device: args.device ?? thisDeviceId(),
    });

    if (result.ok) {
      setSaveStatus("saved");
      // Reset to idle after 3 s so the UI indicator clears.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus("idle"), 3000);
      // Refresh list in background — don't block the caller.
      void refresh();
      return { ok: true, cloudId };
    }
    setSaveStatus("error");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaveStatus("idle"), 4000);
    return { ok: false, cloudId, error: result.error };
  }, [isAuthenticated, refresh]);

  /** Load a full project by id. */
  const load = useCallback(async (id: string): Promise<CloudProjectFull | null> => {
    const result = await loadCloudProject(id);
    return result.ok ? result.data : null;
  }, []);

  /** Delete a project. Refreshes the list on success. */
  const remove = useCallback(async (id: string): Promise<boolean> => {
    const result = await deleteCloudProject(id);
    if (result.ok && result.data.deleted) {
      setProjects((prev) => prev.filter((p) => p.id !== id));
      return true;
    }
    return false;
  }, []);

  return { projects, loading, saveStatus, refresh, save, load, remove };
}
