import { createFileRoute } from "@tanstack/react-router";

// Return the HTML for a build ONLY if the caller supplies the correct
// library code. The code is the shared secret (same model as /library/$code).
export const Route = createFileRoute("/api/public/library/$code/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const code = String(params.code || "").trim();
        const id = String(params.id || "").trim();
        if (code.length < 4 || code.length > 64) {
          return new Response("Invalid library code", { status: 400 });
        }
        if (!id) return new Response("Missing id", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("builds" as never)
          .select("id, title, prompt, model, html, share_slug, created_at")
          .eq("library_code", code)
          .eq("id", id)
          .maybeSingle();
        if (error) return new Response(error.message, { status: 500 });
        if (!data) return new Response("Not found", { status: 404 });
        return Response.json(data);
      },
    },
  },
});
