import { createFileRoute } from "@tanstack/react-router";

// Public shareable build — anyone with the URL can view the standalone page.
// No login, no admin token required. Returns raw HTML in a sandboxed frame.
export const Route = createFileRoute("/api/public/share/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = String(params.slug || "").trim();
        if (!slug || slug.length < 6) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("builds" as never)
          .select("html")
          .eq("share_slug", slug)
          .maybeSingle();
        if (error) return new Response(error.message, { status: 500 });
        if (!data) return new Response("Not found", { status: 404 });
        return new Response((data as { html: string }).html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=60",
            "content-security-policy": "sandbox allow-scripts allow-forms allow-popups allow-same-origin;",
          },
        });
      },
    },
  },
});
