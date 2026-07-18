// Self-test route — runs the pure-module fixtures and returns JSON.
// Public but read-only; no AI credits used.
import { createFileRoute } from "@tanstack/react-router";
import { runSelfTests } from "@/lib/self-test";

export const Route = createFileRoute("/api/public/self-test")({
  server: {
    handlers: {
      GET: async () => {
        const out = runSelfTests();
        return Response.json(out, {
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
