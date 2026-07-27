// Self-test route — runs the pure-module fixtures and returns JSON.
// Public but read-only; no AI credits used.
import { createFileRoute } from "@tanstack/react-router";
import { runSelfTests, runPhaseBTests } from "@/lib/self-test";

export const Route = createFileRoute("/api/public/self-test")({
  server: {
    handlers: {
      GET: async () => {
        const [core, phaseB] = await Promise.all([runSelfTests(), runPhaseBTests()]);
        const out = {
          results: [...core.results, ...phaseB.results],
          passed: core.passed + phaseB.passed,
          failed: core.failed + phaseB.failed,
          phaseB: { passed: phaseB.passed, failed: phaseB.failed },
        };
        return Response.json(out, {
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
