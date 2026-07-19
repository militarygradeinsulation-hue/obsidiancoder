import { createFileRoute } from "@tanstack/react-router";

// Library listing scoped to a user-provided library code.
// The code is the shared secret — only builds tagged with that exact code appear.
export const Route = createFileRoute("/api/public/library/$code")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const code = String(params.code || "").trim();
        if (code.length < 4 || code.length > 64) {
          return new Response("Invalid library code", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("builds" as never)
          .select("id, created_at, title, prompt, model, byte_size, share_slug")
          .eq("library_code", code)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ builds: data ?? [] });
      },
    },
  },
});
