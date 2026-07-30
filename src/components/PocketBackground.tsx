import * as React from "react";
import { ClientOnly } from "@tanstack/react-router";

const InteractiveGrid = React.lazy(() => import("@/components/ui/interactive-grid"));
const HolographicWall = React.lazy(() => import("@/components/ui/holographic-wall"));

export function PocketBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <ClientOnly fallback={null}>
        <React.Suspense fallback={null}>
          <HolographicWall />
        </React.Suspense>
      </ClientOnly>
      <ClientOnly fallback={null}>
        <React.Suspense fallback={null}>
          <InteractiveGrid className="h-full w-full" />
        </React.Suspense>
      </ClientOnly>
      <div className="absolute inset-0 bg-gradient-to-b from-[#08090b]/55 via-[#08090b]/40 to-[#08090b]/75" />
    </div>
  );
}

export default PocketBackground;
