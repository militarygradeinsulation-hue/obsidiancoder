import { useEffect, useRef, useState } from "react";
import { resolveIntroVideo } from "@/lib/intro-asset";

const RESOLVED = resolveIntroVideo();
const VIDEO_URL = RESOLVED.url;

const FADE_LEAD_MS = 900;
const FALLBACK_DURATION_MS = 9500;
const HARD_MAX_MS = 12000;
const SEEN_KEY = "obs_intro_seen_v1";

export default function IntroSplash() {
  // Client-only: avoid SSR Suspense/hydration issues that could leave a
  // full-screen overlay stuck on the live site.
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoError, setVideoError] = useState<string | null>(RESOLVED.ok ? null : (RESOLVED.reason ?? "asset unresolved"));
  const isDev = typeof import.meta !== "undefined" && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;

  useEffect(() => {
    setMounted(true);
    // Only show intro once per session so it never freezes navigation on repeat visits.
    try {
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(SEEN_KEY)) {
        return;
      }
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
    setShow(true);
  }, []);

  const dismiss = () => {
    setFadeOut(true);
    window.setTimeout(() => setShow(false), 500);
  };

  useEffect(() => {
    if (!show) return;

    let fadeTimer = 0;
    let doneTimer = 0;
    let hardTimer = 0;

    // Absolute safety net: force-remove overlay no matter what.
    hardTimer = window.setTimeout(() => {
      setFadeOut(true);
      setShow(false);
    }, HARD_MAX_MS);

    const scheduleFromDuration = (durationMs: number) => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
      const fadeAt = Math.max(600, durationMs - FADE_LEAD_MS);
      fadeTimer = window.setTimeout(() => setFadeOut(true), fadeAt);
      doneTimer = window.setTimeout(() => setShow(false), durationMs);
    };

    scheduleFromDuration(FALLBACK_DURATION_MS);

    const video = videoRef.current;
    if (!video) {
      return () => {
        window.clearTimeout(fadeTimer);
        window.clearTimeout(doneTimer);
        window.clearTimeout(hardTimer);
      };
    }

    const onMeta = () => {
      if (isFinite(video.duration) && video.duration > 0) {
        scheduleFromDuration(Math.round(video.duration * 1000));
      }
    };
    const onEnded = () => {
      setFadeOut(true);
      window.clearTimeout(doneTimer);
      doneTimer = window.setTimeout(() => setShow(false), 700);
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("ended", onEnded);

    video.muted = true;
    video.volume = 1.0;
    video.playsInline = true;
    const tryUnmute = () => {
      try { video.muted = false; video.volume = 1.0; } catch {}
    };
    const p = video.play();
    if (p && typeof p.then === "function") {
      p.then(tryUnmute).catch(() => {
        const onGesture = () => {
          tryUnmute();
          video.play().catch(() => {});
        };
        window.addEventListener("pointerdown", onGesture, { once: true });
        window.addEventListener("keydown", onGesture, { once: true });
      });
    } else {
      tryUnmute();
    }

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
      window.clearTimeout(hardTimer);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("ended", onEnded);
      try { video.pause(); } catch {}
    };
  }, [show]);

  if (!mounted || !show) return null;

  return (
    <div
      className={`obs-intro-splash${fadeOut ? " is-leaving" : ""}`}
      role="button"
      tabIndex={0}
      aria-label="Skip intro"
      onClick={dismiss}
      onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") dismiss(); }}
    >
      {RESOLVED.ok && (
        <video
          ref={videoRef}
          className="obs-intro-video"
          src={VIDEO_URL}
          autoPlay
          muted
          playsInline
          preload="auto"
          onError={() => { setVideoError("video failed to load"); dismiss(); }}
        />
      )}

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); dismiss(); }}
        style={{
          position: "absolute", top: 16, right: 16, zIndex: 5,
          padding: "8px 14px", borderRadius: 999,
          background: "rgba(0,0,0,0.55)", color: "#f2eee7",
          border: "1px solid rgba(244,161,37,0.4)",
          fontFamily: "Inter, sans-serif", fontSize: 13, cursor: "pointer",
          backdropFilter: "blur(8px)",
        }}
        aria-label="Skip intro"
      >
        Skip →
      </button>

      {isDev && videoError && (
        <div
          style={{
            position: "absolute", top: 16, left: 16, zIndex: 3,
            padding: "8px 12px", borderRadius: 6,
            background: "rgba(220,38,38,0.9)", color: "#fff",
            fontFamily: "monospace", fontSize: 12, maxWidth: "50vw",
          }}
          role="alert"
        >
          Intro video error: {videoError}
        </div>
      )}
    </div>
  );
}
