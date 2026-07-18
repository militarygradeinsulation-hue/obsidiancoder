import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function sb() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const Route = createFileRoute("/api/public/builds")({
  server: {
    handlers: {
      GET: async () => {
        const { data, error } = await sb()
          .from("builds" as never)
          .select("id, created_at, title, prompt, model, client_id, byte_size")
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ builds: data ?? [] });
      },
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          title?: string;
          prompt?: string;
          html?: string;
          model?: string;
          session_id?: string;
          client_id?: string;
        };
        if (!body.html || body.html.length < 20) return new Response("Missing html", { status: 400 });
        const ip =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          null;
        const ua = request.headers.get("user-agent") || null;
        const row = {
          title: (body.title || "Untitled").slice(0, 120),
          prompt: (body.prompt || "").slice(0, 8000),
          html: body.html.slice(0, 6_000_000),
          model: body.model || null,
          session_id: body.session_id || null,
          client_id: body.client_id || null,
          ip,
          user_agent: ua,
          byte_size: body.html.length,
        };
        const { data, error } = await sb()
          .from("builds" as never)
          .insert(row as never)
          .select("id")
          .single();
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ id: (data as { id: string }).id });
      },
    },
  },
});
