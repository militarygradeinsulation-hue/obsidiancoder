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
        // The param is either a build id (public library rows only) or a
        // share slug. A slug is a capability token — knowing it is enough to
        // open the build even when it was never added to the public library.
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const cols = "id, title, prompt, model, html, share_slug, remix_count, created_at";
        let data: unknown = null;
        let error: { message: string } | null = null;
        if (isUuid) {
          const r = await supabaseAdmin
            .from("builds" as never)
            .select(cols)
            .eq("id", id)
            .eq("is_public", true)
            .maybeSingle();
          data = r.data;
          error = r.error;
        }
        if (!data && !isUuid) {
          const r = await supabaseAdmin
            .from("builds" as never)
            .select(cols)
            .eq("share_slug", id)
            .maybeSingle();
          data = r.data;
          error = r.error;
        }
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
            .eq("id", row.id);
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
