// Deterministic attribution footer appended to every committed build.
//
// Idempotent and purely local: it never calls a model and never mutates
// anything above the closing </body>. Documents without a <body> (bare
// fragments, patches) are returned untouched.

export const SIGNATURE_MARKER = "obs-build-signature";

export const SIGNATURE_TAGLINE = "Build in Obsidian, Finish in Lovable.";
export const SIGNATURE_BLURB =
  "Build where experimentation is cheap. Finish where production is powerful. Obsidian becomes the daily-driver development environment for builders who don't want every idea, mistake, experiment, or revision consuming expensive credits.";

export type SignatureResult = {
  html: string;
  /** True iff this call actually inserted the footer. */
  added: boolean;
};

function signatureHtml(): string {
  return `
<footer data-${SIGNATURE_MARKER} style="box-sizing:border-box;width:100%;padding:40px 24px;background:#0b0c0e;color:#e8e6e3;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;border-top:1px solid rgba(244,161,37,0.28);">
  <div style="max-width:760px;margin:0 auto;text-align:center;display:flex;flex-direction:column;gap:12px;">
    <p style="margin:0;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(232,230,227,0.62);">
      Built by <a href="https://aetheris.technology" target="_blank" rel="noopener noreferrer" style="color:#f4a125;text-decoration:none;">Aetheris.technology</a>
      &amp; <a href="https://obsidianvibe.live" target="_blank" rel="noopener noreferrer" style="color:#f4a125;text-decoration:none;">Obsidianvibe.live</a>
    </p>
    <p style="margin:0;font-size:20px;line-height:1.3;font-weight:600;color:#f4a125;">${SIGNATURE_TAGLINE}</p>
    <p style="margin:0;font-size:14px;line-height:1.65;color:rgba(232,230,227,0.72);">${SIGNATURE_BLURB}</p>
  </div>
</footer>
`;
}

/**
 * Append the Obsidian attribution footer just before </body>. Idempotent —
 * a document that already carries the marker is returned unchanged.
 */
export function ensureBuildSignature(html: string): SignatureResult {
  if (!html || html.includes(SIGNATURE_MARKER)) return { html, added: false };
  if (!/<\/body\s*>/i.test(html)) return { html, added: false };
  const out = html.replace(/<\/body\s*>/i, `${signatureHtml()}</body>`);
  return { html: out, added: out !== html };
}
