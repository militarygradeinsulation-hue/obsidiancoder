import { lazy, Suspense, useEffect, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";

const Dithering = lazy(() =>
  import("@paper-design/shaders-react").then((mod) => ({ default: mod.Dithering }))
);

interface DitheringBackgroundProps {
  colorBack?: string;
  colorFront?: string;
  shape?: "simplex" | "warp" | "dots" | "wave" | "ripple" | "swirl" | "sphere";
  type?: "random" | "2x2" | "4x4" | "8x8";
  size?: number;
  className?: string;
}

export function DitheringBackground({
  colorBack = "#030405",
  colorFront = "#F4A125",
  shape = "warp",
  type = "4x4",
  size = 3.2,
  className = "",
}: DitheringBackgroundProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 z-0 overflow-hidden ${className}`}
    >
      <ClientOnly fallback={null}>
        <Suspense fallback={null}>
          {mounted && (
            <Dithering
              colorBack={colorBack}
              colorFront={colorFront}
              shape={shape}
              type={type}
              size={size}
              className="w-full h-full"
              style={{ width: "100%", height: "100%" }}
            />
          )}
        </Suspense>
      </ClientOnly>

      {/* Subtle vignette + noise overlay to keep text readable */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 40%, transparent 0%, rgba(3,4,5,0.55) 70%, rgba(3,4,5,0.85) 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      {/* Glassy overlay — frosted sheet over the moving dither for a cleaner surface */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(3,4,5,0.55) 0%, rgba(3,4,5,0.35) 40%, rgba(3,4,5,0.55) 100%)",
          backdropFilter: "blur(18px) saturate(130%)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      />
    </div>
  );
}
