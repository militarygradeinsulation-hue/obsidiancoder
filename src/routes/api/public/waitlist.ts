import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const submitSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  intended_use: z.string().trim().min(1).max(2000),
  interest_level: z.enum(["exploring", "planning", "ready", "urgent"]),
  tier: z.string().trim().max(64).optional().or(z.literal("")),
  source: z.string().trim().max(64).optional().or(z.literal("")),
});

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

export const Route = createFileRoute("/api/public/waitlist")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
        const parsed = submitSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const row = {
          name: parsed.data.name,
          email: parsed.data.email.toLowerCase(),
          company: parsed.data.company || null,
          intended_use: parsed.data.intended_use,
          interest_level: parsed.data.interest_level,
          tier: parsed.data.tier || null,
          source: parsed.data.source || null,
        };
        const { error } = await supabaseAdmin.from("waitlist_entries" as never).insert(row as never);
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true });
      },
      GET: async ({ request }) => {
        const denied = requireAdmin(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("waitlist_entries" as never)
          .select("id, created_at, name, email, company, intended_use, interest_level, tier, source")
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ entries: data ?? [] });
      },
    },
  },
});
