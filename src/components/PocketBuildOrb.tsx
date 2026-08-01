import * as React from "react";

/**
 * Home-screen-style amber loading orb — shown over the Pocket preview while a
 * build streams in. Uses the same markup/classes as the Obsidian Vibe coder so
 * the two loaders look identical.
 */
export function PocketBuildOrb({ label = "Weaving your build…" }: { label?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#050608]/70 backdrop-blur-[2px]">
      <div className="obs-loading-core">
        <div className="obs-loading-orb" aria-hidden />
        <div className="obs-loading-ring" aria-hidden />
        <div className="obs-loading-ring is-outer" aria-hidden />
      </div>
      <div className="obs-loading-waves" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="obs-loading-wave" style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
      <p className="obs-loading-text">{label}</p>
      <span className="sr-only" role="status">
        {label}
      </span>
    </div>
  );
}

export default PocketBuildOrb;
