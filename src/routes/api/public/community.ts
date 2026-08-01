import { createFileRoute } from "@tanstack/react-router";

// Community library — every build published from Obsidian Pocket (or the
// full builder) that the author chose to share. Public, read-only listing.
// No HTML is returned here; the preview/remix payload lives in
// /api/public/community/$id.

export type CommunityBuild = {
  id: string;
  title: string;
  prompt: string;
  model: string | null;
  created_at: string;
  published_at: string | null;
  share_slug: string | null;
  author_label: string | null;
  remix_count: number;
  byte_size: number;
};

export const Route = createFileRoute("/api/public/community")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 60), 1), 120);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let query = supabaseAdmin
          .from("builds" as never)
          .select(
            "id, title, prompt, model, created_at, published_at, share_slug, author_label, remix_count, byte_size",
          )
          .eq("is_public", true)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (q) query = query.or(`title.ilike.%${q}%,prompt.ilike.%${q}%`);

        const { data, error } = await query;
        if (error) return new Response(error.message, { status: 500 });
        return Response.json(
          { builds: (data ?? []) as CommunityBuild[] },
          { headers: { "cache-control": "public, max-age=30" } },
        );
      },

      // Toggle an existing build's presence in the community library.
      // The build id + its share slug act as the capability token: only
      // someone who published the build knows both.
      POST: async ({ request }) => {
        let body: { id?: string; share_slug?: string; is_public?: boolean; author_label?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const id = String(body.id || "").trim();
        const slug = String(body.share_slug || "").trim();
        if (!id || slug.length < 6) return new Response("Missing id/share_slug", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const patch: Record<string, unknown> = {
          is_public: body.is_public !== false,
          published_at: new Date().toISOString(),
        };
        if (typeof body.author_label === "string") {
          patch['author_label'] = body.author_label.slice(0, 40) || null;
        }
        const { data, error } = await supabaseAdmin
          .from("builds" as never)
          .update(patch as never)
          .eq("id", id)
          .eq("share_slug", slug)
          .select("id, is_public")
          .maybeSingle();
        if (error) return new Response(error.message, { status: 500 });
        if (!data) return new Response("Not found", { status: 404 });
        return Response.json(data);
      },
    },
  },
});
