import assert from "node:assert/strict";
import { buildFullAppFiles } from "../full-app-scaffold.ts";
import {
  isEditableAppPath, parseAppEditPlan, applyAppEditPlan,
  reconcileFullAppFiles, workspaceFingerprint,
} from "../full-app-edits.ts";

const html = '<!doctype html><html><head></head><body><h1>Hello</h1></body></html>';
const initial = buildFullAppFiles(html, "Example");
const before = workspaceFingerprint(initial);
assert.ok(isEditableAppPath("src/App.tsx"));
assert.ok(isEditableAppPath("src/components/Dashboard.tsx"));
assert.ok(isEditableAppPath("supabase/migrations/002_notes.sql"));
for (const unsafe of [
  "../.env", "src/../secrets.ts", "src/lib/supabase.ts", "src/generated-design.ts",
  "src/main.tsx", "package.json", ".env.local", "/src/App.tsx",
  "src/components/.secret.ts", "supabase/migrations/001_app_items.sql",
  "src/components/Nested/../../.env", "node_modules/x.js",
]) assert.equal(isEditableAppPath(unsafe), false, unsafe);

const plan = parseAppEditPlan({
  summary: "Add dashboard",
  edits: [
    { action: "write", path: "src/components/Dashboard.tsx", content: "export default function Dashboard(){ return <p>Hi</p> }" },
    { action: "write", path: "src/App.tsx", content: "import Dashboard from './components/Dashboard'; export default Dashboard;" },
  ],
});
const next = applyAppEditPlan(initial, plan);
assert.equal(initial["src/components/Dashboard.tsx"], undefined, "original never mutated");
assert.ok(next["src/components/Dashboard.tsx"].includes("Dashboard"));
assert.equal(workspaceFingerprint(initial), before);
assert.notEqual(workspaceFingerprint(next), before);
assert.equal(reconcileFullAppFiles(html, "Example", next)["src/App.tsx"], next["src/App.tsx"]);
assert.throws(() => parseAppEditPlan({ summary: "Unsafe", edits: [{ action: "write", path: ".env.local", content: "SECRET=1" }] }));
assert.throws(() => parseAppEditPlan({ summary: "Duplicate", edits: [
  { action: "write", path: "src/App.tsx", content: "hello" },
  { action: "delete", path: "src/App.tsx" },
] }));
assert.throws(() => applyAppEditPlan(initial, { summary: "Delete required", edits: [{ action: "delete", path: "src/App.tsx" }] }));
assert.throws(() => reconcileFullAppFiles(html, "Example", { ...initial, "src/generated-design.ts": "evil" }));
assert.throws(() => reconcileFullAppFiles(html, "Example", { ...initial, ".env.local": "SECRET=1" }));
const removed = applyAppEditPlan(next, { summary: "Delete component", edits: [{ action: "delete", path: "src/components/Dashboard.tsx" }] });
assert.equal(removed["src/components/Dashboard.tsx"], undefined);
console.log("native full app multi-file tests passed");
