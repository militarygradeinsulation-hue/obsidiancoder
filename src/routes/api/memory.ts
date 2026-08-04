// /api/memory — owner-side access to a build's shared Cloud Memory records.
// Teammates use /api/public/team/<slug>; this route is for the signed-in owner
// working inside Obsidian Vibe or Obsidian Pocket.
//
//   GET    /api/memory?id=<uuid>            → { records }
//   PUT    /api/memory  { id, key, value }  → { updatedAt }
//   DELETE /api/memory  { id, key }         → { deleted }

import { createFileRoute } from "@tanstack/react-router";
import { resolveUserFromRequest, type AuthedUser } from "@/lib/credit-gate.server";
import { validMemoryKey, validMemoryValue } from "@/lib/build-memory";
import {
  readBuildMemory,
  writeBuildMemory,
  deleteBuildMemory,
  getCloudMemoryState,
} from "@/lib/build-memory.server";

const UUID = /^[0-9a-f-]{36}$/i;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Ownership check — getCloudMemoryState only matches rows owned by this user. */
async function requireOwnedBuild(user: AuthedUser, id: string) {
  const state = await getCloudMemoryState(user, id);
  return state;
}

export const Route = createFileRoute("/api/memory")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await resolveUserFromRequest(request);
        if (!user) return json(401, { ok: false, error: "Sign in first." });
        const id = new URL(request.url).searchParams.get("id") ?? "";
        if (!UUID.test(id)) return json(400, { ok: false, error: "id must be a valid UUID." });
        try {
          await requireOwnedBuild(user, id);
          return json(200, { ok: true, records: await readBuildMemory(id) });
        } catch (err) {
          return json(500, { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "Read failed." });
        }
      },

      PUT: async ({ request }) => {
        const user = await resolveUserFromRequest(request);
        if (!user) return json(401, { ok: false, error: "Sign in first." });
        let body: { id?: string; key?: unknown; value?: unknown; device?: unknown };
        try { body = await request.json(); } catch { return json(400, { ok: false, error: "Invalid JSON body." }); }
        if (!body.id || !UUID.test(body.id)) return json(400, { ok: false, error: "id must be a valid UUID." });
        if (!validMemoryKey(body.key)) return json(400, { ok: false, error: "Invalid record key." });
        if (!validMemoryValue(body.value)) return json(413, { ok: false, error: "That record is too large." });
        try {
          await requireOwnedBuild(user, body.id);
          const updatedAt = await writeBuildMemory(
            body.id, user.userId, body.key, body.value, String(body.device ?? "owner"),
          );
          return json(200, { ok: true, updatedAt });
        } catch (err) {
          return json(500, { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "Write failed." });
        }
      },

      DELETE: async ({ request }) => {
        const user = await resolveUserFromRequest(request);
        if (!user) return json(401, { ok: false, error: "Sign in first." });
        let body: { id?: string; key?: unknown };
        try { body = await request.json(); } catch { return json(400, { ok: false, error: "Invalid JSON body." }); }
        if (!body.id || !UUID.test(body.id)) return json(400, { ok: false, error: "id must be a valid UUID." });
        if (!validMemoryKey(body.key)) return json(400, { ok: false, error: "Invalid record key." });
        try {
          await requireOwnedBuild(user, body.id);
          return json(200, { ok: true, deleted: await deleteBuildMemory(body.id, body.key) });
        } catch (err) {
          return json(500, { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "Delete failed." });
        }
      },
    },
  },
});
