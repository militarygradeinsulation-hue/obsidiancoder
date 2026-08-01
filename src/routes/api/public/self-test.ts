// Self-test route — runs the pure-module fixtures and returns JSON.
// Public but read-only; no AI credits used.
import { createFileRoute } from "@tanstack/react-router";
import { runSelfTests, runPhaseBTests, runPocketPromoTests, runBuildDiscussionTests } from "@/lib/self-test";

export const Route = createFileRoute("/api/public/self-test")({
  server: {
    handlers: {
      GET: async () => {
        const [core, phaseB, promo, discussion] = await Promise.all([runSelfTests(), runPhaseBTests(), runPocketPromoTests(), runBuildDiscussionTests()]);
        const out = {
          results: [...core.results, ...phaseB.results, ...promo.results, ...discussion.results],
          passed: core.passed + phaseB.passed + promo.passed + discussion.passed,
          failed: core.failed + phaseB.failed + promo.failed + discussion.failed,
          phaseB: { passed: phaseB.passed, failed: phaseB.failed },
          pocketPromo: { passed: promo.passed, failed: promo.failed },
          buildDiscussion: { passed: discussion.passed, failed: discussion.failed },
        };
        return Response.json(out, {
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
