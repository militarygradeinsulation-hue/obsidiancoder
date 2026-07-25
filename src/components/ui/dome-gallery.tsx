// Interactive 3D dome image gallery. Drag to rotate the sphere, tap a tile
// to either enlarge it in place or (when `onImageClick` is provided) invoke
// custom behavior — used on /unlock to open live demos in a new tab.
import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { useGesture } from "@use-gesture/react";

type ImageItem = string | { src: string; alt?: string; href?: string };

type DomeGalleryProps = {
  images?: ImageItem[];
  fit?: number;
  fitBasis?: "auto" | "min" | "max" | "width" | "height";
  minRadius?: number;
  maxRadius?: number;
  padFactor?: number;
  overlayBlurColor?: string;
  maxVerticalRotationDeg?: number;
  dragSensitivity?: number;
  enlargeTransitionMs?: number;
  segments?: number;
  dragDampening?: number;
  openedImageWidth?: string;
  openedImageHeight?: string;
  imageBorderRadius?: string;
  openedImageBorderRadius?: string;
  grayscale?: boolean;
  onImageClick?: (item: { src: string; alt: string; href?: string }) => void;
  /** Degrees per second of automatic Y-axis rotation while idle. 0 = off. */
  autoRotateSpeed?: number;
};

type ItemDef = {
  src: string;
  alt: string;
  href?: string;
  x: number;
  y: number;
  sizeX: number;
  sizeY: number;
};

const DEFAULT_IMAGES: ImageItem[] = [
  { src: "https://images.unsplash.com/photo-1755331039789-7e5680e26e8f?q=80&w=774&auto=format&fit=crop", alt: "Abstract art" },
  { src: "https://images.unsplash.com/photo-1755569309049-98410b94f66d?q=80&w=772&auto=format&fit=crop", alt: "Modern sculpture" },
  { src: "https://images.unsplash.com/photo-1755497595318-7e5e3523854f?q=80&w=774&auto=format&fit=crop", alt: "Digital artwork" },
  { src: "https://images.unsplash.com/photo-1755353985163-c2a0fe5ac3d8?q=80&w=774&auto=format&fit=crop", alt: "Contemporary art" },
  { src: "https://images.unsplash.com/photo-1745965976680-d00be7dc0377?q=80&w=774&auto=format&fit=crop", alt: "Geometric pattern" },
  { src: "https://images.unsplash.com/photo-1752588975228-21f44630bb3c?q=80&w=774&auto=format&fit=crop", alt: "Textured surface" },
];

const DEFAULTS = {
  maxVerticalRotationDeg: 5,
  dragSensitivity: 20,
  enlargeTransitionMs: 300,
  segments: 35,
};

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const normalizeAngle = (d: number) => ((d % 360) + 360) % 360;
const wrapAngleSigned = (deg: number) => {
  const a = (((deg + 180) % 360) + 360) % 360;
  return a - 180;
};
const getDataNumber = (el: HTMLElement, name: string, fallback: number) => {
  const attr = el.dataset[name] ?? el.getAttribute(`data-${name}`);
  const n = attr == null ? NaN : parseFloat(attr);
  return Number.isFinite(n) ? n : fallback;
};

function buildItems(pool: ImageItem[], seg: number): ItemDef[] {
  const xCols = Array.from({ length: seg }, (_, i) => -37 + i * 2);
  const evenYs = [-4, -2, 0, 2, 4];
  const oddYs = [-3, -1, 1, 3, 5];
  const coords = xCols.flatMap((x, c) => {
    const ys = c % 2 === 0 ? evenYs : oddYs;
    return ys.map((y) => ({ x, y, sizeX: 2, sizeY: 2 }));
  });
  const totalSlots = coords.length;
  if (pool.length === 0) return coords.map((c) => ({ ...c, src: "", alt: "" }));
  const normalized = pool.map((image) =>
    typeof image === "string" ? { src: image, alt: "", href: undefined } : { src: image.src || "", alt: image.alt || "", href: image.href },
  );
  const used = Array.from({ length: totalSlots }, (_, i) => normalized[i % normalized.length]);
  for (let i = 1; i < used.length; i++) {
    if (used[i].src === used[i - 1].src) {
      for (let j = i + 1; j < used.length; j++) {
        if (used[j].src !== used[i].src) {
          const tmp = used[i];
          used[i] = used[j];
          used[j] = tmp;
          break;
        }
      }
    }
  }
  return coords.map((c, i) => ({ ...c, src: used[i].src, alt: used[i].alt, href: used[i].href }));
}

