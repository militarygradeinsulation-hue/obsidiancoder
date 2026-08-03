// /api/projects — cloud project CRUD for authenticated users.
//
// POST   /api/projects        → save (upsert). Body: { id, name, html, prompt, projectJson?, model? }
// GET    /api/projects        → list (metadata only, newest 50)
// GET    /api/projects?id=... → load one full project
// DELETE /api/projects?id=... → delete one project
//
// Auth: Bearer JWT (Supabase). Pro + free_build + owner sessions all allowed.
// Metering: save costs 1 credit (cloud_save operation). Load/list/delete are free.

import { createFileRoute } from "@tanstack/react-router";
import {
  resolveUserFromRequest,
  isOwnerSession,
  serverStripeEnv,
  requirePaidOperation,
  denialResponse,
  settleOperation,
} from "@/lib/credit-gate.server";
import { newRequestId } from "@/lib/ai-errors";
import {
  upsertCloudProject,
  listCloudProjects,
  getCloudProject,
  deleteCloudProject,
} from "@/lib/cloud-projects.server";
import { makeUsage } from "@/lib/usage-record";

const MAX_HTML_BYTES = 6_000_000;  // 6 MB — matches generate.ts ceiling
const MAX_NAME_CHARS = 200;

function jsonError(status: number, message: string, requestId?: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(requestId ? { "X-Request-Id": requestId } : {}),
    },
  });
}

function jsonOk(body: unknown, requestId?: string): Response {
  return new Response(JSON.stringify({ ok: true, ...body as object }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(requestId ? { "X-Request-Id": requestId } : {}),
    },
  });
}

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      // ---- SAVE (upsert) ----
      POST: async ({ request }) => {
        const requestId = newRequestId();
        const env = serverStripeEnv();

        // Auth
        const ownerSession = await isOwnerSession();
        const user = ownerSession ? null : await resolveUserFromRequest(request);
        if (!ownerSession && !user) {
          return jsonError(401, "Sign in to save projects to the cloud.", requestId);
        }

        // Parse body
        let body: {
          id?: string; name?: string; html?: string;
          prompt?: string; projectJson?: unknown; model?: string;
        };
        try {
          body = await request.json();
        } catch {
          return jsonError(400, "Invalid JSON body.", requestId);
        }
        const { id, name, html, prompt, projectJson, model } = body;
        if (!id || typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) {
          return jsonError(400, "id must be a valid UUID.", requestId);
        }
        if (!name || typeof name !== "string") {
          return jsonError(400, "name is required.", requestId);
        }
        if (!html || typeof html !== "string") {
          return jsonError(400, "html is required.", requestId);
        }
        if (html.length > MAX_HTML_BYTES) {
          return jsonError(413, "Project HTML exceeds the 6 MB size limit.", requestId);
        }

        // Metering — owner bypasses credits. Others pay 1 credit (cloud_save).
        let entitlement = null as Awaited<ReturnType<typeof requirePaidOperation>> | null;
        if (!ownerSession && user) {
          entitlement = await requirePaidOperation(request, "cloud_save", requestId);
          if (entitlement.kind === "denied" && entitlement.denial) {
            return denialResponse(entitlement.denial, requestId);
          }
        }

        try {
          const savedId = await upsertCloudProject(
            user ?? { userId: "owner", email: undefined, token: "" },
            {
              id,
              name: name.slice(0, MAX_NAME_CHARS),
              html,
              prompt: (typeof prompt === "string" ? prompt : "").slice(0, 10_000),
              projectJson,
              model: typeof model === "string" ? model : undefined,
            },
            env,
          );

          // Settle the credit charge (cloud_save = 1 credit minimum).
          if (entitlement && entitlement.kind !== "denied") {
            const usage = makeUsage({
              provider: "internal",
              model: "cloud_save",
              operation: "cloud_save",
              providerUsed: true,
              status: "committed",
              estimatedCostUsd: 0.005, // $0.005 = 1 credit at $0.005/credit
              costBasis: "actual",
            });
            await settleOperation(entitlement, { kind: "success", usage });
          }

          return jsonOk({ id: savedId }, requestId);
        } catch (err) {
          // Refund on server error
          if (entitlement && entitlement.kind !== "denied") {
            await settleOperation(entitlement, { kind: "no_provider" }).catch(() => {});
          }
          return jsonError(500, err instanceof Error ? err.message.slice(0, 120) : "Save failed.", requestId);
        }
      },

      // ---- LIST or LOAD ----
      GET: async ({ request }) => {
        const requestId = newRequestId();
        const url = new URL(request.url);
        const projectId = url.searchParams.get("id");

        const ownerSession = await isOwnerSession();
        const user = ownerSession ? null : await resolveUserFromRequest(request);
        if (!ownerSession && !user) {
          return jsonError(401, "Sign in to access cloud projects.", requestId);
        }
        // Owner sessions have no user record — return empty list / not-found.
        if (ownerSession) {
          return projectId
            ? jsonError(404, "Project not found.", requestId)
            : jsonOk({ projects: [] }, requestId);
        }

        try {
          if (projectId) {
            const project = await getCloudProject(user!, projectId);
            if (!project) return jsonError(404, "Project not found.", requestId);
            return jsonOk({ project }, requestId);
          }
          const projects = await listCloudProjects(user!, serverStripeEnv());
          return jsonOk({ projects }, requestId);
        } catch (err) {
          return jsonError(500, err instanceof Error ? err.message.slice(0, 120) : "Load failed.", requestId);
        }
      },

      // ---- DELETE ----
      DELETE: async ({ request }) => {
        const requestId = newRequestId();
        const url = new URL(request.url);
        const projectId = url.searchParams.get("id");
        if (!projectId) return jsonError(400, "id query param is required.", requestId);

        const ownerSession = await isOwnerSession();
        const user = ownerSession ? null : await resolveUserFromRequest(request);
        if (!ownerSession && !user) {
          return jsonError(401, "Sign in to delete cloud projects.", requestId);
        }
        if (ownerSession) return jsonOk({ deleted: false }, requestId);

        try {
          const deleted = await deleteCloudProject(user!, projectId);
          return jsonOk({ deleted }, requestId);
        } catch (err) {
          return jsonError(500, err instanceof Error ? err.message.slice(0, 120) : "Delete failed.", requestId);
        }
      },
    },
  },
});
