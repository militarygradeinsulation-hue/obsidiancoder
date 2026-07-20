import { useEffect, useRef, useState } from "react";
import videoAsset from "@/assets/obsidian-intro.mp4.asset.json";

const WORD = "OBSIDIAN";
const VIDEO_URL = videoAsset.url;

const LETTER_STAGGER_MS = 180;
const FADE_LEAD_MS = 900;
const FALLBACK_DURATION_MS = 7850;
const REDUCED_MOTION_DURATION_MS = 1600;
const REDUCED_MOTION_FADE_LEAD_MS = 500;

export default function IntroSplash() {
  // Show on every mount (every page load / reload). No sessionStorage guard.
  const [show, setShow] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mq.matches);
    } catch {}
  }, []);

  useEffect(() => {
    if (!show) return;

    let fadeTimer = 0;
    let doneTimer = 0;

    // Reduced-motion path: brief static branded frame, no video playback.
    if (reducedMotion) {
      fadeTimer = window.setTimeout(
        () => setFadeOut(true),
        Math.max(400, REDUCED_MOTION_DURATION_MS - REDUCED_MOTION_FADE_LEAD_MS),
      );
      doneTimer = window.setTimeout(() => setShow(false), REDUCED_MOTION_DURATION_MS);
      return () => {
        window.clearTimeout(fadeTimer);
        window.clearTimeout(doneTimer);
      };
    }

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

    // Try audible autoplay first; if blocked, fall back to muted video.
    // Never arm click/key/pointer/touch listeners to retry audio later.
    video.muted = false;
    video.volume = 0.9;
    video.playsInline = true;
    const p = video.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        try {
          video.muted = true;
          void video.play();
        } catch {}
      });
    }

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("ended", onEnded);
      try { video.pause(); } catch {}
    };
  }, [show, reducedMotion]);

  if (!show) return null;

  return (
    <div
      className={`obs-intro-splash${fadeOut ? " is-leaving" : ""}`}
      aria-hidden="true"
    >
      {!reducedMotion && (
        <video
          ref={videoRef}
          className="obs-intro-video"
          src={VIDEO_URL}
          autoPlay
          playsInline
          preload="auto"
        />
      )}
      <div className="obs-intro-glow" />
      <h1 className="obs-intro-word">
        {WORD.split("").map((ch, i) => (
          <span
            key={i}
            className="obs-intro-letter"
            style={{ animationDelay: `${i * LETTER_STAGGER_MS}ms` }}
          >
            {ch}
          </span>
        ))}
      </h1>
      <div className="obs-intro-line" />
      <div className="obs-intro-sub">Aetheris Obsidian</div>
    </div>
  );
}
