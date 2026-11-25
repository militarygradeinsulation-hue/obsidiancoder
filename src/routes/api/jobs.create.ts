import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createBuildJob, kickBuildJob } from "@/lib/build-jobs.server";
import { isOwnerRequest, resolveUserFromRequest, OWNER_CODE_HEADER } from "@/lib/credit-gate.server";
import type { StoredJobRequest } from "@/lib/run-build-job.server";
import {
  FREE_OPEN_COOKIE_NAME,
  FREE_OPEN_REQUEST_HEADER,
  fingerprintFromFreeOpenCookie,
  readOrMintFreeOpenCookie,
} from "@/lib/free-open.server";

// Deliberately light — the real validation gate is handleGenerate's own
// inputSchema.parse(), which runs when the job actually executes (either
// inline right after this call, or later via the sweep). This route only
// needs enough to satisfy build_jobs' own NOT NULL columns and to avoid
// queuing something too malformed to ever plausibly run.
const createSchema = z.object({
  // Main Vibe can legitimately carry extracted style-guide/PDF context.
  // The client caps durable payloads at ~750 KB, so rejecting at 20 KB here
  // silently forced those builds back onto the browser-owned live path.
  prompt: z.string().trim().min(1).max(750_000),
  libraryCode: z.string().trim().max(64).optional(),
  surface: z.enum(["pocket", "coder"]).default("pocket"),
  // Background-first by default: the server-owned runner is independent
  // of the browser, so navigation, mobile suspension, or closing the tab
  // cannot stop the build. Callers can still opt out for a deliberate
  // foreground-only diagnostic path.
  backgroundStart: z.boolean().optional().default(true),
  sessionId: z.string().trim().max(120).optional(),
  title: z.string().trim().max(180).optional(),
  mode: z.string().trim().max(80).optional(),
  profile: z.string().trim().max(80).optional(),
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
        const freePocket =
          parsed.data.surface === "pocket" &&
          request.headers.get(FREE_OPEN_REQUEST_HEADER) === "1";

        let anonymousFingerprint: string | null = null;
        let anonymousCookieHeader: string | null = null;
        let setCookieHeader: string | undefined;
        if (freePocket) {
          const info = readOrMintFreeOpenCookie(request);
          anonymousFingerprint = fingerprintFromFreeOpenCookie(info);
          anonymousCookieHeader = `${FREE_OPEN_COOKIE_NAME}=${info.cookieId}`;
          setCookieHeader = info.setCookieHeader;
        }

        if (!owner && !user && !freePocket) {
          return Response.json(
            { error: "Sign in to use paid AI features. Local editing remains free." },
            { status: 401 },
          );
        }

        const stored: StoredJobRequest = {
          body: parsed.data,
          authorization: request.headers.get("authorization"),
          ownerCodeHeader: request.headers.get(OWNER_CODE_HEADER),
          freeOpen: freePocket,
          freeOpenCookie: anonymousCookieHeader,
        };

        const jobId = await createBuildJob({
          idempotencyKey: crypto.randomUUID(),
          userId: user?.userId ?? null,
          anonId: anonymousFingerprint,
          libraryCode: parsed.data.libraryCode ?? null,
          sessionId: parsed.data.sessionId ?? null,
          title: parsed.data.title ?? null,
          surface: parsed.data.surface,
          prompt: parsed.data.prompt,
          mode: parsed.data.mode,
          profile: parsed.data.profile,
          requestBody: stored,
        });

        // Start the durable server-owned runner immediately. The browser does
        // not own this work: it can navigate away or close and the job keeps
        // running. If pg_net is unavailable/misconfigured, the client gets a
        // false flag and can fall back to the live streaming path.
        let backgroundStarted = false;
        if (parsed.data.backgroundStart !== false) {
          try {
            backgroundStarted = await kickBuildJob(jobId);
          } catch {
            backgroundStarted = false;
          }
        }

        return Response.json(
          { jobId, backgroundStarted },
          setCookieHeader ? { headers: { "Set-Cookie": setCookieHeader } } : undefined,
        );
      },
    },
  },
});
