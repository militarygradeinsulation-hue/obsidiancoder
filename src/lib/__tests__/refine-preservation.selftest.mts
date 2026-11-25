import assert from "node:assert/strict";
import { checkRefinePreservation } from "../refine-preservation.ts";

const stable = `<!doctype html><html><head><style>
:root{--bg:#100f14;--accent:#db861f;--text:#fff}
body{background:#100f14;color:#fff;font-family:Inter,system-ui}
.nav{display:flex}.hero{padding:80px}.card{border-radius:20px;box-shadow:0 10px 30px #0008}.footer{padding:24px}
</style></head><body>
<header class="nav"><nav class="nav-inner">Nav</nav></header>
<main>
<section class="hero"><h1>Title</h1></section>
<section class="features"><div class="card">One</div><div class="card">Two</div></section>
<section class="proof">Proof</section>
</main>
<footer class="footer">Footer</footer>
</body></html>`;

const focused = stable.replace("<h1>Title</h1>", "<h1>Updated title</h1>");
assert.equal(checkRefinePreservation(stable, focused, "Change the headline copy").ok, true);

const redesign = `<!doctype html><html><head><style>
body{background:#fff;color:#111;font-family:Georgia} .shell{display:grid}
</style></head><body><main class="shell"><section class="new-hero">Different</section></main></body></html>`;
const blocked = checkRefinePreservation(stable, redesign, "Add a customer photo");
assert.equal(blocked.ok, false);
assert.ok(blocked.blockers.some(x => x.includes("component/class drift")));
assert.ok(blocked.blockers.some(x => x.includes("CSS") || x.includes("section") || x.includes("palette")));

const explicit = checkRefinePreservation(stable, redesign, "Redesign the entire page with a new visual style and layout");
assert.equal(explicit.ok, true);

const appendedTheme = stable.replace(
  "</style>",
  `.new-theme{display:grid;grid-template-columns:1fr 1fr;gap:48px;padding:64px;margin:32px}
.hero,.features,.proof{display:grid;grid-template-columns:repeat(2,1fr);gap:40px;padding:56px}
body{background:#f8f8f8!important;color:#111!important;font-family:Georgia,serif!important}
</style>`,
);
const appendedBlocked = checkRefinePreservation(stable, appendedTheme, "Fix the CTA copy");
assert.equal(appendedBlocked.ok, false);
assert.ok(appendedBlocked.blockers.some(x => x.includes("CSS/theme expansion") || x.includes("palette") || x.includes("font")));

const addSection = stable.replace("</main>", '<section class="faq">FAQ</section></main>');
assert.equal(checkRefinePreservation(stable, addSection, "Add an FAQ section").ok, true);

console.log("Refine preservation contract tests passed");
