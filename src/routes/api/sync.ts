// /api/sync — per-build sync state: project memory + public live URL.
// Content itself lives in /api/projects; this route only carries the
// lightweight state that makes cross-device live syncing work.
//
// GET  /api/sync?id=<uuid>        → { state }
// POST /api/sync                  → body { id, memory }        (save memory)
// PUT  /api/sync                  → body { id, live: boolean } (live URL on/off)
//
// Auth: Bearer JWT (Supabase). Unmetered — these are tiny row updates.

import { createFileRoute } from "@tanstack/react-router";
import { resolveUserFromRequest } from "@/lib/credit-gate.server";
import {
  getProjectSync,
  setProjectMemory,
  setProjectLive,
} from "@/lib/project-sync.server";

const UUID = /^[0-9a-f-]{36}$/i;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await resolveUserFromRequest(request);
        if (!user) return json(401, { ok: false, error: "Sign in to use live sync." });
        const id = new URL(request.url).searchParams.get("id") ?? "";
        if (!UUID.test(id)) return json(400, { ok: false, error: "id must be a valid UUID." });
        try {
          return json(200, { ok: true, state: await getProjectSync(user, id) });
        } catch (err) {
          return json(500, { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "Sync read failed." });
        }
      },

      POST: async ({ request }) => {
        const user = await resolveUserFromRequest(request);
        if (!user) return json(401, { ok: false, error: "Sign in to use live sync." });
        let body: { id?: string; memory?: unknown };
        try { body = await request.json(); } catch { return json(400, { ok: false, error: "Invalid JSON body." }); }
        if (!body.id || !UUID.test(body.id)) return json(400, { ok: false, error: "id must be a valid UUID." });
        const memory = body.memory && typeof body.memory === "object" && !Array.isArray(body.memory)
          ? (body.memory as Record<string, unknown>)
          : {};
        if (JSON.stringify(memory).length > 20_000) {
          return json(413, { ok: false, error: "Project memory is too large." });
        }
        try {
          await setProjectMemory(user, body.id, memory);
          return json(200, { ok: true });
        } catch (err) {
          return json(500, { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "Memory save failed." });
        }
      },

      PUT: async ({ request }) => {
        const user = await resolveUserFromRequest(request);
        if (!user) return json(401, { ok: false, error: "Sign in to use live sync." });
        let body: { id?: string; live?: unknown; cloudMemory?: unknown; teamCode?: unknown; resetMemory?: unknown };
        try { body = await request.json(); } catch { return json(400, { ok: false, error: "Invalid JSON body." }); }
        if (!body.id || !UUID.test(body.id)) return json(400, { ok: false, error: "id must be a valid UUID." });

        // Cloud Memory: enable/disable the shared team data store, rotate the code.
        if (typeof body.cloudMemory === "boolean" || body.resetMemory === true) {
          try {
            if (body.resetMemory === true) {
              const removed = await resetBuildMemory(user, body.id);
              return json(200, { ok: true, removed });
            }
            const code = normalizeTeamCode(body.teamCode);
            if (body.teamCode !== undefined && body.teamCode !== null && !code) {
              return json(400, { ok: false, error: "Team code must be 4–64 characters." });
            }
            const enabled = body.cloudMemory === true;
            const state = await getCloudMemoryState(user, body.id);
            // Turning it on for the first time needs a code — default to 9822.
            const nextCode = code ?? (enabled && !state.teamCodeSet ? DEFAULT_TEAM_CODE : null);
            const result = await setCloudMemory(user, body.id, enabled, nextCode);
            const stats = await buildMemoryStats(user, body.id);
            return json(200, { ok: true, ...result, teamCodeSet: state.teamCodeSet || Boolean(nextCode), ...stats });
          } catch (err) {
            return json(500, { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "Cloud Memory update failed." });
          }
        }

        if (typeof body.live !== "boolean") return json(400, { ok: false, error: "live must be a boolean." });
        try {
          const result = await setProjectLive(user, body.id, body.live);
          return json(200, { ok: true, ...result });
        } catch (err) {
          return json(500, { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "Live toggle failed." });
        }
      },

    },
  },
});
