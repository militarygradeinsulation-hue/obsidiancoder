import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createBuildJob } from "@/lib/build-jobs.server";
import { failBuildJob } from "@/lib/build-jobs.server";
import { isOwnerRequest, resolveUserFromRequest, OWNER_CODE_HEADER } from "@/lib/credit-gate.server";
import type { StoredJobRequest } from "@/lib/run-build-job.server";

// Deliberately light — the real validation gate is handleGenerate's own
// inputSchema.parse(), which runs when the job actually executes (either
// inline right after this call, or later via the sweep). This route only
// needs enough to satisfy build_jobs' own NOT NULL columns and to avoid
// queuing something too malformed to ever plausibly run.
const createSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  libraryCode: z.string().trim().max(64).optional(),
  surface: z.enum(["pocket", "coder", "vibe"]).default("pocket"),
}).passthrough();

export const Route = createFileRoute("/api/jobs/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
        }

        // Identity check only — NOT a credit check or reservation. That
        // happens exactly once, naturally, inside handleGenerate itself
        // when the job actually runs (whether that's the immediate kick
        // below or a later sweep retry). Doing it twice here would mean
        // either double-charging or building a whole separate
        // reserve/release protocol for no real benefit. This check exists
        // only to keep a fully anonymous, unidentifiable caller from
        // queuing rows at all.
        const owner = await isOwnerRequest(request);
        const user = owner ? null : await resolveUserFromRequest(request);
        const freePocket = parsed.data.surface === "pocket" && request.headers.get("x-obs-free") === "1";
        const accessToken = crypto.randomUUID();
        if (!owner && !user && !freePocket) {
          return Response.json(
            { error: "Sign in to use paid AI features. Local editing remains free." },
            { status: 401 },
          );
        }

        let cookie = request.headers.get("cookie");
        let setCookie: string | undefined;
        if (freePocket) {
          const { readOrMintFreeOpenCookie } = await import("@/lib/free-open.server");
          const minted = readOrMintFreeOpenCookie(request);
          setCookie = minted.setCookieHeader;
          if (setCookie) cookie = (cookie ? cookie + "; " : "") + "obs-free-open=" + minted.cookieId;
        }
        const stored: StoredJobRequest = {
          body: parsed.data,
          authorization: request.headers.get("authorization"),
          ownerCodeHeader: request.headers.get(OWNER_CODE_HEADER),
          cookie,
          userAgent: request.headers.get("user-agent"),
          freePocket,
          forwardedFor: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
        };

        const jobId = await createBuildJob({
          idempotencyKey: crypto.randomUUID(),
          userId: user?.userId ?? null,
          libraryCode: parsed.data.libraryCode ?? null,
          surface: parsed.data.surface === "vibe" ? "coder" : parsed.data.surface,
          anonId: !owner && !user ? accessToken : null,
          prompt: parsed.data.prompt,
          requestBody: stored,
        });

        // Database-owned delivery survives navigation; a detached Promise does not.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const baseUrl = process.env.OBSIDIAN_APP_URL;
        const runnerKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!baseUrl || !runnerKey) {
          await failBuildJob(jobId, "Background worker is not configured.");
          return Response.json({ error: "Background builds require OBSIDIAN_APP_URL and the database job worker. No AI call was made." }, { status: 503 });
        }
        const { error } = await supabaseAdmin.rpc("build_job_kick", {
          _id: jobId, _base_url: new URL(baseUrl).origin, _apikey: runnerKey,
        });
        if (error) {
          await failBuildJob(jobId, "Could not dispatch background worker.");
          return Response.json({ error: "Could not start the background build. No AI call was made." }, { status: 503 });
        }
        return Response.json({ jobId, accessToken: !owner && !user ? accessToken : undefined }, { headers: setCookie ? { "Set-Cookie": setCookie, "Cache-Control": "no-store" } : { "Cache-Control": "no-store" } });
      },
    },
  },
});
