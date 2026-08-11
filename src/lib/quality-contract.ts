// Deterministic quality contract.
//
// Two halves, both cheap and both off the model's critical path:
//   1. `qualityContractFragment()` — a hard prompt clause the generator gets
//      alongside the art-direction brief.
//   2. `enforceQualityContract()` — a post-generation, purely local pass that
//      repairs the two defects the models keep shipping: declared web fonts
//      that never load, and interactive elements with no visible focus ring.
//
// No network, no model call, no async. Safe to run on every committed build.

/** Families that are actually servable from Google Fonts. */
const GOOGLE_FONTS = new Set(
  [
    "Inter", "DM Sans", "Space Grotesk", "Manrope", "Sora", "Outfit", "Figtree",
    "Plus Jakarta Sans", "Syne", "Urbanist", "Epilogue", "Work Sans", "Rubik",
    "Archivo", "Archivo Black", "Bebas Neue", "Barlow", "Hind", "Cabin",
    "Instrument Serif", "DM Serif Display", "Cormorant", "Cormorant Garamond",
    "Karla", "Libre Baskerville", "IBM Plex Sans", "IBM Plex Mono", "Lora",
    "Nunito Sans", "Playfair Display", "Fraunces", "Abril Fatface",
    "JetBrains Mono", "Space Mono", "Poppins", "Montserrat", "Raleway",
    "Roboto", "Roboto Mono", "Open Sans", "Lato", "Merriweather", "Oswald",
    "Source Serif 4", "Spectral", "Chivo", "Anton", "Unbounded", "Bricolage Grotesque",
  ].map((f) => f.toLowerCase()) as readonly string[],
);

/** Never treat these as loadable webfont names. */
const GENERIC = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui",
  "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "inherit",
  "initial", "unset", "revert", "-apple-system", "blinkmacsystemfont",
  "segoe ui", "helvetica", "helvetica neue", "arial", "georgia", "times",
  "times new roman", "courier", "courier new", "monaco", "menlo", "consolas",
  "emoji", "math", "tahoma", "verdana", "impact",
]);

export const QUALITY_CONTRACT_VERSION = "qc-1";

/**
 * Non-negotiable output requirements, appended to the brief with maximum
 * authority. Short on purpose — long contracts get diluted.
 */
export function qualityContractFragment(): string {
  return [
    "NON-NEGOTIABLE OUTPUT CONTRACT (violating any point makes the build unusable):",
    "1. TYPEFACES MUST ACTUALLY LOAD. Only use font families available on Google Fonts, and include the matching <link rel=\"preconnect\"> + <link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=...&display=swap\"> in <head>. Never name a font you have not linked — an unlinked family silently renders as the system default and destroys the design.",
    "2. VECTOR CRAFT REQUIRED. Include at least 6 inline <svg> elements — real icons, marks, dividers or background geometry drawn with paths. Emoji are not icons and do not count.",
    "3. FOCUS STATES REQUIRED. Every interactive element (a, button, input, select, textarea, [tabindex]) needs a visible :focus-visible ring with a real offset. No `outline: none` without a replacement ring.",
    "4. GENUINE RESPONSIVE COMPOSITION. At least 3 real breakpoints that change layout structure (column counts, hero composition, nav pattern) — not just font-size tweaks.",
    "5. NO PRESET SHORTHAND. Do not settle for the stock recipe of the chosen archetype; commit to one authored detail that is specific to this product.",
  ].join("\n");
}

type FoundFont = { name: string; lower: string };

/** Collect font family names declared anywhere in the document's CSS. */
export function declaredFontFamilies(html: string): FoundFont[] {
  const out = new Map<string, FoundFont>();
  const decl = /font-family\s*:\s*([^;}<]+)/gi;
  const varDecl = /--[\w-]*font[\w-]*\s*:\s*([^;}<]+)/gi;
  const collect = (list: string) => {
    for (const partRaw of list.split(",")) {
      const part = partRaw.trim().replace(/^["']|["']$/g, "").trim();
      if (!part || part.startsWith("var(")) continue;
      const lower = part.toLowerCase();
      if (GENERIC.has(lower)) continue;
      if (!/^[A-Za-z][A-Za-z0-9 '&.-]*$/.test(part)) continue;
      if (!out.has(lower)) out.set(lower, { name: part, lower });
    }
  };
  let m: RegExpExecArray | null;
  while ((m = decl.exec(html))) collect(m[1]);
  while ((m = varDecl.exec(html))) collect(m[1]);
  return [...out.values()];
}

function hasFontLoader(html: string, lower: string): boolean {
  const head = html.slice(0, Math.max(html.indexOf("</head>"), 0) || html.length);
  const slug = lower.replace(/\s+/g, "+");
  if (new RegExp(`fonts\\.googleapis\\.com[^"']*${slug.replace(/\+/g, "\\+")}`, "i").test(head)) return true;
  // Any @font-face declaring this family counts as loaded.
  const faces = html.match(/@font-face\s*{[^}]*}/gi) ?? [];
  return faces.some((f) => f.toLowerCase().includes(lower));
}

export type QualityContractResult = {
  html: string;
  /** Human-readable list of repairs actually applied. */
  fixes: string[];
  /** Families named by the document that could not be loaded from Google Fonts. */
  unloadableFonts: string[];
};

const FOCUS_MARKER = "obs-focus-contract";

/**
 * Deterministically repair the committed document. Idempotent.
 */
export function enforceQualityContract(html: string): QualityContractResult {
  const fixes: string[] = [];
  const unloadable: string[] = [];
  let out = html;

  if (!/<head[\s>]/i.test(out)) {
    return { html: out, fixes, unloadableFonts: unloadable };
  }

  // --- 1. Fonts declared but never loaded -----------------------------------
  const missing: FoundFont[] = [];
  for (const f of declaredFontFamilies(out)) {
    if (hasFontLoader(out, f.lower)) continue;
    if (GOOGLE_FONTS.has(f.lower)) missing.push(f);
    else unloadable.push(f.name);
  }
  if (missing.length) {
    const families = missing
      .slice(0, 4)
      .map((f) => `family=${f.name.replace(/\s+/g, "+")}:wght@300;400;500;600;700;800`)
      .join("&");
    const preconnect = /fonts\.gstatic\.com/i.test(out)
      ? ""
      : '\n  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>';
    const link = `${preconnect}\n  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families}&display=swap">`;
    out = out.replace(/<head([^>]*)>/i, (m0) => `${m0}${link}`);
    fixes.push(`linked ${missing.length} declared font${missing.length === 1 ? "" : "s"} (${missing.map((f) => f.name).join(", ")})`);
  }

  // --- 2. Visible focus ring ------------------------------------------------
  const hasFocusVisible = /:focus-visible/i.test(out);
  if (!hasFocusVisible && !out.includes(FOCUS_MARKER)) {
    const css = `\n  <style data-${FOCUS_MARKER}>\n    a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible, [tabindex]:focus-visible {\n      outline: 2px solid currentColor;\n      outline-offset: 3px;\n      border-radius: 4px;\n    }\n  </style>`;
    out = out.replace(/<\/head>/i, `${css}\n</head>`);
    fixes.push("added focus-visible rings for interactive elements");
  }

  return { html: out, fixes, unloadableFonts: [...new Set(unloadable)] };
}
