import * as React from "react";

/**
 * Amber "build orb" — shown over the Pocket preview while a build streams in.
 */
export function PocketBuildOrb({ label = "Building…" }: { label?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#050608]/70 backdrop-blur-[2px]">
      <div className="pocket-orb" aria-hidden />
      <p className="text-xs font-medium tracking-wide text-[#F4A125]">{label}</p>
      <span className="sr-only" role="status">
        {label}
      </span>
    </div>
  );
}

export default PocketBuildOrb;
