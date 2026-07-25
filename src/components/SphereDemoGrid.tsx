// Interactive 3D sphere gallery for /unlock Live Demos.
// Fibonacci-distributed nodes, drag-to-rotate with momentum, auto-rotate,
// hover pop, click opens demo in a new tab. No iframes — lightweight tiles.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SphereDemoItem = {
  id: string;
  title: string;
  category: string;
  url: string;
  thumbnailUrl?: string;
  previewUrl?: string;
};

type Props = {
  items: SphereDemoItem[];
  containerSize?: number;
  sphereRadius?: number;
  tileSize?: number;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  dragSensitivity?: number;
  momentumDecay?: number;
  maxRotationSpeed?: number;
  className?: string;
};

const d2r = (d: number) => d * (Math.PI / 180);
const norm = (a: number) => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };

export default function SphereDemoGrid({
  items,
  containerSize = 560,
  sphereRadius = 220,
  tileSize = 96,
  autoRotate = true,
  autoRotateSpeed = 0.2,
  dragSensitivity = 0.6,
  momentumDecay = 0.96,
  maxRotationSpeed = 6,
  className = "",
}: Props) {
  const [rotation, setRotation] = useState({ x: 12, y: 0 });
  const [velocity, setVelocity] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);

  const positions = useMemo(() => {
    const n = items.length;
    const golden = (1 + Math.sqrt(5)) / 2;
    const inc = (2 * Math.PI) / golden;
    return items.map((_, i) => {
      const t = (i + 0.5) / n;
      const phi = Math.acos(1 - 2 * t); // 0..pi
      const theta = inc * i;
      return { theta, phi };
    });
  }, [items]);

  const clamp = useCallback((s: number) => Math.max(-maxRotationSpeed, Math.min(maxRotationSpeed, s)), [maxRotationSpeed]);

  useEffect(() => {
    const tick = () => {
      setVelocity((v) => {
        if (dragging) return v;
        const nv = { x: v.x * momentumDecay, y: v.y * momentumDecay };
        if (!autoRotate && Math.abs(nv.x) < 0.01 && Math.abs(nv.y) < 0.01) return { x: 0, y: 0 };
        return nv;
      });
      setRotation((r) => {
        let ny = r.y + clamp(velocity.y);
        if (autoRotate && !dragging) ny += autoRotateSpeed;
        return { x: norm(r.x + clamp(velocity.x)), y: norm(ny) };
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [dragging, velocity, clamp, autoRotate, autoRotateSpeed, momentumDecay]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      const rx = clamp(-dy * dragSensitivity);
      const ry = clamp(dx * dragSensitivity);
      setRotation((r) => ({ x: norm(r.x + rx), y: norm(r.y + ry) }));
      setVelocity({ x: rx, y: ry });
      last.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => setDragging(false);
    const onTMove = (e: TouchEvent) => {
      if (!dragging) return;
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - last.current.x;
      const dy = t.clientY - last.current.y;
      const rx = clamp(-dy * dragSensitivity);
      const ry = clamp(dx * dragSensitivity);
      setRotation((r) => ({ x: norm(r.x + rx), y: norm(r.y + ry) }));
      setVelocity({ x: rx, y: ry });
      last.current = { x: t.clientX, y: t.clientY };
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging, dragSensitivity, clamp]);

  const rx = d2r(rotation.x);
  const ry = d2r(rotation.y);

  const nodes = positions.map((p, i) => {
    let x = sphereRadius * Math.sin(p.phi) * Math.cos(p.theta);
    let y = sphereRadius * Math.cos(p.phi);
    let z = sphereRadius * Math.sin(p.phi) * Math.sin(p.theta);
    // Y-axis rotation
    const x1 = x * Math.cos(ry) + z * Math.sin(ry);
    const z1 = -x * Math.sin(ry) + z * Math.cos(ry);
    x = x1; z = z1;
    // X-axis rotation
    const y2 = y * Math.cos(rx) - z * Math.sin(rx);
    const z2 = y * Math.sin(rx) + z * Math.cos(rx);
    y = y2; z = z2;

    const depth = (z + sphereRadius) / (2 * sphereRadius); // 0 back .. 1 front
    const scale = 0.55 + depth * 0.65;
    const opacity = 0.25 + depth * 0.75;
    return { x, y, z, scale, opacity, zIndex: Math.round(1000 + z) };
  });

  return (
    <div
      className={`sphere-demo-root ${className}`}
      style={{ width: containerSize, height: containerSize }}
    >
      <div
        className="sphere-demo-stage"
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(true);
          setVelocity({ x: 0, y: 0 });
          last.current = { x: e.clientX, y: e.clientY };
        }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          setDragging(true);
          setVelocity({ x: 0, y: 0 });
          last.current = { x: t.clientX, y: t.clientY };
        }}
        style={{ perspective: 1200, cursor: dragging ? "grabbing" : "grab" }}
      >
        {items.map((it, i) => {
          const n = nodes[i];
          const isHover = hovered === i;
          const s = n.scale * (isHover ? 1.25 : 1);
          return (
            <a
              key={it.id}
              href={it.url}
              target="_blank"
              rel="noopener noreferrer"
              className="sphere-demo-node"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={(e) => { if (dragging) e.preventDefault(); }}
              style={{
                width: tileSize,
                height: tileSize,
                transform: `translate3d(${n.x}px, ${n.y}px, ${n.z}px) translate(-50%, -50%) scale(${s})`,
                opacity: n.opacity,
                zIndex: n.zIndex,
              }}
              title={`${it.title} — ${it.category}`}
            >
              <div className="sphere-demo-tile">
                <span className="sphere-demo-cat">{it.category}</span>
                <span className="sphere-demo-title">{it.title}</span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
