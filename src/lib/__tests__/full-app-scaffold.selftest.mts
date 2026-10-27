import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { buildFullAppFiles } from "../full-app-scaffold.ts";

const html = '<!doctype html><html><body><h1>Generated Design</h1><script>window.test = true;</script></body></html>';
const files = buildFullAppFiles(html, "Sample & App");
assert.ok(Object.keys(files).length >= 12);
assert.ok(files["src/generated-design.ts"].includes("Generated Design"));
assert.ok(files["src/generated-design.ts"].endsWith(";\n"));
assert.ok(files["src/App.tsx"].includes('sandbox="allow-scripts allow-forms"'));
assert.ok(!files["src/App.tsx"].includes('allow-same-origin'));
assert.ok(files["src/App.tsx"].includes("signInWithPassword"));
assert.ok(files["src/App.tsx"].includes('from("app_items")'));
assert.ok(files["supabase/migrations/001_app_items.sql"].includes("enable row level security"));
assert.ok(files["supabase/migrations/001_app_items.sql"].includes("auth.uid()"));
assert.ok(files["README.md"].startsWith("# Sample & App\n\n"));
assert.ok(files[".gitignore"].includes(".env.*"));
assert.ok(files[".env.example"].includes("PUBLISHABLE_KEY"));
assert.ok(!files[".env.example"].includes("SERVICE_ROLE_KEY"));
assert.throws(() => buildFullAppFiles("", "Blank"));
assert.throws(() => buildFullAppFiles("x".repeat(4_000_001), "Large"));

const root = mkdtempSync(join(tmpdir(), "obsidian-full-app-"));
try {
  for (const [path, content] of Object.entries(files)) {
    const dest = join(root, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content, "utf8");
  }
  if (process.env.VERIFY_FULL_APP_BUILD === "1") {
    execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: root, stdio: "inherit" });
    execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log("Full App scaffold tests passed");
