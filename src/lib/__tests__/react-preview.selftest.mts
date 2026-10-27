import assert from "node:assert/strict";
import { buildFullAppFiles } from "../full-app-scaffold.ts";
import { compileReactPreview, preparePreviewSources, resolvePreviewImport } from "../react-preview.ts";

const html = '<html><body>Starter <b>design</b></body></html>';
const files = buildFullAppFiles(html, "Example App");
files["src/components/Badge.tsx"] =
  'export default function Badge(){ return <b>Active</b> }';
files["src/App.tsx"] =
  'import * as React from "react"; import Badge from "./components/Badge";\n' +
  'export default function App(){ return <main><Badge /></main> }';

assert.equal(resolvePreviewImport("src/App.tsx", "./components/Badge", files), "@obsidian-preview/src/components/Badge.tsx");
assert.equal(resolvePreviewImport("src/main.tsx", "./styles.css", files), "@obsidian-preview/src/styles.css");
assert.equal(resolvePreviewImport("src/main.tsx", "react", files), "react");
assert.throws(() => resolvePreviewImport("src/main.tsx", "../../../.env", files));
assert.throws(() => resolvePreviewImport("src/App.tsx", "./Missing", files));
assert.throws(() => resolvePreviewImport("src/App.tsx", "evil-external-package", files));

const prepared = preparePreviewSources(files);
assert.ok(prepared.css.includes("font-family"));
assert.ok(!Object.hasOwn(prepared.files, "src/styles.css"));
assert.ok(Object.hasOwn(prepared.files, "src/components/Badge.tsx"));
assert.throws(() => preparePreviewSources({ "src/App.tsx": "x" }));
assert.throws(() => preparePreviewSources({
  ...files, "src/huge.ts": "x".repeat(350_001),
}));

const preview = await compileReactPreview(files, "valid_test-nonce");
assert.ok(preview.fileCount >= 4);
assert.ok(preview.html.includes('sandbox') === false, "sandbox is enforced on the containing iframe");
assert.ok(preview.html.includes('Content-Security-Policy'));
assert.ok(preview.html.includes("default-src 'none'"));
assert.ok(preview.html.includes("obsidian.fullapp.preview.v1"));
assert.ok(preview.html.includes("valid_test-nonce"));
assert.ok(preview.html.includes("type=\"importmap\""));
assert.ok(preview.html.includes("https://esm.sh/react@19.2.0"));
assert.ok(!preview.html.includes("ALLOW_SAME_ORIGIN"));
assert.ok(!preview.html.includes("YOUR_PUBLISHABLE_KEY"), "real credentials must never be injected");

const mapText = preview.html.match(/<script type="importmap">([\s\S]+?)<\/script>/)?.[1];
assert.ok(mapText);
const map = JSON.parse(mapText!) as { imports: Record<string, string> };
const srcUrl = map.imports["@obsidian-preview/src/App.tsx"];
assert.ok(srcUrl.startsWith("data:text/javascript;base64,"));
const js = Buffer.from(srcUrl.split(",")[1], "base64").toString("utf8");
assert.ok(js.includes('@obsidian-preview/src/components/Badge.tsx'));
assert.ok(js.includes("react/jsx-runtime"));
assert.ok(!js.includes(": React.FC"), "TypeScript syntax transpiled");
const main = Buffer.from(map.imports["@obsidian-preview/src/main.tsx"].split(",")[1], "base64").toString("utf8");
assert.ok(main.includes('@obsidian-preview/src/App.tsx'));
assert.ok(!main.includes('import "./styles.css"'));

const bad = { ...files, "src/App.tsx": 'import x from "unapproved"; export default x;' };
await assert.rejects(() => compileReactPreview(bad, "nonce"), /Unsupported import|not supported/i);
const missing = { ...files, "src/App.tsx": 'import Missing from "./Missing"; export default Missing;' };
await assert.rejects(() => compileReactPreview(missing, "nonce"), /not found/i);
console.log("Isolated React live preview tests passed");
