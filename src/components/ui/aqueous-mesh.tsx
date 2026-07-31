import * as React from "react";

/**
 * "Aqueous Mesh" — an interactive grid of points that ripples away from the
 * cursor, drawn as a gradient wireframe. Full-viewport, non-interactive.
 */
export default function AqueousMesh({ className }: { className?: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const mousePos = React.useRef<{ x?: number; y?: number }>({ x: undefined, y: undefined });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId = 0;
    const gridSize = 30;

    type P = { x: number; y: number; ox: number; oy: number; z: number };
    let points: P[] = [];
    let cols = 0;
    let rows = 0;

    const init = () => {
      points = [];
      cols = Math.ceil(canvas.width / gridSize);
      rows = Math.ceil(canvas.height / gridSize);
      for (let i = 0; i <= cols; i++) {
        for (let j = 0; j <= rows; j++) {
          points.push({ x: i * gridSize, y: j * gridSize, ox: i * gridSize, oy: j * gridSize, z: 0 });
        }
      }
    };

    const update = (p: P) => {
      const mx = mousePos.current.x;
      const my = mousePos.current.y;
      if (mx !== undefined && my !== undefined) {
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 150;
        if (dist < maxDist) {
          const angle = Math.atan2(dy, dx);
          const force = (maxDist - dist) / maxDist;
          p.x += Math.cos(angle) * force * 5;
          p.y += Math.sin(angle) * force * 5;
          p.z = force * 20;
        }
      }
      p.x += (p.ox - p.x) * 0.1;
      p.y += (p.oy - p.y) * 0.1;
      p.z += (0 - p.z) * 0.1;
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of points) update(p);

      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "rgba(244, 161, 37, 0.30)");
      gradient.addColorStop(1, "rgba(221, 147, 36, 0.10)");
      ctx.strokeStyle = gradient;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const p1 = points[i * (rows + 1) + j];
          const p2 = points[i * (rows + 1) + (j + 1)];
          const p3 = points[(i + 1) * (rows + 1) + j];
          if (p1 && p2) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineWidth = 1 + p1.z / 10;
            ctx.stroke();
          }
          if (p1 && p3) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p3.x, p3.y);
            ctx.lineWidth = 1 + p1.z / 10;
            ctx.stroke();
          }
        }
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      init();
    };
    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseOut = () => {
      mousePos.current = { x: undefined, y: undefined };
    };

    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseout", handleMouseOut);
    resizeCanvas();
    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseout", handleMouseOut);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className ?? "h-full w-full"} />;
}
