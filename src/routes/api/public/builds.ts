import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function requireAdmin(request: Request): Response | null {
  const token = process.env.GALLERY_ADMIN_TOKEN;
  if (!token) return new Response("Admin token not configured", { status: 500 });
  const provided =
    request.headers.get("x-admin-token") ||
    new URL(request.url).searchParams.get("token") ||
    "";
  if (provided !== token) return new Response("Unauthorized", { status: 401 });
  return null;
}

function sbPublishable() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sbAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const Route = createFileRoute("/api/public/builds")({
  server: {
    handlers: {
      // Admin-only list: only reachable with the gallery admin token
      GET: async ({ request }) => {
        const denied = requireAdmin(request);
        if (denied) return denied;
        const admin = await sbAdmin();
        const { data, error } = await admin
          .from("builds" as never)
          .select("id, created_at, title, prompt, model, client_id, byte_size")
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ builds: data ?? [] });
      },
      // Public save: cloud save requires either owner cookie OR a signed-in
      // Pro user with credits. Local editing does not hit this route.
      POST: async ({ request }) => {
        const { requirePaidOperation, denialResponse, commitReservation, refundReservation, logOwnerUsage } =
          await import("@/lib/credit-gate.server");
        const entitlement = await requirePaidOperation(request, "cloud_save");
        if (entitlement.kind === "denied" && entitlement.denial) {
          return denialResponse(entitlement.denial);
        }
        try {
          const body = (await request.json()) as {
            title?: string;
            prompt?: string;
            html?: string;
            model?: string;
            session_id?: string;
            client_id?: string;
            library_code?: string;
          };
          if (!body.html || body.html.length < 20) {
            if (entitlement.kind === "pro" && entitlement.reservation) {
              await refundReservation(entitlement.reservation.reservationId);
            }
            return new Response("Missing html", { status: 400 });
          }
          const libCode = (body.library_code || "").trim();
          if (libCode && (libCode.length < 4 || libCode.length > 64)) {
            if (entitlement.kind === "pro" && entitlement.reservation) {
              await refundReservation(entitlement.reservation.reservationId);
            }
            return new Response("Invalid library_code", { status: 400 });
          }
          const genSlug = () => {
            const bytes = new Uint8Array(9);
            crypto.getRandomValues(bytes);
            return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
          };
          const row = {
            title: (body.title || "Untitled").slice(0, 120),
            prompt: (body.prompt || "").slice(0, 8000),
            html: body.html.slice(0, 6_000_000),
            model: body.model || null,
            session_id: body.session_id || null,
            client_id: body.client_id || null,
            library_code: libCode || null,
            share_slug: genSlug(),
            byte_size: body.html.length,
          };
          const admin = await sbAdmin();
          const { data, error } = await admin
            .from("builds" as never)
            .insert(row as never)
            .select("id, share_slug")
            .single();
          if (error) {
            if (entitlement.kind === "pro" && entitlement.reservation) {
              await refundReservation(entitlement.reservation.reservationId);
            }
            return new Response(error.message, { status: 500 });
          }
          if (entitlement.kind === "pro" && entitlement.reservation) {
            await commitReservation(entitlement.reservation.reservationId);
          } else if (entitlement.kind === "owner") {
            await logOwnerUsage("cloud_save", 0);
          }
          const r = data as { id: string; share_slug: string };
          return Response.json({ id: r.id, share_slug: r.share_slug });
        } catch (err) {
          if (entitlement.kind === "pro" && entitlement.reservation) {
            await refundReservation(entitlement.reservation.reservationId);
          }
          const msg = err instanceof Error ? err.message : "Save failed";
          return new Response(msg, { status: 500 });
        }
      },

    },
  },
});
