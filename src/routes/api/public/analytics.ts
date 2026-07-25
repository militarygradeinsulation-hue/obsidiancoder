// Public analytics ingest. Accepts a small JSON payload and logs it.
// Never returns PII; discards oversized bodies.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/analytics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const text = await request.text();
          if (text.length > 4096) return new Response("ok");
          // Best-effort log — Cloudflare tail / server logs will surface it.
          // eslint-disable-next-line no-console
          console.log("[analytics]", text.slice(0, 2048));
        } catch { /* noop */ }
        return new Response("ok", { headers: { "Cache-Control": "no-store" } });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "content-type",
          },
        }),
    },
  },
});
