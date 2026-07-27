// Miniature sample UI used by the panel and the thumbnail harness.
// Renders the same fixture — nav, hero type, card, button, input, table,
// badge, surface — so previews vary structurally across blueprints instead
// of showing identical gradients/swatches.

import { compileBlueprint } from "./compile";
import type { ThemeBlueprint } from "./types";

const SAMPLE_BODY = `
<nav>
  <strong>Aurora</strong>
  <a href="#">Docs</a>
  <a href="#">Pricing</a>
  <button class="btn-secondary ghost">Sign in</button>
  <button>Get started</button>
</nav>
<section>
  <h1>Ship real interfaces.</h1>
  <p class="muted">Blueprint preview using nav, hero, card, form, table, and badge surfaces.</p>
  <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;">
    <article class="card">
      <h3>Live signal</h3>
      <p>Streaming events at 12.4k/s.</p>
      <span class="badge">stable</span>
    </article>
    <article class="card">
      <h3>Sign in</h3>
      <label>Email<input type="email" value="you@company.com" /></label>
      <button>Continue</button>
    </article>
  </div>
  <table>
    <thead><tr><th>Region</th><th>Users</th><th>Uptime</th></tr></thead>
    <tbody>
      <tr><td>US-East</td><td>18,204</td><td>99.98%</td></tr>
      <tr><td>EU-West</td><td>12,041</td><td>99.94%</td></tr>
    </tbody>
  </table>
</section>
`.trim();

export function renderPreviewHtml(bp: ThemeBlueprint, opts?: { widthPx?: number }): string {
  const width = opts?.widthPx ?? 1024;
  const compiled = compileBlueprint(bp);
  const link = compiled.linkHref
    ? `<link rel="stylesheet" href="${compiled.linkHref}">`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${bp.name} preview</title>${link}<style>${compiled.css}</style><style>html,body{width:${width}px;}nav{display:flex;gap:16px;align-items:center;}nav a{margin-right:8px;}nav button{margin-left:auto;}label{display:block;margin:8px 0;}input{width:100%;box-sizing:border-box;}.grid{gap:16px;margin:16px 0;}</style></head><body>${SAMPLE_BODY}</body></html>`;
}
