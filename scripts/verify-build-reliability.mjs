import { buildSync } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "obsidian-verify-"));
try {
  for (const name of ["build-reliability", "background-worker", "full-app-managed-build", "native-full-app", "full-app-scaffold"]) {
    const output = join(dir, name + ".mjs");
    // Put bundled tests under the repository when resolving installed test dependencies.
    if (name === "background-worker") {
      execFileSync(process.execPath, ["--experimental-strip-types", "src/lib/__tests__/background-worker.selftest.mts"], { stdio: "inherit" });
    } else {
      // Pure tests are fully bundled so the temporary folder needs no node_modules.
      buildSync({ entryPoints: ["src/lib/__tests__/" + name + ".selftest.mts"], bundle: true, platform: "node", format: "esm", outfile: output });
      execFileSync(process.execPath, [output], { stdio: "inherit" });
    }
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
