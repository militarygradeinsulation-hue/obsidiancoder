import * as React from "react";

/**
 * Double-buffered preview frame.
 *
 * Streaming builds replace the whole document many times per generation. A single
 * iframe repaints white/blank between each `srcDoc` swap, which reads as a
 * flashing glitch. This component keeps the last painted document visible while
 * the next one loads off-screen, then cross-fades — so content appears to grow
 * in cleanly instead of blinking.
 */
export function PocketPreviewFrame({
  doc,
  title,
  className,
  style,
  sandbox = "allow-scripts",
}: {
  doc: string;
  title: string;
  className?: string;
  style?: React.CSSProperties;
  sandbox?: string;
}) {
  // Two buffers; `front` says which one is currently visible.
  //
  // Seed both buffers EMPTY and paint the first real doc straight into the
  // visible buffer. Lazy-seeding from `doc` at mount locked in a blank
  // buffer when the doc resolved a tick later, and recovery depended on the
  // back iframe's onLoad, which never fired on that first transition.
  const [buffers, setBuffers] = React.useState<[string, string]>(["", ""]);
  const [front, setFront] = React.useState<0 | 1>(0);
  const pendingRef = React.useRef<string | null>(null);
  const loadingRef = React.useRef(false);
  const paintedRef = React.useRef(false);

  const startLoad = React.useCallback(
    (next: string) => {
      loadingRef.current = true;
      const back = front === 0 ? 1 : 0;
      setBuffers((b) => (back === 0 ? [next, b[1]] : [b[0], next]));
    },
    [front],
  );

  React.useEffect(() => {
    if (doc === buffers[front]) return;
    if (!paintedRef.current) {
      // First real content: paint directly into the visible buffer.
      paintedRef.current = true;
      setBuffers((b) => (front === 0 ? [doc, b[1]] : [b[0], doc]));
      return;
    }
    if (loadingRef.current) {
      pendingRef.current = doc;
      return;
    }
    startLoad(doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  const onBackLoaded = React.useCallback(
    (idx: 0 | 1) => {
      if (idx === front) return;
      loadingRef.current = false;
      setFront(idx);
      const queued = pendingRef.current;
      pendingRef.current = null;
      if (queued && queued !== buffers[idx]) {
        // Load the newest queued doc into the buffer we just left.
        loadingRef.current = true;
        setBuffers((b) => (idx === 0 ? [b[0], queued] : [queued, b[1]]));
      }
    },
    [front, buffers],
  );

  return (
    <div className={`relative ${className ?? ""}`} style={style}>
      {([0, 1] as const).map((i) => (
        <iframe
          key={i}
          title={i === front ? title : `${title} (buffer)`}
          aria-hidden={i !== front}
          srcDoc={buffers[i] || undefined}
          sandbox={sandbox}
          onLoad={() => onBackLoaded(i)}
          className="absolute inset-0 h-full w-full rounded-lg border border-white/10 bg-[#0b0c0f]"
          style={{
            opacity: i === front ? 1 : 0,
            transition: "opacity 180ms ease",
            pointerEvents: i === front ? "auto" : "none",
            zIndex: i === front ? 1 : 0,
          }}
        />
      ))}
    </div>
  );
}

export default PocketPreviewFrame;
