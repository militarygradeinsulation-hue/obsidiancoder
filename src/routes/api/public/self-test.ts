// Self-test route — runs the pure-module fixtures and returns JSON.
// Public but read-only; no AI credits used.
import { createFileRoute } from "@tanstack/react-router";
import { runSelfTests, runPhaseBTests, runPocketPromoTests, runBuildDiscussionTests, runPocketCreativeTests, runPocketHardeningTests } from "@/lib/self-test";

export const Route = createFileRoute("/api/public/self-test")({
  server: {
    handlers: {
      GET: async () => {
        const [core, phaseB, promo, discussion, creative, hardening] = await Promise.all([runSelfTests(), runPhaseBTests(), runPocketPromoTests(), runBuildDiscussionTests(), runPocketCreativeTests(), runPocketHardeningTests()]);
        const out = {
          results: [...core.results, ...phaseB.results, ...promo.results, ...discussion.results, ...creative.results, ...hardening.results],
          passed: core.passed + phaseB.passed + promo.passed + discussion.passed + creative.passed + hardening.passed,
          failed: core.failed + phaseB.failed + promo.failed + discussion.failed + creative.failed + hardening.failed,
          phaseB: { passed: phaseB.passed, failed: phaseB.failed },
          pocketPromo: { passed: promo.passed, failed: promo.failed },
          buildDiscussion: { passed: discussion.passed, failed: discussion.failed },
          pocketCreative: { passed: creative.passed, failed: creative.failed },
          pocketHardening: { passed: hardening.passed, failed: hardening.failed },

        };
        return Response.json(out, {
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
