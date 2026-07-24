import { createFileRoute } from "@tanstack/react-router";
import { containsTradesOnlyLanguage } from "@/lib/suggestion-safety";

// Per-library-code storage for a user's saved ideas. The library code is the
// shared secret; only bookmarks tagged with that exact code are returned.
// Server-side admin client only — direct client access to the table is denied.

type Idea = {
  id?: string;
  label?: string;
  snippet?: string;
  hint?: string;
  category?: string;
};

function sanitizeIdeas(raw: unknown): Idea[] {
  if (!Array.isArray(raw)) return [];
  const out: Idea[] = [];
  for (const item of raw.slice(0, 100)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const snippet = typeof o.snippet === "string" ? o.snippet.slice(0, 2000) : "";
    if (!snippet.trim()) continue;
    const label = typeof o.label === "string" ? o.label.slice(0, 200) : undefined;
    const category = o.category === "trades" ? "trades" : undefined;
    if (category !== "trades" && containsTradesOnlyLanguage(`${label ?? ""} ${snippet}`)) continue;
    out.push({
      id: typeof o.id === "string" ? o.id.slice(0, 128) : undefined,
      label,
      snippet,
      hint: typeof o.hint === "string" ? o.hint.slice(0, 400) : undefined,
      category,
    });
  }
  return out;
}

export const Route = createFileRoute("/api/public/saved-ideas/$code")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const code = String(params.code || "").trim();
        if (code.length < 4 || code.length > 64) {
          return new Response("Invalid library code", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("saved_ideas" as never)
          .select("ideas, updated_at")
          .eq("library_code", code)
          .maybeSingle();
        if (error) return new Response(error.message, { status: 500 });
        const row = data as { ideas: unknown; updated_at: string } | null;
        return Response.json({ ideas: sanitizeIdeas(row?.ideas), updated_at: row?.updated_at ?? null });
      },
      PUT: async ({ params, request }) => {
        const code = String(params.code || "").trim();
        if (code.length < 4 || code.length > 64) {
          return new Response("Invalid library code", { status: 400 });
        }
        let body: unknown;
        try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
        const ideas = sanitizeIdeas((body as { ideas?: unknown })?.ideas);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("saved_ideas" as never)
          .upsert(
            { library_code: code, ideas, updated_at: new Date().toISOString() } as never,
            { onConflict: "library_code" },
          );
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true, count: ideas.length });
      },
    },
  },
});
