// Public status endpoint for the one-shot free demo. Never returns PII.
// Ensures the HttpOnly demo cookie exists so a subsequent /api/generate
// call can be atomically matched by the same fingerprint.

import { createFileRoute } from "@tanstack/react-router";
import { isFreeDemoUsed } from "@/lib/free-demo.server";
import { serverStripeEnv } from "@/lib/credit-gate.server";

export const Route = createFileRoute("/api/public/free-demo/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = serverStripeEnv();
        const { used, setCookieHeader, unavailable } = await isFreeDemoUsed(request, env);
        const body = {
          available: !used && !unavailable,
          alreadyUsed: used,
          environment: env,
        };
        const headers: Record<string, string> = {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        };
        if (setCookieHeader) headers["Set-Cookie"] = setCookieHeader;
        return new Response(JSON.stringify(body), { status: 200, headers });
      },
    },
  },
});
