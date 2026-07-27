// Read-only baseline report — no AI credits, no ledger writes.
// GET returns JSON; ?format=md returns a human-readable markdown report.
import { createFileRoute } from "@tanstack/react-router";
import { runBaseline, formatBaseline } from "@/lib/baseline/report";

export const Route = createFileRoute("/api/public/baseline")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const reports = runBaseline();
        if (url.searchParams.get("format") === "md") {
          return new Response(formatBaseline(reports), {
            headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" },
          });
        }
        return Response.json(
          { generatedAt: new Date().toISOString(), reports },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
