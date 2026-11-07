import assert from "node:assert/strict";
import { build } from "esbuild";
const state = {
  claimed: true, calls: 0, failures: [] as string[], completed: [] as unknown[],
  row: { requestBody: { body: { prompt: "Build", currentHtml: "" }, authorization: "Bearer test", ownerCodeHeader: "test" } },
};
(globalThis as unknown as { workerTest: typeof state }).workerTest = state;
const bundle = await build({
  entryPoints: ["src/lib/run-build-job.server.ts"], bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{
    name: "worker-test-dependencies",
    setup(build) {
      build.onResolve({ filter: /^@\/lib\/build-jobs\.server$/ }, () => ({ path: "jobs", namespace: "test" }));
      build.onResolve({ filter: /^@\/lib\/credit-gate\.server$/ }, () => ({ path: "gate", namespace: "test" }));
      build.onResolve({ filter: /^@\/routes\/api\/generate$/ }, () => ({ path: "generate", namespace: "test" }));
      build.onResolve({ filter: /^@\/routes\/api\/patch$/ }, () => ({ path: "patch", namespace: "test" }));
      build.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
        contents: path === "jobs" ? [
          "const s=globalThis.workerTest;",
          "export const claimBuildJob=async()=>s.claimed;",
          "export const getBuildJob=async()=>s.row;",
          "export const failBuildJob=async(id,error)=>s.failures.push(error);",
          "export const completeBuildJob=async(id,result)=>s.completed.push(result);",
          "export const isBuildJobCancelRequested=async()=>false;",
          "export const cancelBuildJobRecord=async()=>{};",
        ].join("\n") : path === "gate" ? 'export const OWNER_CODE_HEADER="x-obsidian-owner-code";'
          : path === "patch" ? 'export async function handlePatch(){throw new Error("Not expected");}'
          : [
            "export async function handleGenerate(request,execution){",
            "const s=globalThis.workerTest; s.calls++;",
            "if(execution.claimedJobId!=='job-1')throw new Error('Missing trusted claim');",
            "if(request.headers.get('authorization')!=='Bearer test')throw new Error('Lost auth');",
            "return new Response(JSON.stringify({message:'Provider rejected request'}),{status:400,headers:{'content-type':'application/json'}}); }",
          ].join("\n"), loader: "js",
      }));
    },
  }],
});
const worker = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")) as {
  claimAndRunBuildJob: (id: string) => Promise<void>;
};
state.claimed = false;
await worker.claimAndRunBuildJob("job-1");
assert.equal(state.calls, 0, "A lost claim must never invoke the AI or charge again");
state.claimed = true;
await worker.claimAndRunBuildJob("job-1");
assert.equal(state.calls, 1);
assert.equal(state.failures[0], "Provider rejected request", "Non-success responses must become a terminal failure");
assert.equal(state.completed.length, 0);
console.log("Background worker claim and failure checks passed.");
