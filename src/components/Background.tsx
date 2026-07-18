import { useEffect, useRef } from "react";

/**
 * Amber particle-network background ("math/constellation" look).
 * Full-viewport fixed canvas, z-index 0, non-interactive.
 * Reads --amber-glow (HSL triplet, no hsl() wrapper) from :root.
 */
export default function Background() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rootStyles = getComputedStyle(document.documentElement);
    const amber = rootStyles.getPropertyValue("--amber-glow").trim() || "36 90% 55%";
    const background = "0 0% 0%";

    let width = 0;
    let height = 0;
    let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    type P = { x: number; y: number; vx: number; vy: number; r: number };
    let particles: P[] = [];

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      canvas!.style.width = width + "px";
      canvas!.style.height = height + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(80, Math.max(50, Math.floor(width / 20)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 2 + 1,
      }));
    }
    resize();
    window.addEventListener("resize", resize);

    const MAX = 150;
    const MAX_SQ = MAX * MAX;
    let raf = 0;

    function frame() {
      if (document.hidden) {
        raf = requestAnimationFrame(frame);
        return;
      }

      // Trail wash instead of clearRect
      ctx!.fillStyle = `hsl(${background} / 0.12)`;
      ctx!.fillRect(0, 0, width, height);

      // Update + draw dots
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x <= 0 || p.x >= width) p.vx = -p.vx;
        if (p.y <= 0 || p.y >= height) p.vy = -p.vy;

        ctx!.beginPath();
        ctx!.fillStyle = `hsl(${amber} / 0.42)`;
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Connections
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < MAX_SQ) {
            const alpha = 0.14 * (1 - d2 / MAX_SQ);
            ctx!.strokeStyle = `hsl(${amber} / ${alpha})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
        background: "hsl(0 0% 0%)",
      }}
    />
  );
}
