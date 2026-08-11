// Self-test route — runs the pure-module fixtures and returns JSON.
// Public but read-only; no AI credits used.
import { createFileRoute } from "@tanstack/react-router";
import { runSelfTests, runPhaseBTests, runPocketPromoTests, runBuildDiscussionTests, runPocketCreativeTests, runPocketHardeningTests, runBuildLearningTests, runBuildArchiveTests } from "@/lib/self-test";

export const Route = createFileRoute("/api/public/self-test")({
  server: {
    handlers: {
      GET: async () => {
        const [core, phaseB, promo, discussion, creative, hardening, learning, archive] = await Promise.all([runSelfTests(), runPhaseBTests(), runPocketPromoTests(), runBuildDiscussionTests(), runPocketCreativeTests(), runPocketHardeningTests(), runBuildLearningTests(), runBuildArchiveTests()]);
        const out = {
          results: [...core.results, ...phaseB.results, ...promo.results, ...discussion.results, ...creative.results, ...hardening.results, ...learning.results, ...archive.results],
          passed: core.passed + phaseB.passed + promo.passed + discussion.passed + creative.passed + hardening.passed + learning.passed + archive.passed,
          failed: core.failed + phaseB.failed + promo.failed + discussion.failed + creative.failed + hardening.failed + learning.failed + archive.failed,
          phaseB: { passed: phaseB.passed, failed: phaseB.failed },
          pocketPromo: { passed: promo.passed, failed: promo.failed },
          buildDiscussion: { passed: discussion.passed, failed: discussion.failed },
          pocketCreative: { passed: creative.passed, failed: creative.failed },
          pocketHardening: { passed: hardening.passed, failed: hardening.failed },
          buildLearning: { passed: learning.passed, failed: learning.failed },
          buildArchive: { passed: archive.passed, failed: archive.failed },

        };
        return Response.json(out, {
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
