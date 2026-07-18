// Health probe. Reports whether the AI gateway is configured, plus current
// circuit-breaker state per provider/model. No secrets in the response.

import { createFileRoute } from "@tanstack/react-router";
import { snapshotAll } from "@/lib/circuit-breaker";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const hasKey = !!process.env.LOVABLE_API_KEY;
        return Response.json(
          {
            ok: true,
            time: new Date().toISOString(),
            ai: {
              configured: hasKey,
              breakers: snapshotAll(),
            },
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
