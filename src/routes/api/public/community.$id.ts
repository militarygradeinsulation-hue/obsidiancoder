import { createFileRoute } from "@tanstack/react-router";

// Full payload for one community build — used by Copy code and Remix.
// Only builds explicitly shared to the library are readable here.
export const Route = createFileRoute("/api/public/community/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = String(params.id || "").trim();
        if (!id) return new Response("Not found", { status: 404 });
        const remix = new URL(request.url).searchParams.get("remix") === "1";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("builds" as never)
          .select("id, title, prompt, model, html, share_slug, remix_count, created_at")
          .eq("id", id)
          .eq("is_public", true)
          .maybeSingle();
        if (error) return new Response(error.message, { status: 500 });
        if (!data) return new Response("Not found", { status: 404 });

        const row = data as {
          id: string; title: string; prompt: string; model: string | null;
          html: string; share_slug: string | null; remix_count: number; created_at: string;
        };

        if (remix) {
          await supabaseAdmin
            .from("builds" as never)
            .update({ remix_count: (row.remix_count ?? 0) + 1 } as never)
            .eq("id", id);
        }

        const { sanitizeForExport } = await import("@/lib/clean-export");
        return Response.json({
          id: row.id,
          title: row.title,
          prompt: row.prompt,
          model: row.model,
          share_slug: row.share_slug,
          created_at: row.created_at,
          remix_count: (row.remix_count ?? 0) + (remix ? 1 : 0),
          html: sanitizeForExport(row.html),
        });
      },
    },
  },
});
