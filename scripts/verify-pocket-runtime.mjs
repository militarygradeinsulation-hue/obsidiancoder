import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pocket = readFileSync("src/routes/pocket.tsx", "utf8");
const createJob = readFileSync("src/routes/api/jobs.create.ts", "utf8");
const jobs = readFileSync("src/lib/build-jobs.server.ts", "utf8");
const generate = readFileSync("src/routes/api/generate.ts", "utf8");
const github = readFileSync("src/components/GithubModal.tsx", "utf8");
const assetRoute = readFileSync("src/routes/api/project-assets.ts", "utf8");

assert.ok(createJob.includes("kickBuildJob(jobId)"), "job creation must kick the server-owned runner");
assert.ok(createJob.includes("backgroundStarted"), "job create response must report background runner state");
assert.ok(jobs.includes('rpc("build_job_kick"'), "background kick must use durable database->HTTP runner");
assert.ok(pocket.includes("Building in background"), "Pocket must observe durable jobs instead of owning generation");
assert.ok(pocket.includes("durableJobInFlight"), "Pocket must preserve recovery markers for active server jobs");

assert.ok(generate.includes("preferDirectGoogle"), "Fast generation must prefer direct Google/Gemini");
assert.ok(generate.indexOf("if (preferDirectGoogle && googleKey)") < generate.indexOf("// 1. ChatLLM / RouteLLM"), "direct fast provider must be ordered before proxy fallbacks");

assert.ok(pocket.includes("<PocketProjectAssetsPanel"), "Pocket project image panel is not mounted");
assert.ok(pocket.includes("projectAssets: projectAssets.map"), "project image metadata is not sent to generation");
assert.ok(generate.includes("obsidian-asset://<id>"), "generation is missing lightweight project image token contract");
assert.ok(assetRoute.includes('.from("build-images")'), "project assets must reuse hosted build-images storage");
assert.ok(assetRoute.includes("getPublicUrl(path)"), "project assets must return stable public URLs");
assert.ok(pocket.includes('authFetch("/api/project-assets"'), "Pocket must host project assets before reuse");

assert.ok(pocket.includes("styleLockDirective(previous)"), "Refine must always apply style lock");
assert.ok(pocket.includes("checkRefinePreservation(previous, finalHtml, p)"), "Refine post-generation drift guard missing");
assert.ok(pocket.includes("forceRefine"), "post-build image insertion must be able to force Refine semantics");

assert.ok(github.includes("Connect owned domain"), "Pocket/static owned-domain UI missing");
assert.ok(github.includes("setManagedRepo(res.repo.name)"), "static deploy must retain repo for domain operations");
assert.ok(github.includes("Check DNS / HTTPS"), "domain DNS/HTTPS verification control missing");

console.log("PASS: Pocket background, speed, images, domain and refine guardrails verified.");
