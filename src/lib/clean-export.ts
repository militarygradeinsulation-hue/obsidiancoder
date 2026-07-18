// Clean-export sanitizer. Anything user-visible saved outside the preview
// (versions, gallery, downloads, project JSON, template payloads) must not
// contain preview-only instrumentation such as the runtime bridge or the
// inspector/flow command scripts. Pure string ops.

const PREVIEW_MARKERS = [
  /<script>\s*\(function\(\)\{[\s\S]*?obsidian\.runtime[\s\S]*?\}\)\(\);\s*<\/script>/g,
  /<script data-obsidian-preview=(?:"[^"]*"|'[^']*')[\s\S]*?<\/script>/g,
  /<script>\s*\(function\(\)\{[\s\S]*?obsidian\.(?:inspector|flow)[\s\S]*?\}\)\(\);\s*<\/script>/g,
];

export function stripPreviewOnly(html: string): string {
  if (!html) return html;
  let out = html;
  for (const rx of PREVIEW_MARKERS) out = out.replace(rx, "");
  return out;
}

export function containsPreviewOnly(html: string): boolean {
  return PREVIEW_MARKERS.some((rx) => { rx.lastIndex = 0; return rx.test(html); });
}
