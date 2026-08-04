// Public team endpoint for Cloud Memory builds.
//
//   POST /api/public/team/<slug>          { code }              → { token, title }
//   GET  /api/public/team/<slug>?token=…                        → { records }
//   PUT  /api/public/team/<slug>          { token, key, value } → { updatedAt }
//   DELETE /api/public/team/<slug>        { token, key }        → { deleted }
//
// Teammates hold a short-lived, project-scoped, DATA-ONLY token. This route
// can only read and write build_memory rows — it can never read or change the
// build's HTML, prompt, or any AI surface, so it consumes no credits.

import { createFileRoute } from "@tanstack/react-router";
import {
  verifyTeamCode,
  signTeamToken,
  verifyTeamToken,
  validMemoryKey,
  validMemoryValue,
  checkRate,
  type RateState,
} from "@/lib/build-memory";
import {
  lookupTeamAccess,
  readBuildMemory,
  writeBuildMemory,
  deleteBuildMemory,
} from "@/lib/build-memory.server";

const attempts = new Map<string, RateState>();
const writes = new Map<string, RateState>();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function secret(): string {
  const s = process.env["SESSION_SECRET"];
  if (!s || s.length < 16) throw new Error("Team access is not configured.");
  return s;
}

function clientKey(request: Request): string {
  return (request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")
    ?? "anon").split(",")[0]!.trim().slice(0, 60);
}

async function gate(slug: string) {
  const access = await lookupTeamAccess(slug);
  if (!access || !access.live) return { error: json(404, { ok: false, error: "Build not found." }) } as const;
  if (!access.cloudMemory) return { error: json(403, { ok: false, error: "Cloud Memory is off for this build." }) } as const;
  return { access } as const;
}

export const Route = createFileRoute("/api/public/team/$slug")({
  server: {
    handlers: {
      // Exchange the team code for a token.
      POST: async ({ request, params }) => {
        const slug = String(params.slug || "").trim();
        if (slug.length < 6) return json(404, { ok: false, error: "Build not found." });
        if (!checkRate(attempts, `${clientKey(request)}:${slug}`, Date.now(), 10, 60_000)) {
          return json(429, { ok: false, error: "Too many attempts. Wait a minute." });
        }
        let body: { code?: unknown };
        try { body = await request.json(); } catch { return json(400, { ok: false, error: "Invalid JSON body." }); }
        try {
          const g = await gate(slug);
          if ("error" in g) return g.error;
          const ok = await verifyTeamCode(g.access.projectId, body.code, g.access.teamCodeHash);
          if (!ok) return json(401, { ok: false, error: "That team code doesn't match." });
          return json(200, {
            ok: true,
            token: await signTeamToken(secret(), g.access.projectId),
            title: g.access.title,
          });
        } catch (err) {
          return json(500, { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "Team access failed." });
        }
      },

      // Read the shared records.
      GET: async ({ request, params }) => {
        const slug = String(params.slug || "").trim();
        const token = new URL(request.url).searchParams.get("token") ?? "";
        try {
          const g = await gate(slug);
          if ("error" in g) return g.error;
          const projectId = await verifyTeamToken(secret(), token);
          if (projectId !== g.access.projectId) return json(401, { ok: false, error: "Team access expired. Enter the code again." });
          return json(200, { ok: true, records: await readBuildMemory(projectId) });
        } catch (err) {
          return json(500, { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "Read failed." });
        }
      },

      // Upsert one shared record.
      PUT: async ({ request, params }) => {
        const slug = String(params.slug || "").trim();
        let body: { token?: unknown; key?: unknown; value?: unknown; device?: unknown };
        try { body = await request.json(); } catch { return json(400, { ok: false, error: "Invalid JSON body." }); }
        if (!validMemoryKey(body.key)) return json(400, { ok: false, error: "Invalid record key." });
        if (!validMemoryValue(body.value)) return json(413, { ok: false, error: "That record is too large." });
        try {
          const g = await gate(slug);
          if ("error" in g) return g.error;
          const projectId = await verifyTeamToken(secret(), body.token);
          if (projectId !== g.access.projectId) return json(401, { ok: false, error: "Team access expired. Enter the code again." });
          if (!checkRate(writes, `${projectId}:${clientKey(request)}`, Date.now(), 120, 60_000)) {
            return json(429, { ok: false, error: "Slow down — too many updates." });
          }
          const updatedAt = await writeBuildMemory(
            projectId, g.access.ownerId, body.key, body.value, String(body.device ?? "teammate"),
          );
          return json(200, { ok: true, updatedAt });
        } catch (err) {
          return json(500, { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "Write failed." });
        }
      },

      // Remove one shared record.
      DELETE: async ({ request, params }) => {
        const slug = String(params.slug || "").trim();
        let body: { token?: unknown; key?: unknown };
        try { body = await request.json(); } catch { return json(400, { ok: false, error: "Invalid JSON body." }); }
        if (!validMemoryKey(body.key)) return json(400, { ok: false, error: "Invalid record key." });
        try {
          const g = await gate(slug);
          if ("error" in g) return g.error;
          const projectId = await verifyTeamToken(secret(), body.token);
          if (projectId !== g.access.projectId) return json(401, { ok: false, error: "Team access expired. Enter the code again." });
          if (!checkRate(writes, `${projectId}:${clientKey(request)}`, Date.now(), 120, 60_000)) {
            return json(429, { ok: false, error: "Slow down — too many updates." });
          }
          return json(200, { ok: true, deleted: await deleteBuildMemory(projectId, body.key) });
        } catch (err) {
          return json(500, { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "Delete failed." });
        }
      },
    },
  },
});
