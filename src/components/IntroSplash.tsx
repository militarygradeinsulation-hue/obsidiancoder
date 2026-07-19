import { useEffect, useRef, useState } from "react";
import videoAsset from "@/assets/obsidian-intro.mp4.asset.json";

const WORD = "OBSIDIAN";
const STORAGE_KEY = "obs.introSplashShown";
const VIDEO_URL = videoAsset.url;

const LETTER_STAGGER_MS = 180;
const FADE_LEAD_MS = 900;
const FALLBACK_DURATION_MS = 7850;

export default function IntroSplash() {
  const [show, setShow] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(STORAGE_KEY) === "1") return;
      window.sessionStorage.setItem(STORAGE_KEY, "1");
      window.sessionStorage.setItem("obs.introPlayed", "1");
    } catch {}
    setShow(true);
  }, []);

  useEffect(() => {
    if (!show) return;
    const video = videoRef.current;
    if (!video) return;

    let fadeTimer = 0;
    let doneTimer = 0;

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

    // Muted autoplay is always allowed; then try to unmute for audio.
    video.muted = true;
    video.volume = 0.9;
    const p = video.play();
    const tryUnmute = () => { try { video.muted = false; } catch {} };
    if (p && typeof p.then === "function") {
      p.then(tryUnmute).catch(() => {});
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
      onClick={() => setFadeOut(true)}
    >
      <video
        ref={videoRef}
        className="obs-intro-video"
        src={VIDEO_URL}
        autoPlay
        playsInline
        preload="auto"
      />
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
