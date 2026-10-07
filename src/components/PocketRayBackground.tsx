// Obsidian Pocket — horizon "ray" background.
// Bolt-style glowing arc, recolored to the Obsidian amber (#F4A125) on
// near-black (#08090b). Pure CSS, no canvas/shader, so it costs nothing on
// mobile and never blocks the first paint the way the old WebGL stack could.
export function PocketRayBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[100svh] min-h-[640px] select-none overflow-hidden"
    >
      <div className="absolute inset-0 bg-[#08090b]" />
      {/* Warm glow rising from the horizon */}
      <div
        className="absolute left-1/2 h-[1800px] w-[4000px] -translate-x-1/2 sm:w-[6000px]"
        style={{
          background:
            "radial-gradient(circle at center 800px, rgba(244,161,37,0.62) 0%, rgba(244,161,37,0.28) 14%, rgba(244,161,37,0.14) 18%, rgba(244,161,37,0.06) 22%, rgba(8,9,11,0.2) 25%)",
        }}
      />
      {/* Stacked rings form the lit horizon arc */}
      <div
        className="absolute left-1/2 top-[175px] h-[1600px] w-[1600px] sm:top-1/2 sm:h-[2865px] sm:w-[3043px]"
        style={{ transform: "translate(-50%) rotate(180deg)" }}
      >
        <div
          className="absolute -mt-[13px] h-full w-full rounded-full"
          style={{
            background: "radial-gradient(43.89% 25.74% at 50.02% 97.24%, #0d0e11 0%, #08090b 100%)",
            border: "16px solid #fff6e6",
            transform: "rotate(180deg)",
            zIndex: 5,
          }}
        />
        <div
          className="absolute -mt-[11px] h-full w-full rounded-full bg-[#08090b]"
          style={{ border: "23px solid #fde3b5", transform: "rotate(180deg)", zIndex: 4 }}
        />
        <div
          className="absolute -mt-[8px] h-full w-full rounded-full bg-[#08090b]"
          style={{ border: "23px solid #f9c978", transform: "rotate(180deg)", zIndex: 3 }}
        />
        <div
          className="absolute -mt-[4px] h-full w-full rounded-full bg-[#08090b]"
          style={{ border: "23px solid #f6b445", transform: "rotate(180deg)", zIndex: 2 }}
        />
        <div
          className="absolute h-full w-full rounded-full bg-[#08090b]"
          style={{
            border: "20px solid #DD9324",
            boxShadow: "0 -15px 24.8px rgba(221,147,36,0.6)",
            transform: "rotate(180deg)",
            zIndex: 1,
          }}
        />
      </div>
      {/* Fade into the workspace below so panels sit on solid ground */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#08090b]" />
    </div>
  );
}

export default PocketRayBackground;
