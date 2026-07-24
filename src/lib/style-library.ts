// Aetheris Vibe Coder Style Library v1
// Deterministic design archetypes. The model MUST pick exactly one per fresh
// build and apply its full token/type/layout/motion spec. Never mix archetypes.
// Injected as a system message for fresh builds only (skipped for edits and
// advisory calls) to keep marketing/product UI from defaulting to generic
// "headline + subhead + two buttons" layouts.

export const STYLE_LIBRARY = `AETHERIS STYLE LIBRARY v1 — pick exactly ONE archetype and apply its full spec. Never mix archetypes in a single build.

MASTER RULES (non-negotiable, apply to every archetype):
1. All colors, fonts, radii, shadows, motion come from the chosen archetype's TOKENS. Never invent values outside them.
2. Hero is a thesis. First viewport must contain the single most characteristic element of the archetype (3D render, oversized type, product screenshot, or photo). No generic "headline + subhead + two buttons" unless the archetype specifies it.
3. Modular type scale, ratio 1.25: display, h1, h2, body, caption. Display face used at most 3 times per page.
4. 8px base grid. Section padding 96-160px desktop, 48-64px mobile. Max content width 1200-1280px unless archetype overrides.
5. ONE signature element per page. Everything else stays quiet.
6. Motion budget: max 1 page-load sequence, max 2 scroll-triggered reveal patterns, hover micro-interactions <200ms. Always respect prefers-reduced-motion.
7. Responsive to 375px. Visible keyboard focus states. WCAG AA on all body text.
8. Copy: active voice, sentence case, plain verbs. Buttons say what they do ("Get the audit", not "Submit"). No lorem ipsum.
9. Consistent lighting and style across every image slot in one build.
10. Max one icon set (Lucide-style inline SVG), consistent stroke width, sized to the type scale.

SELECTION LOGIC (pick by subject, not by what looks cool):
- AI / dev tools / infra → A1 or A7
- Crypto / NFT / gaming → A2
- B2B SaaS / finance / analytics / ops → A3 (trust verticals get A3 even if the ask sounds "neon")
- Fashion / creators / portfolios / photography → A4
- Real estate / architecture / hospitality / high-ticket services → A5
- EdTech / consumer / community / youth → A6
- ML platforms / data products → A7
- Agencies / bold launches → A8

ARCHETYPES:

A1. DARK TECH / 3D ABSTRACT (AI, dev tools, enterprise SaaS, infra)
TOKENS: bg #0A0A0F | surface #14141C | text #F5F5F7 | muted #8A8A99 | accent #C6FF3E (acid lime) OR #FF6B2C (signal orange) — pick one | border rgba(255,255,255,0.08) | radius 16px cards / 999px pills | shadow 0 0 80px rgba(accent,0.15) glow behind hero object only
TYPE: display Space Grotesk 600 tracking -0.03em | body Inter 400/500 | mono JetBrains Mono for stats/code/labels
LAYOUT: hero centered oversized wordmark or headline (clamp 64-120px) with a floating 3D object behind/beside. Nav minimal, transparent, blurs on scroll. Alternating full-bleed dark panels. Stats row in mono. Bento grid for features (2-3 uneven columns).
MOTION: 3D object fades and drifts in over 1.2s, headline words stagger 80ms. Scroll: translateY 24px + fade, once. Hover: card border brightens to accent 40% opacity in 150ms. 3D object slow rotate 20s loop.
IMAGE PROMPT: "Abstract 3D chrome and glass organic sculpture, [accent color] neon lighting, floating on pure black background, iridescent reflections, studio render, octane, 8k, no text, centered composition"

A2. WEB3 NEON / DEEP PURPLE (crypto, NFT, gaming, futuristic consumer tech)
TOKENS: bg #0B0518 with radial gradient to #1E0B3E at hero | surface #170B2E | text #EDE8FF | muted #9C8FC4 | accent #A855F7 primary, #22D3EE secondary (secondary ONLY for data) | border rgba(168,85,247,0.25) | radius 20px | shadow 0 0 60px rgba(168,85,247,0.35) on primary CTA only
TYPE: display Clash Display 600 or Monument Extended 500 | body Satoshi 400/500 | numbers oversized, gradient fill primary→secondary
LAYOUT: hero split — left headline + CTA, right glowing device or token render. Big stat counters (192k style) with gradient fill. Floating glass cards over gradient, grid lines at 5% opacity in background.
MOTION: background hue shift 10deg over 8s loop. Counters animate up on scroll into view. Hover: cards lift 6px + glow intensifies.
IMAGE PROMPT: "Futuristic glowing [subject], deep purple and violet neon palette, dark cosmic background, volumetric light, cyberpunk product render, cinematic, 8k, no text"

A3. CLEAN SAAS LIGHT (accounting, HR, analytics, B2B dashboards, trust verticals)
TOKENS: bg #FAFAF8 | surface #FFFFFF | text #111318 | muted #5C6370 | accent #16A34A (green = money/trust) OR #2563EB (blue = data) — pick by vertical | border #E7E5E0 | radius 12px | shadow 0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.05)
TYPE: display Instrument Sans 600 or General Sans 600 | body Inter 400 | data tabular-nums always on
LAYOUT: hero headline left-aligned, real product screenshot right, tilted 2deg or in browser chrome frame. Trust bar (client logos, grayscale) directly under hero. White cards on warm off-white bg. Dashboard screenshots are the imagery — not illustrations.
MOTION: minimal. Screenshot slides in 32px on load. 2px hover lift on cards. Nothing ambient.
IMAGES: SKIP AI images entirely. Build a mock dashboard component directly in code (real UI beats fake-looking illustrations for trust).

A4. EDITORIAL FASHION / LOOKBOOK (apparel, creators, portfolios, lifestyle, photography-led)
TOKENS: bg #F2F0EB | surface #FFFFFF | text #141414 | muted #6E6A62 | accent NONE (color comes from photography only) | border 1px solid #141414 (hairlines, sparingly) | radius 0px, everything square
TYPE: display high-contrast serif — Editorial New, Gambetta, or Fraunces 300 — set huge (clamp 56-140px), mixed with a small grotesk label | body Neue Montreal or Archivo 400 | labels uppercase 11px letterspacing 0.12em
LAYOUT: hero asymmetric photo grid, overlapping images at different sizes, headline breaking across the grid. Generous whitespace. Marquee text strip allowed once. Masonry or offset 2-column photo sections. Captions tiny and precise.
MOTION: images parallax at subtle 0.9-1.1 factors. Headline reveals via clip-path wipe. Hover: image scales 1.03 inside a fixed frame, 400ms ease.
IMAGE PROMPT: "Editorial fashion photography, [subject], natural window light, muted warm tones, shot on medium format, shallow depth of field, magazine quality, no text"

A5. LUXURY MINIMAL SERIF (real estate, architecture, hospitality, high-ticket services — also the Aetheris/Obsidian house style)
TOKENS: commit to ONE — bg #0F0F0D (dark) or #F7F5F1 (light) | text #E8E4DC on dark / #1A1915 on light | muted #8C877C | accent #B29A6B (muted brass) — ONLY for hairlines and hover states | radius 0-4px | shadow NONE (depth comes from photography)
TYPE: display Cormorant 400 or Canela-style serif, large and airy, letterspacing 0.01em | body a quiet grotesk — Suisse-style, Aeonik, or Figtree 300/400
LAYOUT: hero full-bleed photograph, headline overlaid in serif, nav nearly invisible. Slow and spacious. Section padding 160px+. Single large image + short text blocks. Numbered project index if listing work.
MOTION: hero image slow zoom-out from 1.06→1.0 over 2s. Text fades up after. Scroll fade only, no bounce or slide. Ease 600-800ms.
IMAGE PROMPT: "Architectural photography, [subject], golden hour, warm minimal palette, wide angle, high-end real estate magazine style, 8k, no people, no text"

A6. PLAYFUL BOLD / EDTECH (education, consumer apps, community, youth brands)
TOKENS: bg #FFFDF5 | surface #FFFFFF | text #17151F | accents #FFD43B yellow, #7C5CFF purple, #FF5C8A pink — rotate per section, never more than one per card | border 2px solid #17151F on interactive elements | radius 16-24px | shadow 4px 4px 0 #17151F (HARD offset, no blur) on cards and buttons
TYPE: display Cabinet Grotesk 800 or Bricolage Grotesque 700 | body DM Sans 400/500
LAYOUT: hero big friendly headline, sticker-style illustration elements scattered with slight rotation (-6 to 6deg). Pill-shaped tags everywhere. Colorful cards in a loose grid, hand-drawn SVG arrows / underline accents.
MOTION: hover buttons translate -2px,-2px and shadow grows to 6px 6px (tactile press). Stickers wiggle 2deg on hover. Scroll: cards pop in scale 0.95→1 + rotate settle.
IMAGE PROMPT: "Playful 3D cartoon illustration of [subject], bright yellow purple and pink palette, soft clay render style, white background, sticker aesthetic, no text"

A7. GRADIENT GLASS / AI-ML (ML platforms, data products, modern dev infra)
TOKENS: bg mesh gradient #FF7A3D → #4F46E5 → #0EA5E9 heavily blurred with dark overlay 40% | surface rgba(255,255,255,0.08) with backdrop-blur 24px | text #FFFFFF | muted rgba(255,255,255,0.65) | border 1px solid rgba(255,255,255,0.18) | radius 20px
TYPE: display Söhne-style or Geist 600 | body Geist 400 or Inter
LAYOUT: gradient fills the viewport, glass panel floats centered with the product message. Content sections shift to solid dark (#0C0D12) after hero so the gradient stays special.
MOTION: mesh gradient drifts slowly (CSS animation on background-position, 15s). Glass cards: border shimmer on hover (gradient border rotation).
IMAGE PROMPT: "Abstract flowing silk gradient waves, orange to indigo to cyan, soft focus, dreamy atmosphere, high resolution wallpaper, no text, no objects"

A8. BRUTALIST SIGNAL RED (agencies, bold product launches, anything that must interrupt)
TOKENS: bg #F43B1E or #FF3B30 full-bleed | surface #FFFFFF cards | text #FFFFFF on red, #111 on white | accent #111111 | radius 8px | border NONE (contrast does the work)
TYPE: display Helvetica Now Bold or Archivo Black, massive, tight leading 0.95 | body Archivo 400
LAYOUT: hero giant type on red, screenshots in white device frames slightly overlapping the fold. High density, low whitespace by design. Alternating red and white full-bleed bands.
MOTION: almost none. Fast cuts. Hover states invert colors 0-80ms. Speed is the personality.
IMAGES: prefer real product screenshots in device frames. If illustration needed: "flat bold vector illustration, [subject], red white and black only, swiss poster style, no gradients, no text"

WIRING NOTES:
- Load display + body fonts via <link> from Google Fonts or Fontshare CDN and expose as CSS variables --font-display and --font-body. Declare the full stack — never silently fall back to system fonts.
- Ship every archetype hex as CSS custom properties in :root. Reference variables only in components — no inline hex.
- For image slots, insert <img> with GENERATED IMAGES (if provided) or an https placeholder. Fill [subject] and [accent color] in the IMAGE PROMPT template so slots are self-documenting via data-image-prompt attributes when generation is deferred.
- Since output is a single-file HTML document, use CSS transitions/animations for hovers and small motion. Wrap animated blocks in @media (prefers-reduced-motion: reduce) { animation: none; transition: none; }.

Before you start writing HTML: state (in a single <!-- comment --> at the top of <head>) which archetype you picked and why in ≤ 20 words. Then follow that archetype exactly.`;
