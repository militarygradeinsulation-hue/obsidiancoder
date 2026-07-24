## Goal
Replace the current static hero on the `/unlock` (home/login) page with a Three.js "Anomalous Matter" animated icosahedron as the centerpiece, keeping all existing login/pricing functionality intact.

## What it would look like
- Full-viewport dark backdrop (existing `#111317` Obsidian bg).
- A slowly rotating, wireframe icosahedron with Perlin-noise displacement floats behind the login content, reacting to mouse position via a moving point light.
- Tinted in Obsidian's Burnt Gold (`#F4A125` / `#DD9324`) instead of the sample's sky-blue, so it matches the current brand.
- Overlaid on top (centered, glass card):
  - Aetheris emblem
  - Headline: "Think it, Type it, See it."
  - Sub: "A tool builder for people that can't code."
  - Library-code unlock input + button
  - Existing pricing grid and collapsed Live Demos below
- On mobile: the 3D scene stays but at reduced pixel ratio; login card sits on top with a stronger scrim for readability.

## Implementation

1. **Add dependency**
   - `bun add three` and `bun add -d @types/three`.

2. **New component** `src/components/AnomalousMatterScene.tsx`
   - Port the provided `GenerativeArtScene` (fixing the JSX that got stripped in the paste: returns `<div ref={mountRef} className="absolute inset-0" />`).
   - Client-only: dynamic-import via `React.lazy` behind `<ClientOnly fallback={<div className="absolute inset-0 bg-[#111317]" />}>` (Three touches `window` at import time; see execution-model rules).
   - Uniform `color` set from a prop, default to Obsidian gold `new THREE.Color('#F4A125')`.
   - Cap `setPixelRatio(Math.min(devicePixelRatio, 1.5))` and pause `requestAnimationFrame` when tab hidden to protect mobile perf.
   - Respect `prefers-reduced-motion`: render one static frame, skip the animation loop.

3. **Wire into `src/routes/unlock.tsx`**
   - Wrap the current hero block in a `relative` container with `min-h-[100svh]`.
   - Insert `<ClientOnly><Suspense><AnomalousMatterScene /></Suspense></ClientOnly>` as an `absolute inset-0 -z-0` layer.
   - Add a subtle radial gradient scrim (`bg-[radial-gradient(ellipse_at_center,transparent,rgba(17,19,23,0.85))]`) above the canvas for text contrast.
   - Keep the existing login card, pricing grid, and Live Demos section as the `relative z-10` foreground; no copy or logic changes.

4. **Cleanup / guards**
   - Keep the existing starfield/aura only on other routes; on `/unlock` the 3D scene replaces them to avoid double-animation cost.
   - No changes to auth, Stripe, demos, or admin logic.

## Technical notes
- Three.js is browser-only — must not be imported into any module that renders during SSR. Isolate the import inside the lazy component module.
- The provided shader uses `uniform vec3 pointLightPosition` in the fragment shader but the JS sets `pointLightPos`. Fix by renaming the uniform to `pointLightPos` in the fragment shader so lighting works.
- Fragment shader currently ignores `time`; safe to leave (still animates via vertex displacement).
- Bundle impact: `three` adds ~150 KB gzipped; acceptable for the marketing/login route and lazy-loaded.

## Out of scope
- No changes to the builder (`/`) UI, pricing tiers, or backend.
- No new routes or database changes.
