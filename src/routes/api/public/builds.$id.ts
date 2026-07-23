import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/builds/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const token = process.env.GALLERY_ADMIN_TOKEN;
        if (!token) return new Response("Admin token not configured", { status: 500 });
        const provided =
          request.headers.get("x-admin-token") ||
          new URL(request.url).searchParams.get("token") ||
          "";
        if (provided !== token) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("builds" as never)
          .select("html")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return new Response(error.message, { status: 500 });
        if (!data) return new Response("Not found", { status: 404 });
        const { sanitizeForExport } = await import("@/lib/clean-export");
        return new Response(sanitizeForExport((data as { html: string }).html), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy": "sandbox allow-scripts;",
          },
        });
      },
    },
  },
});
