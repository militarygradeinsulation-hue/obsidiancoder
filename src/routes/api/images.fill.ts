import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { extractImageSlots, applyImageUrls, finishImagePrompt } from "@/lib/image-slots";

// Post-generation image fill. See src/lib/image-slots.ts for why this runs
// AFTER the page is written instead of inside generate.ts's 4-second
// pre-stream enrichment budget (which image models never fit in).
//
// Entitlement tiers:
//   owner            -> up to 3 images, no charge
//   x-obs-free (free) -> 1 image (the first slot, usually the hero), capped
//                        per fingerprint per day on its own ledger bucket
//   everyone else     -> normal paid gate for "generate_image", up to 3
// Every failure mode degrades to "return the HTML unchanged": a missing
// image leaves the placeholder in place, it never breaks the build.

const bodySchema = z.object({
  html: z.string().min(1).max(3_000_000),
});

function json(body: unknown, status = 200, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(extra ?? {}) },
  });
}

function parseDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string; ext: string } | null {
  const m = /^data:(image\/(png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1] === "image/jpg" ? "image/jpeg" : m[1];
  const ext = m[2] === "jpeg" || m[2] === "jpg" ? "jpg" : m[2];
  return { bytes: Uint8Array.from(Buffer.from(m[3], "base64")), mime, ext };
}

export const Route = createFileRoute("/api/images/fill")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return json({ error: "Invalid request" }, 400);
        }
        const { html } = parsed;

        const {
          isOwnerRequest, requirePaidOperation, settleOperation, serverStripeEnv,
        } = await import("@/lib/credit-gate.server");
        const { newRequestId } = await import("@/lib/ai-errors");
        const requestId = newRequestId();
        const env = serverStripeEnv();

        // Resolve tier and image budget before touching any provider.
        let limit = 3;
        let paidEntitlement: Awaited<ReturnType<typeof requirePaidOperation>> | null = null;
        let setCookie: string | undefined;

        if (await isOwnerRequest(request)) {
          limit = 3;
        } else if (request.headers.get("x-obs-free") === "1") {
          const { claimFreeOpenImages } = await import("@/lib/free-open.server");
          const claim = await claimFreeOpenImages(request, env);
          setCookie = claim.setCookieHeader;
          if (!claim.ok) {
            return json({ html, filled: 0, reason: claim.reason ?? "unavailable" }, 200,
              setCookie ? { "Set-Cookie": setCookie } : undefined);
          }
          limit = 1;
        } else {
          paidEntitlement = await requirePaidOperation(request, "generate_image", requestId);
          if (paidEntitlement.kind === "denied") {
            return json({ html, filled: 0, reason: "not_entitled" });
          }
          limit = 3;
        }

        const slots = extractImageSlots(html, limit);
        if (!slots.length) {
          if (paidEntitlement) {
            await settleOperation(paidEntitlement, { kind: "no_provider", errorCode: "no_image_slots" });
          }
          return json({ html, filled: 0, reason: "no_slots" }, 200, setCookie ? { "Set-Cookie": setCookie } : undefined);
        }

        const { generateImageWithFallback } = await import("@/lib/aetheris.functions");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const results = await Promise.all(
          slots.map(async (slot, i) => {
            try {
              const gen = await generateImageWithFallback(finishImagePrompt(slot.prompt), requestId);
              if (!gen.dataUrl || !gen.providerUsed) return null;
              const file = parseDataUrl(gen.dataUrl);
              if (!file) return null;
              const path = `${env}/${new Date().toISOString().slice(0, 10)}/${requestId}-${i}.${file.ext}`;
              const up = await supabaseAdmin.storage
                .from("build-images")
                .upload(path, file.bytes, { contentType: file.mime, upsert: false });
              if (up.error) return null;
              const url = supabaseAdmin.storage.from("build-images").getPublicUrl(path).data.publicUrl;
              return { tag: slot.tag, url, provider: gen.providerUsed };
            } catch {
              return null;
            }
          }),
        );
        const filled = results.filter((r): r is NonNullable<(typeof results)[number]> => r !== null);

        if (paidEntitlement) {
          if (!filled.length) {
            await settleOperation(paidEntitlement, { kind: "no_provider", errorCode: "image_all_providers_failed" });
          } else {
            const { makeUsage, estimateUsdForCall } = await import("@/lib/usage-record");
            const est = estimateUsdForCall({ imageCount: filled.length, providerUsed: true });
            await settleOperation(paidEntitlement, {
              kind: "success",
              usage: makeUsage({
                provider: filled[0].provider, model: null, operation: "generate_image",
                imageCount: filled.length,
                actualCostUsd: null, estimatedCostUsd: est.usd, costBasis: est.basis,
                providerUsed: true, status: "committed",
                meta: { phase: "post_fill", slots: slots.length },
              }),
            });
          }
        }

        const nextHtml = filled.length ? applyImageUrls(html, filled) : html;
        return json(
          { html: nextHtml, filled: filled.length, requested: slots.length },
          200,
          setCookie ? { "Set-Cookie": setCookie } : undefined,
        );
      },
    },
  },
});
