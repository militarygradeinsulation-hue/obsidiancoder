import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isOwnerRequest, resolveUserFromRequest } from "@/lib/credit-gate.server";

const uploadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  dataUrl: z.string().min(32).max(900_000),
});

const deleteSchema = z.object({
  path: z.string().min(10).max(500),
});

function parseDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string; ext: string } | null {
  const match = /^data:(image\/(png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const ext = match[2] === "jpeg" || match[2] === "jpg" ? "jpg" : match[2];
  return {
    bytes: Uint8Array.from(Buffer.from(match[3], "base64")),
    mime,
    ext,
  };
}

function safeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "asset";
}

async function identity(request: Request): Promise<{ scope: string } | null> {
  if (await isOwnerRequest(request)) return { scope: "owner" };
  const user = await resolveUserFromRequest(request);
  if (!user?.userId) return null;
  return { scope: user.userId };
}

export const Route = createFileRoute("/api/project-assets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const who = await identity(request);
        if (!who) return Response.json({ error: "Sign in to host project images." }, { status: 401 });

        let body: z.infer<typeof uploadSchema>;
        try {
          body = uploadSchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid project image." }, { status: 400 });
        }

        const file = parseDataUrl(body.dataUrl);
        if (!file) return Response.json({ error: "Use PNG, JPG, or WebP images." }, { status: 400 });
        if (file.bytes.byteLength > 700_000) {
          return Response.json({ error: "Optimized image is too large." }, { status: 413 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const id = crypto.randomUUID();
        const path = `project-assets/${who.scope}/${id}-${safeSegment(body.name)}.${file.ext}`;
        const uploaded = await supabaseAdmin.storage
          .from("build-images")
          .upload(path, file.bytes, {
            contentType: file.mime,
            cacheControl: "31536000",
            upsert: false,
          });

        if (uploaded.error) {
          return Response.json({ error: "Could not store project image." }, { status: 503 });
        }

        const url = supabaseAdmin.storage.from("build-images").getPublicUrl(path).data.publicUrl;
        return Response.json({ id, name: body.name, url, path });
      },

      DELETE: async ({ request }) => {
        const who = await identity(request);
        if (!who) return Response.json({ error: "Sign in required." }, { status: 401 });

        let body: z.infer<typeof deleteSchema>;
        try {
          body = deleteSchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid asset path." }, { status: 400 });
        }

        const prefix = `project-assets/${who.scope}/`;
        if (!body.path.startsWith(prefix) || body.path.includes("..")) {
          return Response.json({ error: "Asset does not belong to this account." }, { status: 403 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const removed = await supabaseAdmin.storage.from("build-images").remove([body.path]);
        if (removed.error) return Response.json({ error: "Could not remove project image." }, { status: 503 });
        return Response.json({ ok: true });
      },
    },
  },
});
