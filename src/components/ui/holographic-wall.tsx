"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

type HolographicWallProps = {
  intensity?: number;
  radius?: number;
  className?: string;
};

// Pharaonic hieroglyphic symbols
const HIEROGLYPHS = [
  "𓄿", "𓇋", "𓅱", "𓃀", "𓊪", "𓆑", "𓅓", "𓈖", "𓂋", "𓉔",
  "𓎛", "𓐍", "𓄡", "𓋴", "𓈙", "𓈎", "𓎡", "𓎼", "𓏏", "𓂧",
];

type Letter = { char: string; x: number; y: number };

/**
 * Full-bleed "holographic wall" of hieroglyphs that light up in gold
 * around the cursor. Purely decorative; never intercepts pointer events.
 */
export function HolographicWall({
  intensity = 0.8,
  radius = 220,
  className,
}: HolographicWallProps) {
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 1440, h: 900 });

  useEffect(() => {
    const resize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    resize();
    const move = (e: PointerEvent) => setMouse({ x: e.clientX, y: e.clientY });
    const leave = () => setMouse(null);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerleave", leave);
    };
  }, []);

  const letters = useMemo<Letter[]>(() => {
    const cols = Math.max(10, Math.round(size.w / 74));
    const rows = Math.max(8, Math.round(size.h / 74));
    const spacingX = size.w / cols;
    const spacingY = size.h / rows;
    const out: Letter[] = [];
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j <= rows; j++) {
        out.push({
          char: HIEROGLYPHS[(i * 7 + j * 13) % HIEROGLYPHS.length],
          x: i * spacingX,
          y: j * spacingY,
        });
      }
    }
    return out;
  }, [size.w, size.h]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden select-none ${className ?? ""}`}
    >
      {/* Wall texture */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,161,37,0.06),transparent_60%)]" />

      {/* Hieroglyph field */}
      <div className="absolute inset-0">
        {letters.map((letter, index) => {
          const distance = mouse
            ? Math.hypot(letter.x - mouse.x, letter.y - mouse.y)
            : Infinity;
          const lit =
            mouse && distance < radius
              ? Math.max(0, 1 - distance / radius) * intensity
              : 0;
          return (
            <span
              key={index}
              className="absolute font-serif"
              style={{
                left: letter.x,
                top: letter.y,
                fontSize: 22,
                lineHeight: 1,
                transform: `translate(-50%, -50%) scale(${1 + lit * 0.25})`,
                color: `rgba(244, 161, 37, ${0.05 + lit * 0.85})`,
                textShadow: lit > 0.05 ? `0 0 ${10 * lit}px rgba(244,161,37,${lit * 0.8})` : "none",
                transition: "color 180ms linear, transform 180ms ease-out, text-shadow 180ms linear",
              }}
            >
              {letter.char}
            </span>
          );
        })}
      </div>

      {/* Golden cursor light */}
      {mouse && (
        <motion.div
          className="absolute"
          animate={{ left: mouse.x, top: mouse.y }}
          transition={{ type: "spring", stiffness: 260, damping: 30, mass: 0.4 }}
          style={{ width: 0, height: 0 }}
        >
          <div
            className="absolute rounded-full"
            style={{
              width: radius * 2,
              height: radius * 2,
              transform: "translate(-50%, -50%)",
              background:
                "radial-gradient(circle, rgba(244,161,37,0.20) 0%, rgba(221,147,36,0.09) 40%, transparent 70%)",
              filter: "blur(14px)",
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: radius,
              height: radius,
              transform: "translate(-50%, -50%)",
              background:
                "radial-gradient(circle, rgba(255,206,120,0.22) 0%, transparent 70%)",
              filter: "blur(28px)",
            }}
          />
        </motion.div>
      )}
    </div>
  );
}

export default HolographicWall;
