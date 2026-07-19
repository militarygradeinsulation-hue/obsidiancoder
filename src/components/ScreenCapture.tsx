import { useEffect, useRef, useState } from "react";
import { X, Copy, Check, Paperclip } from "lucide-react";

/** Ask the browser for a single-frame screen capture. Returns a PNG data URL. */
export async function captureScreenFrame(): Promise<string> {
  const md: any = (navigator as any).mediaDevices;
  if (!md || typeof md.getDisplayMedia !== "function") {
    throw new Error("Screen capture is not supported in this browser.");
  }
  const stream: MediaStream = await md.getDisplayMedia({
    video: { frameRate: 1 },
    audio: false,
    // hint the picker toward the current tab when supported
    preferCurrentTab: true,
    selfBrowserSurface: "include",
  } as any);
  try {
    const track = stream.getVideoTracks()[0];
    // Prefer ImageCapture where available for a crisp still.
    const IC = (window as any).ImageCapture;
    if (IC) {
      try {
        const cap = new IC(track);
        const bitmap: ImageBitmap = await cap.grabFrame();
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        return canvas.toDataURL("image/png");
      } catch {
        /* fall through */
      }
    }
    // Fallback: pipe through a hidden <video> and draw one frame.
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    (video as any).playsInline = true;
    await video.play();
    await new Promise((r) => setTimeout(r, 120));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

async function copyPngDataUrlToClipboard(dataUrl: string) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const anyNav: any = navigator;
    if (anyNav.clipboard && (window as any).ClipboardItem) {
      await anyNav.clipboard.write([
        new (window as any).ClipboardItem({ "image/png": blob }),
      ]);
      return true;
    }
  } catch {}
  return false;
}

type Props = {
  mode: "full" | "snip";
  onClose: () => void;
  onAttach: (dataUrl: string, name: string) => void;
};

/**
 * Modal for reviewing a captured frame. In "snip" mode the user can drag
 * a rectangle to crop the region they want to share.
 */
export function ScreenCaptureModal({ mode, onClose, onAttach }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<{ sx: number; sy: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    captureScreenFrame()
      .then((url) => { if (!cancelled) setSrc(url); })
      .catch((e) => { if (!cancelled) setErr(e?.message || "Capture failed or was cancelled."); });
    return () => { cancelled = true; };
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (mode !== "snip" || !imgRef.current) return;
    const box = imgRef.current.getBoundingClientRect();
    const sx = e.clientX - box.left;
    const sy = e.clientY - box.top;
    setDrag({ sx, sy });
    setRect({ x: sx, y: sy, w: 0, h: 0 });
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag || !imgRef.current) return;
    const box = imgRef.current.getBoundingClientRect();
    const cx = Math.max(0, Math.min(box.width, e.clientX - box.left));
    const cy = Math.max(0, Math.min(box.height, e.clientY - box.top));
    setRect({
      x: Math.min(drag.sx, cx),
      y: Math.min(drag.sy, cy),
      w: Math.abs(cx - drag.sx),
      h: Math.abs(cy - drag.sy),
    });
  }
  function onPointerUp() { setDrag(null); }

  async function finalize(copyOnly: boolean) {
    if (!src) return;
    let outUrl = src;
    let name = mode === "snip" ? `snip-${Date.now()}.png` : `screenshot-${Date.now()}.png`;

    if (mode === "snip" && rect && rect.w > 4 && rect.h > 4 && imgRef.current) {
      const img = imgRef.current;
      const scaleX = img.naturalWidth / img.clientWidth;
      const scaleY = img.naturalHeight / img.clientHeight;
      const c = document.createElement("canvas");
      c.width = Math.round(rect.w * scaleX);
      c.height = Math.round(rect.h * scaleY);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(
        img,
        rect.x * scaleX, rect.y * scaleY, rect.w * scaleX, rect.h * scaleY,
        0, 0, c.width, c.height
      );
      outUrl = c.toDataURL("image/png");
    }

    const ok = await copyPngDataUrlToClipboard(outUrl);
    setCopied(ok);
    if (!copyOnly) onAttach(outUrl, name);
    if (copyOnly) setTimeout(() => setCopied(false), 1400);
    else onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === "snip" ? "Snip a region" : "Screenshot preview"}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(3,4,5,0.82)", backdropFilter: "blur(6px)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "min(1100px, 96vw)", maxHeight: "92vh",
        background: "rgba(17,19,23,0.96)", border: "1px solid rgba(244,161,37,0.35)",
        borderRadius: 14, boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 40px rgba(244,161,37,0.15)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)",
          color: "#f2eee7", fontSize: 13, fontWeight: 600, letterSpacing: 0.2,
        }}>
          <span>{mode === "snip" ? "Snip — drag to select a region" : "Screenshot"}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="obs-icon-btn">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div style={{ padding: 14, overflow: "auto", background: "rgba(0,0,0,0.35)" }}>
          {err && (
            <div style={{ color: "#f8c07a", padding: 24, textAlign: "center", fontSize: 14 }}>
              {err}
              <div style={{ marginTop: 8, opacity: 0.75, fontSize: 12 }}>
                Tip: choose “This Tab” in the sharing dialog for the cleanest capture.
              </div>
            </div>
          )}
          {!err && !src && (
            <div style={{ color: "#b6bcc8", padding: 24, textAlign: "center", fontSize: 14 }}>
              Waiting for screen share permission…
            </div>
          )}
          {src && (
            <div
              style={{ position: "relative", display: "inline-block", cursor: mode === "snip" ? "crosshair" : "default", userSelect: "none" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <img
                ref={imgRef}
                src={src}
                alt="Captured frame"
                draggable={false}
                style={{ display: "block", maxWidth: "100%", maxHeight: "70vh", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}
              />
              {mode === "snip" && rect && (
                <div
                  style={{
                    position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h,
                    border: "2px solid #f4a125", background: "rgba(244,161,37,0.15)",
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)", pointerEvents: "none",
                  }}
                />
              )}
            </div>
          )}
        </div>

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
          padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.08)",
        }}>
          <button
            type="button"
            className="obs-btn"
            disabled={!src}
            onClick={() => finalize(true)}
            title="Copy to clipboard"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span style={{ marginLeft: 6 }}>{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            type="button"
            className="obs-btn is-primary"
            disabled={!src || (mode === "snip" && !(rect && rect.w > 4 && rect.h > 4))}
            onClick={() => finalize(false)}
            title="Attach to Obsidian"
          >
            <Paperclip className="h-3.5 w-3.5" />
            <span style={{ marginLeft: 6 }}>Attach to chat</span>
          </button>
        </div>
      </div>
    </div>
  );
}
