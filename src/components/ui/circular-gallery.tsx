import React, { useState, useEffect, useRef, HTMLAttributes } from "react";

const cn = (...classes: (string | undefined | null | false)[]) =>
  classes.filter(Boolean).join(" ");

export interface CircularItem {
  title: string;
  subtitle?: string;
  src: string;
  href?: string;
  pos?: string;
}

interface CircularGalleryProps extends HTMLAttributes<HTMLDivElement> {
  items: CircularItem[];
  radius?: number;
  autoRotateSpeed?: number;
  onItemClick?: (item: CircularItem) => void;
}

export const CircularGallery = React.forwardRef<HTMLDivElement, CircularGalleryProps>(
  ({ items, className, radius = 520, autoRotateSpeed = 0.03, onItemClick, ...props }, ref) => {
    const [rotation, setRotation] = useState(0);
    const [isScrolling, setIsScrolling] = useState(false);
    const [hovered, setHovered] = useState(false);
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rafRef = useRef<number | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      const handleScroll = () => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight;
        // progress: 0 when section top hits bottom of viewport, 1 when bottom hits top
        const total = rect.height + vh;
        const passed = vh - rect.top;
        const progress = Math.max(0, Math.min(1, passed / total));
        setIsScrolling(true);
        setRotation(progress * 360);
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => setIsScrolling(false), 180);
      };
      window.addEventListener("scroll", handleScroll, { passive: true });
      handleScroll();
      return () => {
        window.removeEventListener("scroll", handleScroll);
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      };
    }, []);

    useEffect(() => {
      const tick = () => {
        if (!isScrolling && !hovered) {
          setRotation((prev) => prev + autoRotateSpeed);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, [isScrolling, hovered, autoRotateSpeed]);

    const count = Math.max(items.length, 1);
    const anglePerItem = 360 / count;
    const TILE_W = 300;
    const TILE_H = 200;
    // Auto-fit radius so tiles sit side-by-side without overlap
    const autoRadius = (TILE_W * 1.15) / (2 * Math.tan((Math.PI / count) || 0.1));
    const effectiveRadius = Math.max(radius, Math.min(autoRadius, 2000));

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={cn("relative w-full h-full overflow-hidden", className)}
        style={{ perspective: "1600px" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        {...props}
      >
        <div
          className="absolute left-1/2 top-1/2 w-0 h-0"
          style={{
            transformStyle: "preserve-3d",
            transform: `translate(-50%,-50%) rotateX(-6deg) rotateY(${rotation}deg)`,
            transition: isScrolling ? "transform 0.05s linear" : "transform 0.1s linear",
          }}
        >
          {items.map((item, i) => {
            const itemAngle = i * anglePerItem;
            const totalRotation = rotation % 360;
            const relativeAngle = (itemAngle + totalRotation + 360) % 360;
            const normalizedAngle = Math.abs(relativeAngle > 180 ? 360 - relativeAngle : relativeAngle);
            // Hide back half so we don't see through the ring
            if (normalizedAngle > 95) return null;
            const opacity = Math.max(0.15, 1 - normalizedAngle / 95);
            const isFront = normalizedAngle < anglePerItem / 2;

            return (
              <button
                key={`${item.href ?? item.src}-${i}`}
                type="button"
                onClick={() => onItemClick?.(item)}
                className="absolute left-0 top-0 group"
                style={{
                  width: TILE_W,
                  height: TILE_H,
                  marginLeft: -TILE_W / 2,
                  marginTop: -TILE_H / 2,
                  transform: `rotateY(${itemAngle}deg) translateZ(${effectiveRadius}px)`,
                  opacity,
                  transition: "opacity 0.3s ease",
                }}
                aria-label={item.title}
              >
                <div
                  className={cn(
                    "relative w-full h-full rounded-2xl overflow-hidden border border-white/10 bg-[#111317]",
                    "shadow-[0_20px_60px_rgba(0,0,0,0.55)]",
                    "transition-transform duration-300 group-hover:scale-[1.04]",
                    isFront && "ring-1 ring-[#F4A125]/50"
                  )}
                >
                  <img
                    src={item.src}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    style={{ objectPosition: item.pos ?? "center" }}
                  />
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/95 via-black/60 to-transparent text-left">
                    <div className="text-white font-semibold text-sm leading-tight line-clamp-1">
                      {item.title}
                    </div>
                    {item.subtitle && (
                      <div className="text-[10px] text-[#F4A125]/90 mt-0.5 uppercase tracking-wider">
                        {item.subtitle}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);

CircularGallery.displayName = "CircularGallery";

export default CircularGallery;
