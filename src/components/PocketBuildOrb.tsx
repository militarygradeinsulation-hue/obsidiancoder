import * as React from "react";

/**
 * Home-screen-style amber loading badge — a small, corner-anchored
 * indicator shown while a build streams in. Deliberately does NOT cover
 * the preview: the point is for the person to watch their page actually
 * being built in real time (the preview already repaints progressively as
 * HTML streams in), with this badge as a compact, unobtrusive confirmation
 * that work is still happening — not a screen that hides that work from
 * them. Uses the same markup/classes as the Obsidian Vibe coder so the two
 * loaders still look like the same product, just repositioned.
 */
export function PocketBuildOrb({ label = "Weaving your build…" }: { label?: string }) {
  return (
    <div
      className="pointer-events-none absolute bottom-3 right-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-xl border border-[#D9A84E]/25 bg-[#050608]/80 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm"
    >
      <div className="obs-loading-core obs-loading-core--sm">
        <div className="obs-loading-orb" aria-hidden />
        <div className="obs-loading-ring" aria-hidden />
        <div className="obs-loading-ring is-outer" aria-hidden />
      </div>
      <div className="flex flex-col gap-1">
        <div className="obs-loading-waves obs-loading-waves--sm" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="obs-loading-wave" style={{ animationDelay: `${i * 0.18}s` }} />
          ))}
        </div>
        <p className="obs-loading-text obs-loading-text--sm truncate">{label}</p>
      </div>
      <span className="sr-only" role="status">
        {label}
      </span>
    </div>
  );
}

export default PocketBuildOrb;
