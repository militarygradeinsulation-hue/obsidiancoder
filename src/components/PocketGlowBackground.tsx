// Obsidian Pocket — flat background + soft primary glow, in the shadcn
// SaaS-landing style (solid stone-950 background, blurred orange blob behind
// the hero, fading to the base color). Pure CSS, no canvas/shader.
export function PocketGlowBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#0c0a09]">
      <div className="absolute left-1/2 top-[-10%] h-[480px] w-[90%] max-w-[900px] -translate-x-1/2 rounded-full bg-[#ea580c]/40 blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#0c0a09]" />
    </div>
  );
}

export default PocketGlowBackground;
