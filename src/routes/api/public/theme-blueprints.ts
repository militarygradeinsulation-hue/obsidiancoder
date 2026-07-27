// Read-only listing + on-demand preview for built-in ThemeBlueprints.
// No AI credits, no writes. `?format=preview&id=<id>` returns a standalone
// HTML preview page; default returns JSON metadata for the UI.
import { createFileRoute } from "@tanstack/react-router";
import { BUILT_IN_BLUEPRINTS, compileBlueprint, computeSignature, getBuiltIn, renderPreviewHtml } from "@/lib/theme-blueprints";

export const Route = createFileRoute("/api/public/theme-blueprints")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const format = url.searchParams.get("format");
        const id = url.searchParams.get("id");
        if (format === "preview" && id) {
          const bp = getBuiltIn(id);
          if (!bp) return new Response("Unknown blueprint", { status: 404 });
          return new Response(renderPreviewHtml(bp), {
            headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
          });
        }
        if (format === "css" && id) {
          const bp = getBuiltIn(id);
          if (!bp) return new Response("Unknown blueprint", { status: 404 });
          const c = compileBlueprint(bp);
          return new Response(c.css, {
            headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-store" },
          });
        }
        const items = BUILT_IN_BLUEPRINTS.map((bp) => ({
          id: bp.id,
          name: bp.name,
          description: bp.description,
          source: bp.source,
          layout: bp.layout,
          mode: bp.color.mode,
          swatches: [bp.color.bg, bp.color.surface, bp.color.accent, bp.color.text, bp.color.border],
          signature: computeSignature(bp),
        }));
        return Response.json({ items, count: items.length }, {
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
