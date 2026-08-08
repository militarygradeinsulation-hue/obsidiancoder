import { useEffect, useRef, useState } from "react";
import { resolveIntroVideo } from "@/lib/intro-asset";

const RESOLVED = resolveIntroVideo();
const VIDEO_URL = RESOLVED.url;

const FADE_LEAD_MS = 600;
// Hard ceiling on how long the intro can hold the page. Was 9.5s fallback /
// 12s absolute — that is an enormous amount of time to sit between a cold
// visitor and any actual content, on a site whose entire problem is that
// nobody converts. Capped at 3.5s: long enough to read as an intentional
// brand moment, short enough that nobody bounces waiting for it.
const MAX_DURATION_MS = 3500;
const HARD_MAX_MS = 4500;
// localStorage, not sessionStorage: sessionStorage resets every time the
// browser drops the tab, which on mobile is constantly. That meant a
// returning visitor sat through the full intro over and over. Once per
// person, not once per session.
const SEEN_KEY = "obs_intro_seen_v2";

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
    // Never hold the page for someone who has asked the OS for reduced motion.
    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    } catch {}
    // Once per person (localStorage), not once per tab session.
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem(SEEN_KEY)) {
        return;
      }
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Storage blocked (private mode, etc.) — fall through and show it
      // rather than erroring, but it will still be capped at MAX_DURATION_MS.
    }
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

    scheduleFromDuration(MAX_DURATION_MS);

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
        // Clamp: if the asset is longer than the cap, cut it short rather
        // than letting the file's length dictate how long the page is held.
        scheduleFromDuration(Math.min(Math.round(video.duration * 1000), MAX_DURATION_MS));
      }
    };
    const onEnded = () => {
      setFadeOut(true);
      window.clearTimeout(doneTimer);
      doneTimer = window.setTimeout(() => setShow(false), 700);
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("ended", onEnded);

    // Stays muted. Unmuted autoplay is blocked by browser policy on a fresh
    // visit, so the previous attempt to unmute was guaranteed to fail and
    // then bound global pointerdown/keydown listeners to retry on the
    // visitor's first interaction — consuming their first tap to start
    // audio they never asked for. Removed entirely.
    video.muted = true;
    video.playsInline = true;
    const p = video.play();
    if (p && typeof p.catch === "function") {
      // If autoplay is refused outright, don't sit on a frozen frame.
      p.catch(() => dismiss());
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
          preload="metadata"
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
