import { useEffect, useRef, useState } from "react";

interface MousePos {
  x: number;
  y: number;
}

interface Dot {
  x: number;
  y: number;
  render: (ctx: CanvasRenderingContext2D, mouse: MousePos, params: CanvasParams, hue: number) => void;
}

interface CanvasParams {
  dotDistance: number;
  dotRadius: number;
  minProximity: number;
  repaintAlpha: number;
}

export interface InteractiveGridProps {
  dotDistance?: number;
  dotRadius?: number;
  minProximity?: number;
  repaintAlpha?: number;
  className?: string;
}

export function InteractiveGrid({
  dotDistance = 30,
  dotRadius = 2,
  minProximity = 200,
  repaintAlpha = 1,
  className,
}: InteractiveGridProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paramsRef = useRef<CanvasParams>({
    dotDistance,
    dotRadius,
    minProximity,
    repaintAlpha,
  });
  const [mouse, setMouse] = useState({ x: -9999, y: -9999 });
  const [hue, setHue] = useState(32); // warm amber start
  const dotsRef = useRef<Dot[]>([]);
  const rafRef = useRef<number>(0);

  // keep params in sync without re-creating dots on every prop change
  useEffect(() => {
    paramsRef.current = { dotDistance, dotRadius, minProximity, repaintAlpha };
  }, [dotDistance, dotRadius, minProximity, repaintAlpha]);

  const createDots = (w: number, h: number) => {
    const p = paramsRef.current;
    const newDots: Dot[] = [];
    for (let x = 0; x < w; x += p.dotDistance) {
      for (let y = 0; y < h; y += p.dotDistance) {
        newDots.push({
          x,
          y,
          render: (ctx, mousePos, params, currentHue) => {
            const dX = x - mousePos.x;
            const dY = y - mousePos.y;
            const distSquared = dX * dX + dY * dY;
            const minProxSquared = params.minProximity * params.minProximity;

            if (distSquared <= minProxSquared) {
              const ratio = distSquared / minProxSquared;
              const brightness = 50 - ratio * 35;
              const alpha = 0.85 - ratio * 0.55;
              const color = `hsl(${currentHue}, 85%, ${brightness}%)`;

              ctx.fillStyle = color;
              ctx.strokeStyle = color;
              ctx.globalAlpha = alpha;
              ctx.beginPath();
              ctx.arc(x, y, params.dotRadius * (1.2 - ratio * 0.4), 0, Math.PI * 2);
              ctx.fill();

              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(mousePos.x, mousePos.y);
              ctx.stroke();
              ctx.globalAlpha = 1;
            } else {
              ctx.fillStyle = "rgba(60, 60, 65, 0.35)";
              ctx.beginPath();
              ctx.arc(x, y, params.dotRadius, 0, Math.PI * 2);
              ctx.fill();
            }
          },
        });
      }
    }
    dotsRef.current = newDots;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      createDots(window.innerWidth, window.innerHeight);
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [dotDistance]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMouse({ x, y });
      setHue(((x / window.innerWidth + y / window.innerHeight) * 60 + 20) % 60); // amber/gold range
    };

    const onLeave = () => setMouse({ x: -9999, y: -9999 });

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      dotsRef.current.forEach((dot) => dot.render(ctx, mouse, paramsRef.current, hue));
      rafRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(rafRef.current);
  }, [mouse, hue]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}

export default InteractiveGrid;
