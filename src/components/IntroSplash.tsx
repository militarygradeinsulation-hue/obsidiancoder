import { useEffect, useRef, useState } from "react";
import { resolveIntroVideo } from "@/lib/intro-asset";

const RESOLVED = resolveIntroVideo();
const VIDEO_URL = RESOLVED.url;

const FADE_LEAD_MS = 900;
const FALLBACK_DURATION_MS = 7850;

export default function IntroSplash() {
  const [show, setShow] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoError, setVideoError] = useState<string | null>(RESOLVED.ok ? null : (RESOLVED.reason ?? "asset unresolved"));
  const isDev = typeof import.meta !== "undefined" && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;

  useEffect(() => {
    if (!show) return;

    let fadeTimer = 0;
    let doneTimer = 0;

    const video = videoRef.current;
    if (!video) return;

    const scheduleFromDuration = (durationMs: number) => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
      const fadeAt = Math.max(600, durationMs - FADE_LEAD_MS);
      fadeTimer = window.setTimeout(() => setFadeOut(true), fadeAt);
      doneTimer = window.setTimeout(() => setShow(false), durationMs);
    };

    scheduleFromDuration(FALLBACK_DURATION_MS);

    const onMeta = () => {
      if (isFinite(video.duration) && video.duration > 0) {
        scheduleFromDuration(Math.round(video.duration * 1000));
      }
    };
    const onEnded = () => {
      setFadeOut(true);
      window.clearTimeout(doneTimer);
      doneTimer = window.setTimeout(() => setShow(false), 900);
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("ended", onEnded);

    // Start muted so autoplay is guaranteed, then immediately try to unmute.
    video.muted = true;
    video.volume = 1.0;
    video.playsInline = true;
    const tryUnmute = () => {
      try {
        video.muted = false;
        video.volume = 1.0;
      } catch {}
    };
    const p = video.play();
    if (p && typeof p.then === "function") {
      p.then(tryUnmute).catch(() => {
        // If autoplay with sound is blocked, unmute on first user interaction.
        const onGesture = () => {
          tryUnmute();
          video.play().catch(() => {});
          window.removeEventListener("pointerdown", onGesture);
          window.removeEventListener("keydown", onGesture);
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
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("ended", onEnded);
      try { video.pause(); } catch {}
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      className={`obs-intro-splash${fadeOut ? " is-leaving" : ""}`}
      aria-hidden="true"
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
          onError={() => setVideoError("video failed to load")}
        />
      )}
      <h1 className="obs-intro-word" aria-label="Obsidian">
        {"OBSIDIAN".split("").map((ch, i) => (
          <span
            key={i}
            className="obs-intro-letter"
            style={{ ["--d" as string]: `${0.15 + i * 0.09}s` }}
          >
            {ch}
          </span>
        ))}
      </h1>
      <div className="obs-intro-line" />

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
