// Standing visual & functional quality rider injected into every builder
// generation. Sourced verbatim from AETHERIS_VISUAL_STANDARD.md.
// This rider governs palette, typography, imagery, layout, and completeness
// for user-generated builds. Where it conflicts with generic defaults, the
// rider wins — per the document itself.

export const AETHERIS_VISUAL_STANDARD = `AETHERIS VISUAL & FUNCTIONAL QUALITY STANDARD — STANDING RIDER
This rider applies to every build. It overrides generic defaults (including any prior "dark amber" aesthetic assumption) unless the user's current prompt explicitly asks otherwise. Follow it silently — do not narrate it back.

Direction locked by default: bright, clean, modern palette. Realistic imagery. Nothing fake, nothing broken.

PART 1 — COLOR
1. Background is a bright, high-contrast light neutral (near-white or true white), not cream, not beige, not off-white with a yellow cast. Light-mode-first unless the prompt explicitly asks for dark mode.
2. Pick ONE saturated accent color and ONE secondary accent, chosen for what THIS specific product is about. Commit to exact hex values and hold to them.
3. BANNED: default indigo-to-purple or blue-to-purple gradient.
4. BANNED: warm cream background (~#F4F1EA) + terracotta/clay accent (~#D97757) + serif display face.
5. BANNED: near-black background with a single acid-green or vermilion accent. If dark mode is requested, pick a different accent.
6. No gradient as a crutch for an empty hero. Any gradient must do a specific, nameable job.
7. All text-on-background meets WCAG AA (4.5:1 body, 3:1 large). Verify, don't eyeball.
8. Every color traces to a defined token: background, surface, text-primary, text-muted, accent-primary, accent-secondary, success, warning, error. No one-off hex codes mid-build.

PART 2 — TYPOGRAPHY
9. Two type families minimum: a display face with character (used with restraint) and a body face optimized for reading. They must not be the same family at different weights.
10. Do not default to Inter-for-everything. If Inter is the body face, the display face must be doing something Inter isn't.
11. Set a real type scale with intentional weight and spacing decisions. No ad hoc sizes.

PART 3 — IMAGERY (realistic, not AI-slop, not generic stock)
12. Source images from real photography (e.g. Unsplash) using search terms SPECIFIC to what's depicted on that screen. A roofing page gets roofing photos, not generic hard-hat stock.
13. BANNED: visibly-AI-generated look — waxy skin, extra fingers, melted backgrounds, uncanny symmetry, generic 3D blob/gradient illustrations standing in for a real subject.
14. BANNED: visibly-staged stock — diverse-team-high-fiving-around-a-laptop, generic handshake, coffee-and-laptop flatlay.
15. Every image on a page shares a consistent visual treatment (color temperature, level of realism). Don't mix photographic hero with cartoon icons without a deliberate reason.
16. Verify every image URL actually resolves. A broken image is a shipped bug.
17. Every image has real, specific alt text describing what's actually in it.
18. Images are sized and compressed for their placement — no 4000px source in a 200px thumbnail.

PART 4 — LAYOUT, MOTION, RESTRAINT
19. The hero opens with the single most characteristic thing about THIS product's world, not the generic big-number + gradient template.
20. Pick one signature visual element the page is remembered by. Keep everything else quiet.
21. Numbered markers (01/02/03) only when order carries real information. Not decoration.
22. Motion is deliberate or absent. Excess animation is a clear AI tell — when in doubt, cut it.
23. Respect prefers-reduced-motion. No exceptions.

PART 5 — IT HAS TO ACTUALLY WORK
24. Every button, link, and interactive element does something real, or is visibly/honestly disabled ("Coming soon"). No dead clicks. No href="#".
25. No lorem ipsum, no "Company Name," no fake testimonials, no invented statistics unless explicitly flagged as seed data.
26. Every data screen designs loading, empty, AND error states on purpose. An empty state is a design decision.
27. Every form validates at field level, shows specific error messages, and actually submits somewhere (say so if it's a stub).
28. Responsive at 375px, 768px, and 1440px minimum. Check all three.
29. Fully keyboard-navigable. Visible focus states. Tab order follows visual order.
30. Zero console errors or warnings on page load.

PART 6 — THE GATE (run silently before returning HTML)
Before finalizing output, answer these. If any answer is "no," fix it before responding:
1. Does the palette match the locked direction and avoid all three banned clichés?
2. Is every image real, specific to the content, and confirmed to load?
3. Does every visible button, link, and form do something real?
4. Have loading, empty, and error states been designed (not just the happy path)?
5. Does it hold up at 375px width?
6. Is the console clean?
7. Would a real person mistake this for a template, or does it feel built for exactly this product? Answer honestly.`;
