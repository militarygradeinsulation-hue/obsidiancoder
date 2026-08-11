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
      // Rename a build in the caller's own library (code = shared secret).
      PATCH: async ({ params, request }) => {
        const code = String(params.code || "").trim();
        const id = String(params.id || "").trim();
        if (code.length < 4 || code.length > 64) {
          return new Response("Invalid library code", { status: 400 });
        }
        if (!id) return new Response("Missing id", { status: 400 });

        let body: { title?: unknown };
        try {
          body = (await request.json()) as { title?: unknown };
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }
        const title = String(body.title ?? "").trim().slice(0, 120);
        if (!title) return new Response("Title required", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("builds" as never)
          .update({ title } as never)
          .eq("library_code", code)
          .eq("id", id)
          .select("id, title")
          .maybeSingle();
        if (error) return new Response(error.message, { status: 500 });
        if (!data) return new Response("Not found", { status: 404 });
        return Response.json(data);
      },
      // Remove a build from the caller's own library.
      DELETE: async ({ params }) => {
        const code = String(params.code || "").trim();
        const id = String(params.id || "").trim();
        if (code.length < 4 || code.length > 64) {
          return new Response("Invalid library code", { status: 400 });
        }
        if (!id) return new Response("Missing id", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("builds" as never)
          .delete()
          .eq("library_code", code)
          .eq("id", id);
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
