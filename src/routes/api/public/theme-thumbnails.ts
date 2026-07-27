// Thumbnail harness — renders the same fixture at ~200px across every
// built-in blueprint on one page. Used for human-eye variance checks and
// automated screenshot capture. Read-only, no credits, no writes.
import { createFileRoute } from "@tanstack/react-router";
import { BUILT_IN_BLUEPRINTS, compileBlueprint } from "@/lib/theme-blueprints";
import { renderPreviewHtml } from "@/lib/theme-blueprints/preview";

export const Route = createFileRoute("/api/public/theme-thumbnails")({
  server: {
    handlers: {
      GET: async () => {
        const tiles = BUILT_IN_BLUEPRINTS.map((bp) => {
          const compiled = compileBlueprint(bp);
          // Encode preview as data URL so each iframe is fully self-contained.
          const inner = renderPreviewHtml(bp, { widthPx: 1000 });
          const src = "data:text/html;charset=utf-8," + encodeURIComponent(inner);
          return `<figure data-blueprint="${bp.id}">
  <iframe src="${src}" title="${bp.name}" loading="lazy" aria-label="Preview of ${bp.name}"></iframe>
  <figcaption><strong>${bp.name}</strong><br><small>${bp.layout} · ${bp.color.mode} · ${compiled.css.length}b</small></figcaption>
</figure>`;
        }).join("\n");
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Obsidian theme thumbnails</title><style>
:root{color-scheme:light dark}body{margin:0;padding:24px;font-family:ui-sans-serif,system-ui;background:#0b0b0b;color:#eaeaea}
h1{margin:0 0 16px;font-size:18px;letter-spacing:.02em}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px}
figure{margin:0;background:#111;border-radius:10px;overflow:hidden;border:1px solid #222}
iframe{width:100%;height:280px;border:0;background:#fff;display:block;transform:scale(.2);transform-origin:top left;width:500%;height:1400px}
.frame{overflow:hidden;height:280px}
figcaption{padding:10px 12px;font-size:12px;line-height:1.4;background:#0f0f0f;border-top:1px solid #222}
</style></head><body>
<h1>Obsidian ThemeBlueprint thumbnails · ${BUILT_IN_BLUEPRINTS.length} built-ins · same fixture across all</h1>
<p style="opacity:.7;font-size:12px">Each tile renders the same nav+hero+card+form+table fixture at ~200px logical width via CSS transform. Screenshotting a single tile is sufficient — no framework required.</p>
<div class="grid">
${tiles.replace(/<iframe/g, '<div class="frame"><iframe').replace(/<\/iframe>/g, "</iframe></div>")}
</div>
</body></html>`;
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
