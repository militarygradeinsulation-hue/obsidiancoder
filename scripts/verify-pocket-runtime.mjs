import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pocket = readFileSync("src/routes/pocket.tsx", "utf8");
const createJob = readFileSync("src/routes/api/jobs.create.ts", "utf8");
const jobs = readFileSync("src/lib/build-jobs.server.ts", "utf8");
const generate = readFileSync("src/routes/api/generate.ts", "utf8");
const github = readFileSync("src/components/GithubModal.tsx", "utf8");
const assetRoute = readFileSync("src/routes/api/project-assets.ts", "utf8");
const assetStore = readFileSync("src/lib/pocket-project-assets.ts", "utf8");
const vibe = readFileSync("src/routes/index.tsx", "utf8");

assert.ok(createJob.includes("kickBuildJob(jobId)"), "job creation must kick the server-owned runner");
assert.ok(createJob.includes("backgroundStarted"), "job create response must report background runner state");
assert.ok(jobs.includes('rpc("build_job_kick"'), "background kick must use durable database->HTTP runner");
assert.ok(pocket.includes("Building in background"), "Pocket must observe durable jobs instead of owning generation");
assert.ok(pocket.includes("durableJobInFlight"), "Pocket must preserve recovery markers for active server jobs");
assert.ok(pocket.includes("MAX_POLL_MS = 20 * 60_000"), "long-running background recovery window regressed");
assert.ok(pocket.includes("Build is still running in the background — you can leave and check later"), "long build recovery message missing");

assert.ok(generate.includes("preferDirectGoogle"), "Fast generation must prefer direct Google/Gemini");
assert.ok(generate.indexOf("if (preferDirectGoogle && googleKey)") < generate.indexOf("// 1. ChatLLM / RouteLLM"), "direct fast provider must be ordered before proxy fallbacks");
assert.ok(generate.includes("const ENRICHMENT_BUDGET_MS = 1_500"), "optional pre-stream enrichment budget must stay tight");
assert.ok(pocket.includes('profile === "cinematic" && paidAccess'), "remote concept planner should be reserved for cinematic builds");
assert.ok(pocket.includes("Studio speed path"), "Studio local art-direction speed path missing");
assert.ok(pocket.includes("Background cinematic polish applied"), "cinematic polish must remain post-commit/background");

assert.ok(pocket.includes("<PocketProjectAssetsPanel"), "Pocket project image panel is not mounted");
assert.ok(pocket.includes("projectAssets: projectAssets.map"), "project image metadata is not sent to generation");
assert.ok(generate.includes("obsidian-asset://<id>"), "generation is missing lightweight project image token contract");
assert.ok(generate.includes("active project media"), "fresh builds must prioritize images uploaded before generation");
assert.ok(assetRoute.includes('.from("build-images")'), "project assets must reuse hosted build-images storage");
assert.ok(assetRoute.includes("getPublicUrl(path)"), "project assets must return stable public URLs");
assert.ok(pocket.includes('authFetch("/api/project-assets"'), "Pocket must host project assets before reuse");
assert.ok(assetStore.includes("POCKET_ASSET_MAX = 8"), "Pocket project image cap should allow eight assets");
assert.ok(pocket.includes("assetIds: projectAssets.map"), "project-specific image selection must persist with the Pocket session");

assert.ok(pocket.includes("styleLockDirective(previous)"), "Refine must always apply style lock");
assert.ok(pocket.includes("checkRefinePreservation(previous, finalHtml, p)"), "Refine post-generation drift guard missing");
assert.ok(pocket.includes("forceRefine"), "post-build image insertion must be able to force Refine semantics");
assert.ok(vibe.includes('checkRefinePreservation(stableHtml, finalHtml, basePrompt)'), "main Vibe refinements must enforce the same deterministic design-preservation guard");
assert.ok(vibe.includes("Mount-independent completion persistence"), "Vibe must persist a completed build even after route navigation");
assert.ok(vibe.includes("dualSafeSet(STORAGE_KEY, persisted)"), "Vibe completion must write directly to durable session storage");

assert.ok(github.includes("Connect owned domain"), "Pocket/static owned-domain UI missing");
assert.ok(github.includes("setManagedRepo(res.repo.name)"), "static deploy must retain repo for domain operations");
assert.ok(github.includes("Check DNS / HTTPS"), "domain DNS/HTTPS verification control missing");
assert.ok(pocket.includes("Connect owned domain"), "Pocket live-build dialog must expose the owned-domain flow");
assert.ok(pocket.includes("onProductionUpdate={(patch) =>"), "Pocket must receive Pages/custom-domain production URLs");

console.log("PASS: Pocket background, speed, images, domain and refine guardrails verified.");
