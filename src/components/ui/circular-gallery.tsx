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

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={cn("relative w-full h-full overflow-hidden", className)}
        style={{ perspective: "1400px" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        {...props}
      >
        <div
          className="absolute left-1/2 top-1/2 w-0 h-0"
          style={{
            transformStyle: "preserve-3d",
            transform: `translate(-50%,-50%) rotateX(-8deg) rotateY(${rotation}deg)`,
            transition: isScrolling ? "transform 0.05s linear" : "transform 0.1s linear",
          }}
        >
          {items.map((item, i) => {
            const itemAngle = i * anglePerItem;
            const totalRotation = rotation % 360;
            const relativeAngle = (itemAngle + totalRotation + 360) % 360;
            const normalizedAngle = Math.abs(relativeAngle > 180 ? 360 - relativeAngle : relativeAngle);
            const opacity = Math.max(0.25, 1 - normalizedAngle / 180);
            const isFront = normalizedAngle < anglePerItem / 2;

            return (
              <button
                key={`${item.href ?? item.src}-${i}`}
                type="button"
                onClick={() => onItemClick?.(item)}
                className="absolute left-0 top-0 group"
                style={{
                  width: 260,
                  height: 340,
                  marginLeft: -130,
                  marginTop: -170,
                  transform: `rotateY(${itemAngle}deg) translateZ(${radius}px)`,
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
                    isFront && "ring-1 ring-[#F4A125]/40"
                  )}
                >
                  <img
                    src={item.src}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    style={{ objectPosition: item.pos ?? "center" }}
                  />
                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-left">
                    <div className="text-white font-semibold text-sm leading-tight line-clamp-2">
                      {item.title}
                    </div>
                    {item.subtitle && (
                      <div className="text-[11px] text-[#F4A125]/90 mt-1 uppercase tracking-wide">
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