function computeItemBaseRotation(offsetX: number, offsetY: number, sizeX: number, sizeY: number, segments: number) {
  const unit = 360 / segments / 2;
  return { rotateX: unit * (offsetY - (sizeY - 1) / 2), rotateY: unit * (offsetX + (sizeX - 1) / 2) };
}

export default function DomeGallery({
  images = DEFAULT_IMAGES,
  fit = 0.5,
  fitBasis = "auto",
  minRadius = 600,
  maxRadius = Infinity,
  padFactor = 0.25,
  overlayBlurColor = "#060010",
  maxVerticalRotationDeg = DEFAULTS.maxVerticalRotationDeg,
  dragSensitivity = DEFAULTS.dragSensitivity,
  enlargeTransitionMs = DEFAULTS.enlargeTransitionMs,
  segments = DEFAULTS.segments,
  dragDampening = 2,
  openedImageWidth = "400px",
  openedImageHeight = "400px",
  imageBorderRadius = "30px",
  openedImageBorderRadius = "30px",
  grayscale = true,
  onImageClick,
}: DomeGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const sphereRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const focusedElRef = useRef<HTMLElement | null>(null);
  const originalTilePositionRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);

  const rotationRef = useRef({ x: 0, y: 0 });
  const startRotRef = useRef({ x: 0, y: 0 });
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const cancelTapRef = useRef(false);
  const movedRef = useRef(false);
  const inertiaRAF = useRef<number | null>(null);
  const pointerTypeRef = useRef<"mouse" | "pen" | "touch">("mouse");
  const tapTargetRef = useRef<HTMLElement | null>(null);
  const openingRef = useRef(false);
  const openStartedAtRef = useRef(0);
  const lastDragEndAt = useRef(0);
  const onImageClickRef = useRef(onImageClick);
  useEffect(() => { onImageClickRef.current = onImageClick; }, [onImageClick]);

  const scrollLockedRef = useRef(false);
  const lockScroll = useCallback(() => {
    if (scrollLockedRef.current) return;
    scrollLockedRef.current = true;
    document.body.classList.add("dg-scroll-lock");
  }, []);
  const unlockScroll = useCallback(() => {
    if (!scrollLockedRef.current) return;
    if (rootRef.current?.getAttribute("data-enlarging") === "true") return;
    scrollLockedRef.current = false;
    document.body.classList.remove("dg-scroll-lock");
  }, []);

  const items = useMemo(() => buildItems(images, segments), [images, segments]);

  const applyTransform = (xDeg: number, yDeg: number) => {
    const el = sphereRef.current;
    if (el) el.style.transform = `translateZ(calc(var(--radius) * -1)) rotateX(${xDeg}deg) rotateY(${yDeg}deg)`;
  };

  const lockedRadiusRef = useRef<number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      const w = Math.max(1, cr.width), h = Math.max(1, cr.height);
      const minDim = Math.min(w, h), maxDim = Math.max(w, h), aspect = w / h;
      let basis: number;
      switch (fitBasis) {
        case "min": basis = minDim; break;
        case "max": basis = maxDim; break;
        case "width": basis = w; break;
        case "height": basis = h; break;
        default: basis = aspect >= 1.3 ? w : minDim;
      }
      let radius = basis * fit;
      radius = Math.min(radius, h * 1.35);
      radius = clamp(radius, minRadius, maxRadius);
      lockedRadiusRef.current = Math.round(radius);
      const viewerPad = Math.max(8, Math.round(minDim * padFactor));
      root.style.setProperty("--radius", `${lockedRadiusRef.current}px`);
      root.style.setProperty("--viewer-pad", `${viewerPad}px`);
      root.style.setProperty("--overlay-blur-color", overlayBlurColor);
      root.style.setProperty("--tile-radius", imageBorderRadius);
      root.style.setProperty("--enlarge-radius", openedImageBorderRadius);
      root.style.setProperty("--image-filter", grayscale ? "grayscale(1)" : "none");
      applyTransform(rotationRef.current.x, rotationRef.current.y);
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [fit, fitBasis, minRadius, maxRadius, padFactor, overlayBlurColor, grayscale, imageBorderRadius, openedImageBorderRadius]);

  useEffect(() => { applyTransform(rotationRef.current.x, rotationRef.current.y); }, []);

  const stopInertia = useCallback(() => {
    if (inertiaRAF.current) { cancelAnimationFrame(inertiaRAF.current); inertiaRAF.current = null; }
  }, []);

  const startInertia = useCallback((vx: number, vy: number) => {
    const MAX_V = 1.4;
    let vX = clamp(vx, -MAX_V, MAX_V) * 80;
    let vY = clamp(vy, -MAX_V, MAX_V) * 80;
    let frames = 0;
    const d = clamp(dragDampening ?? 0.6, 0, 1);
    const frictionMul = 0.94 + 0.055 * d;
    const stopThreshold = 0.015 - 0.01 * d;
    const maxFrames = Math.round(90 + 270 * d);
    const step = () => {
      vX *= frictionMul; vY *= frictionMul;
      if (Math.abs(vX) < stopThreshold && Math.abs(vY) < stopThreshold) { inertiaRAF.current = null; return; }
      if (++frames > maxFrames) { inertiaRAF.current = null; return; }
      const nextX = clamp(rotationRef.current.x - vY / 200, -maxVerticalRotationDeg, maxVerticalRotationDeg);
      const nextY = wrapAngleSigned(rotationRef.current.y + vX / 200);
      rotationRef.current = { x: nextX, y: nextY };
      applyTransform(nextX, nextY);
      inertiaRAF.current = requestAnimationFrame(step);
    };
    stopInertia();
    inertiaRAF.current = requestAnimationFrame(step);
  }, [dragDampening, maxVerticalRotationDeg, stopInertia]);

  const openItemFromElement = (el: HTMLElement) => {
    if (cancelTapRef.current) return;
    // Custom click handler short-circuits the enlarge animation.
    if (onImageClickRef.current) {
      const parent = el.parentElement as HTMLElement | null;
      const src = parent?.dataset.src || (el.querySelector("img") as HTMLImageElement)?.src || "";
      const alt = parent?.dataset.alt || (el.querySelector("img") as HTMLImageElement)?.alt || "";
      const href = parent?.dataset.href;
      onImageClickRef.current({ src, alt, href });
      return;
    }
    if (openingRef.current) return;
    openingRef.current = true;
    openStartedAtRef.current = performance.now();
    lockScroll();
    const parent = el.parentElement as HTMLElement;
    focusedElRef.current = el;
    el.setAttribute("data-focused", "true");
    const offsetX = getDataNumber(parent, "offsetX", 0);
    const offsetY = getDataNumber(parent, "offsetY", 0);
    const sizeX = getDataNumber(parent, "sizeX", 2);
    const sizeY = getDataNumber(parent, "sizeY", 2);
    const parentRot = computeItemBaseRotation(offsetX, offsetY, sizeX, sizeY, segments);
    const parentY = normalizeAngle(parentRot.rotateY);
    const globalY = normalizeAngle(rotationRef.current.y);
    let rotY = -(parentY + globalY) % 360;
    if (rotY < -180) rotY += 360;
    const rotX = -parentRot.rotateX - rotationRef.current.x;
    parent.style.setProperty("--rot-y-delta", `${rotY}deg`);
    parent.style.setProperty("--rot-x-delta", `${rotX}deg`);
    const refDiv = document.createElement("div");
    refDiv.className = "item__image item__image--reference opacity-0";
    refDiv.style.transform = `rotateX(${-parentRot.rotateX}deg) rotateY(${-parentRot.rotateY}deg)`;
    parent.appendChild(refDiv);
    const tileR = refDiv.getBoundingClientRect();
    const mainR = mainRef.current!.getBoundingClientRect();
    const frameR = frameRef.current!.getBoundingClientRect();
    originalTilePositionRef.current = { left: tileR.left, top: tileR.top, width: tileR.width, height: tileR.height };
    el.style.visibility = "hidden";
    (el.style as unknown as { zIndex: number }).zIndex = 0;
    const overlay = document.createElement("div");
    overlay.className = "enlarge";
    overlay.style.cssText = `position:absolute; left:${frameR.left - mainR.left}px; top:${frameR.top - mainR.top}px; width:${frameR.width}px; height:${frameR.height}px; opacity:0; z-index:30; will-change:transform,opacity; transform-origin:top left; transition:transform ${enlargeTransitionMs}ms ease, opacity ${enlargeTransitionMs}ms ease; border-radius:${openedImageBorderRadius}; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,.35);`;
    const rawSrc = parent.dataset.src || (el.querySelector("img") as HTMLImageElement)?.src || "";
    const rawAlt = parent.dataset.alt || (el.querySelector("img") as HTMLImageElement)?.alt || "";
    const img = document.createElement("img");
    img.src = rawSrc;
    img.alt = rawAlt;
    img.style.cssText = `width:100%; height:100%; object-fit:cover; filter:${grayscale ? "grayscale(1)" : "none"};`;
    overlay.appendChild(img);
    viewerRef.current!.appendChild(overlay);
    const tx0 = tileR.left - frameR.left;
    const ty0 = tileR.top - frameR.top;
    const sx0 = tileR.width / frameR.width;
    const sy0 = tileR.height / frameR.height;
    overlay.style.transform = `translate(${tx0}px, ${ty0}px) scale(${sx0}, ${sy0})`;
    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
      overlay.style.transform = "translate(0px, 0px) scale(1, 1)";
      rootRef.current?.setAttribute("data-enlarging", "true");
    });
    const wantsResize = openedImageWidth || openedImageHeight;
    if (wantsResize) {
      const onFirstEnd = (ev: TransitionEvent) => {
        if (ev.propertyName !== "transform") return;
        overlay.removeEventListener("transitionend", onFirstEnd);
        const prevTransition = overlay.style.transition;
        overlay.style.transition = "none";
        const tempWidth = openedImageWidth || `${frameR.width}px`;
        const tempHeight = openedImageHeight || `${frameR.height}px`;
        overlay.style.width = tempWidth;
        overlay.style.height = tempHeight;
        const newRect = overlay.getBoundingClientRect();
        overlay.style.width = frameR.width + "px";
        overlay.style.height = frameR.height + "px";
        void overlay.offsetWidth;
        overlay.style.transition = `left ${enlargeTransitionMs}ms ease, top ${enlargeTransitionMs}ms ease, width ${enlargeTransitionMs}ms ease, height ${enlargeTransitionMs}ms ease`;
        const centeredLeft = frameR.left - mainR.left + (frameR.width - newRect.width) / 2;
        const centeredTop = frameR.top - mainR.top + (frameR.height - newRect.height) / 2;
        requestAnimationFrame(() => {
          overlay.style.left = `${centeredLeft}px`;
          overlay.style.top = `${centeredTop}px`;
          overlay.style.width = tempWidth;
          overlay.style.height = tempHeight;
        });
        const cleanupSecond = () => {
          overlay.removeEventListener("transitionend", cleanupSecond);
          overlay.style.transition = prevTransition;
        };
        overlay.addEventListener("transitionend", cleanupSecond, { once: true });
      };
      overlay.addEventListener("transitionend", onFirstEnd);
    }
  };

  useGesture(
    {
      onDragStart: ({ event }) => {
        if (focusedElRef.current) return;
        stopInertia();
        const evt = event as PointerEvent;
        pointerTypeRef.current = (evt.pointerType as "mouse" | "pen" | "touch") || "mouse";
        if (pointerTypeRef.current === "touch") { evt.preventDefault(); lockScroll(); }
        draggingRef.current = true;
        cancelTapRef.current = false;
        movedRef.current = false;
        startRotRef.current = { ...rotationRef.current };
        startPosRef.current = { x: evt.clientX, y: evt.clientY };
        const potential = (evt.target as Element).closest?.(".item__image") as HTMLElement | null;
        tapTargetRef.current = potential || null;
      },
      onDrag: ({ event, last, velocity: velArr = [0, 0], direction: dirArr = [0, 0], movement }) => {
        if (focusedElRef.current || !draggingRef.current || !startPosRef.current) return;
        const evt = event as PointerEvent;
        if (pointerTypeRef.current === "touch") evt.preventDefault();
        const dxTotal = evt.clientX - startPosRef.current.x;
        const dyTotal = evt.clientY - startPosRef.current.y;
        if (!movedRef.current) {
          const dist2 = dxTotal * dxTotal + dyTotal * dyTotal;
          if (dist2 > 16) movedRef.current = true;
        }
        const nextX = clamp(startRotRef.current.x - dyTotal / dragSensitivity, -maxVerticalRotationDeg, maxVerticalRotationDeg);
        const nextY = startRotRef.current.y + dxTotal / dragSensitivity;
        const cur = rotationRef.current;
        if (cur.x !== nextX || cur.y !== nextY) {
          rotationRef.current = { x: nextX, y: nextY };
          applyTransform(nextX, nextY);
        }
        if (last) {
          draggingRef.current = false;
          let isTap = false;
          if (startPosRef.current) {
            const dx = evt.clientX - startPosRef.current.x;
            const dy = evt.clientY - startPosRef.current.y;
            const dist2 = dx * dx + dy * dy;
            const TAP = pointerTypeRef.current === "touch" ? 10 : 6;
            if (dist2 <= TAP * TAP) isTap = true;
          }
          const [vMagX, vMagY] = velArr;
          const [dirX, dirY] = dirArr;
          let vx = vMagX * dirX;
          let vy = vMagY * dirY;
          if (!isTap && Math.abs(vx) < 0.001 && Math.abs(vy) < 0.001 && Array.isArray(movement)) {
            const [mx, my] = movement;
            vx = (mx / dragSensitivity) * 0.02;
            vy = (my / dragSensitivity) * 0.02;
          }
          if (!isTap && (Math.abs(vx) > 0.005 || Math.abs(vy) > 0.005)) startInertia(vx, vy);
          startPosRef.current = null;
          cancelTapRef.current = !isTap;
          if (isTap && tapTargetRef.current && !focusedElRef.current) openItemFromElement(tapTargetRef.current);
          tapTargetRef.current = null;
          if (cancelTapRef.current) setTimeout(() => (cancelTapRef.current = false), 120);
          if (pointerTypeRef.current === "touch") unlockScroll();
          if (movedRef.current) lastDragEndAt.current = performance.now();
          movedRef.current = false;
        }
      },
    },
    { target: mainRef, eventOptions: { passive: false } },
  );

  useEffect(() => () => { document.body.classList.remove("dg-scroll-lock"); }, []);

  const cssStyles = `
    .sphere-root { --radius: 520px; --viewer-pad: 72px; --circ: calc(var(--radius) * 3.14); --rot-y: calc((360deg / var(--segments-x)) / 2); --rot-x: calc((360deg / var(--segments-y)) / 2); --item-width: calc(var(--circ) / var(--segments-x)); --item-height: calc(var(--circ) / var(--segments-y)); }
    .sphere-root * { box-sizing: border-box; }
    .sphere, .sphere-item, .item__image { transform-style: preserve-3d; }
    .stage { width: 100%; height: 100%; display: grid; place-items: center; position: absolute; inset: 0; margin: auto; perspective: calc(var(--radius) * 2); perspective-origin: 50% 50%; }
    .sphere { transform: translateZ(calc(var(--radius) * -1)); will-change: transform; position: absolute; }
    .sphere-item { width: calc(var(--item-width) * var(--item-size-x)); height: calc(var(--item-height) * var(--item-size-y)); position: absolute; top: -999px; bottom: -999px; left: -999px; right: -999px; margin: auto; transform-origin: 50% 50%; backface-visibility: hidden; transition: transform 300ms; transform: rotateY(calc(var(--rot-y) * (var(--offset-x) + ((var(--item-size-x) - 1) / 2)) + var(--rot-y-delta, 0deg))) rotateX(calc(var(--rot-x) * (var(--offset-y) - ((var(--item-size-y) - 1) / 2)) + var(--rot-x-delta, 0deg))) translateZ(var(--radius)); }
    .sphere-root[data-enlarging="true"] .scrim { opacity: 1 !important; pointer-events: all !important; }
    @media (max-aspect-ratio: 1/1) { .viewer-frame { height: auto !important; width: 100% !important; } }
    .item__image { position: absolute; inset: 10px; border-radius: var(--tile-radius, 12px); overflow: hidden; cursor: pointer; backface-visibility: hidden; -webkit-backface-visibility: hidden; transition: transform 300ms; pointer-events: auto; -webkit-transform: translateZ(0); transform: translateZ(0); }
    .item__image--reference { position: absolute; inset: 10px; pointer-events: none; }
  `;

  const [hover, setHover] = useState<{ src: string; alt: string; x: number; y: number } | null>(null);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: cssStyles }} />
      <div
        ref={rootRef}
        className="sphere-root relative w-full h-full"
        style={{
          ["--segments-x" as string]: String(segments),
          ["--segments-y" as string]: String(segments),
          ["--overlay-blur-color" as string]: overlayBlurColor,
          ["--tile-radius" as string]: imageBorderRadius,
          ["--enlarge-radius" as string]: openedImageBorderRadius,
          ["--image-filter" as string]: grayscale ? "grayscale(1)" : "none",
        } as React.CSSProperties}
      >
        <main
          ref={mainRef}
          className="absolute inset-0 grid place-items-center overflow-hidden select-none bg-transparent"
          style={{ touchAction: "none", WebkitUserSelect: "none" }}
        >
          <div className="stage">
            <div ref={sphereRef} className="sphere">
              {items.map((it, i) => (
                <div
                  key={`${it.x},${it.y},${i}`}
                  className="sphere-item absolute m-auto"
                  data-src={it.src}
                  data-alt={it.alt}
                  data-href={it.href || ""}
                  data-offset-x={it.x}
                  data-offset-y={it.y}
                  data-size-x={it.sizeX}
                  data-size-y={it.sizeY}
                  style={{
                    ["--offset-x" as string]: String(it.x),
                    ["--offset-y" as string]: String(it.y),
                    ["--item-size-x" as string]: String(it.sizeX),
                    ["--item-size-y" as string]: String(it.sizeY),
                    top: "-999px", bottom: "-999px", left: "-999px", right: "-999px",
                  } as React.CSSProperties}
                >
                  <div
                    className="item__image absolute block overflow-hidden cursor-pointer bg-gray-200 transition-transform duration-300"
                    role="button"
                    tabIndex={0}
                    aria-label={it.alt || "Open image"}
                    onClick={(e) => {
                      if (performance.now() - lastDragEndAt.current < 80) return;
                      openItemFromElement(e.currentTarget as HTMLElement);
                    }}
                    onTouchEnd={(e) => {
                      if (performance.now() - lastDragEndAt.current < 80) return;
                      openItemFromElement(e.currentTarget as unknown as HTMLElement);
                    }}
                    onMouseEnter={(e) => setHover({ src: it.src, alt: it.alt, x: e.clientX, y: e.clientY })}
                    onMouseMove={(e) => setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))}
                    onMouseLeave={() => setHover(null)}
                    style={{ inset: "10px", borderRadius: `var(--tile-radius, ${imageBorderRadius})`, backfaceVisibility: "hidden" }}
                  >
                    {it.src ? (
                      <img
                        src={it.src}
                        draggable={false}
                        alt={it.alt}
                        className="w-full h-full object-cover pointer-events-none"
                        style={{ backfaceVisibility: "hidden", filter: `var(--image-filter, ${grayscale ? "grayscale(1)" : "none"})` }}
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute inset-0 m-auto z-[3] pointer-events-none" style={{ backgroundImage: `radial-gradient(rgba(235,235,235,0) 65%, var(--overlay-blur-color, ${overlayBlurColor}) 100%)` }} />
          <div className="absolute inset-0 m-auto z-[3] pointer-events-none" style={{ WebkitMaskImage: `radial-gradient(rgba(235,235,235,0) 70%, var(--overlay-blur-color, ${overlayBlurColor}) 90%)`, maskImage: `radial-gradient(rgba(235,235,235,0) 70%, var(--overlay-blur-color, ${overlayBlurColor}) 90%)`, backdropFilter: "blur(3px)" }} />
          <div className="absolute left-0 right-0 top-0 h-[120px] z-[5] pointer-events-none rotate-180" style={{ background: `linear-gradient(to bottom, transparent, var(--overlay-blur-color, ${overlayBlurColor}))` }} />
          <div className="absolute left-0 right-0 bottom-0 h-[120px] z-[5] pointer-events-none" style={{ background: `linear-gradient(to bottom, transparent, var(--overlay-blur-color, ${overlayBlurColor}))` }} />

          <div ref={viewerRef} className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center" style={{ padding: "var(--viewer-pad)" }}>
            <div ref={scrimRef} className="scrim absolute inset-0 z-10 pointer-events-none opacity-0 transition-opacity duration-500" style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(3px)" }} />
            <div ref={frameRef} className="viewer-frame h-full aspect-square flex" style={{ borderRadius: `var(--enlarge-radius, ${openedImageBorderRadius})` }} />
          </div>
        </main>
      </div>
      {hover ? (
        <div
          className="pointer-events-none fixed z-[100]"
          style={{
            left: Math.min(hover.x + 20, (typeof window !== "undefined" ? window.innerWidth : 1200) - 340),
            top: Math.max(12, Math.min(hover.y - 160, (typeof window !== "undefined" ? window.innerHeight : 800) - 340)),
            width: 320,
            height: 320,
            borderRadius: 16,
            overflow: "hidden",
            background: "rgba(10,10,14,0.85)",
            border: "1px solid rgba(244,161,37,0.35)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05) inset",
            backdropFilter: "blur(10px)",
            transition: "opacity 120ms ease",
          }}
        >
          <img src={hover.src} alt={hover.alt} className="w-full h-full object-cover" draggable={false} />
          {hover.alt ? (
            <div
              className="absolute left-0 right-0 bottom-0 px-3 py-2 text-[12px] font-medium"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)", color: "#f2eee7" }}
            >
              {hover.alt}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
