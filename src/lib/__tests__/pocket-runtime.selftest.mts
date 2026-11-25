import assert from "node:assert/strict";
import { checkRefinePreservation } from "../refine-preservation.ts";
import { resolvePocketAssetTokens } from "../pocket-project-assets.ts";

const stable = `<!doctype html>
<html><head><style>
:root{--bg:#100f14;--accent:#db861f;--panel:#1a1820}
body{font-family:Inter,sans-serif;background:#100f14;color:#fff}
.card{background:#1a1820;border:1px solid #db861f;border-radius:16px}
</style></head><body>
<header><nav>Nav</nav></header>
<main><section><h1>Original</h1><div class="card">Card</div></section><section>Second</section></main>
<footer>Footer</footer>
</body></html>`;

const focused = stable.replace("Original", "Updated title");
assert.equal(checkRefinePreservation(stable, focused, "change the headline").ok, true);

const redesign = `<!doctype html><html><head><style>
body{font-family:Georgia,serif;background:#ffffff;color:#111}
.panel{background:#efefef;color:#0a0a0a}
</style></head><body><main><section>Redesign</section></main></body></html>`;
const blocked = checkRefinePreservation(stable, redesign, "fix the button text");
assert.equal(blocked.ok, false);
assert.ok(blocked.blockers.some((item) => item.includes("palette") || item.includes("font") || item.includes("structure")));

const requestedTheme = checkRefinePreservation(stable, stable.replaceAll("#100f14", "#001122"), "change the color palette to navy");
assert.equal(requestedTheme.ok, true);

const assets = [
  { id: "hero-1", name: "hero.webp", dataUrl: "data:image/webp;base64,AAA", createdAt: 1 },
  { id: "logo-2", name: "logo.webp", dataUrl: "data:image/webp;base64,BBB", createdAt: 2 },
];
const resolved = resolvePocketAssetTokens(
  '<img src="obsidian-asset://hero-1"><div style="background:url(obsidian-asset://logo-2)"></div>',
  assets,
);
assert.ok(resolved.includes("data:image/webp;base64,AAA"));
assert.ok(resolved.includes("data:image/webp;base64,BBB"));
assert.equal(resolved.includes("obsidian-asset://"), false);

console.log("Pocket refine-preservation and asset-token tests passed");
