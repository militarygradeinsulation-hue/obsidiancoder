// useRailResize — extracted hook for the right-rail resizable width.
// Consolidates persisted state, viewport reclamping, pointer-drag, and
// keyboard resize using pure math from `operation-tracker`.

import { useCallback, useEffect, useRef, useState } from "react";
import { RAIL_MIN, RAIL_HARD_MAX, clampRail, nextRailWidthForKey, railMax } from "@/lib/operation-tracker";

const STORAGE_KEY = "obs.railWidth";
const DEFAULT_WIDTH = 320;

export function useRailResize() {
  const [railWidth, setRailWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const n = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(n) && n >= RAIL_MIN ? n : DEFAULT_WIDTH;
  });

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, String(railWidth)); } catch { /* quota */ }
  }, [railWidth]);

  // Reclamp against viewport so a saved wide value doesn't clip on a narrow screen.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      const vw = document.documentElement.clientWidth || window.innerWidth;
      setRailWidth((w) => clampRail(w, vw));
    };
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return;
    const delta = e.clientX - dragRef.current.startX;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    setRailWidth(clampRail(dragRef.current.startWidth - delta, vw));
  }, []);

  const onEnd = useCallback(() => {
    dragRef.current = null;
    document.body.classList.remove("is-resizing-rail");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onEnd);
  }, [onMove]);

  const onResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: railWidth };
    document.body.classList.add("is-resizing-rail");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
  }, [railWidth, onMove, onEnd]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const vw = typeof window === "undefined" ? 1600 : (document.documentElement.clientWidth || window.innerWidth);
    const next = nextRailWidthForKey(e.key, railWidth, vw, e.shiftKey);
    if (next !== railWidth) {
      e.preventDefault();
      setRailWidth(next);
    }
  }, [railWidth]);

  const resetWidth = useCallback(() => setRailWidth(DEFAULT_WIDTH), []);

  const ariaMax = typeof window === "undefined" ? RAIL_HARD_MAX : railMax(document.documentElement.clientWidth || window.innerWidth);

  return {
    railWidth,
    setRailWidth,
    onResizeStart,
    onKeyDown,
    resetWidth,
    ariaMin: RAIL_MIN,
    ariaMax,
  };
}
