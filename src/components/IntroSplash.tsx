import { useEffect, useState } from "react";
import audioAsset from "@/assets/obsidian-intro.m4a.asset.json";

const WORD = "OBSIDIAN";
const STORAGE_KEY = "obs.introSplashShown";
const AUDIO_URL = audioAsset.url;

const LETTER_STAGGER_MS = 180;
const FADE_LEAD_MS = 900;
const FALLBACK_DURATION_MS = 5960;

export default function IntroSplash() {
  const [show, setShow] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(STORAGE_KEY) === "1") return;
      window.sessionStorage.setItem(STORAGE_KEY, "1");
      window.sessionStorage.setItem("obs.introPlayed", "1");
    } catch {}
    setShow(true);

    const audio = new Audio();
    audio.src = AUDIO_URL;
    audio.preload = "auto";
    audio.volume = 0.9;
    audio.crossOrigin = "anonymous";
    (audio as any).playsInline = true;

    let fadeTimer = 0;
    let doneTimer = 0;
    let started = false;

    const scheduleFromDuration = (durationMs: number) => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
      const fadeAt = Math.max(600, durationMs - FADE_LEAD_MS);
      fadeTimer = window.setTimeout(() => setFadeOut(true), fadeAt);
      doneTimer = window.setTimeout(() => setShow(false), durationMs);
    };

    const startTimeline = () => {
      if (started) return;
      started = true;
      const dur = isFinite(audio.duration) && audio.duration > 0
        ? Math.round(audio.duration * 1000)
        : FALLBACK_DURATION_MS;
      scheduleFromDuration(dur);
    };

    audio.addEventListener("play", startTimeline);
    audio.addEventListener("ended", () => {
      setFadeOut(true);
      window.clearTimeout(doneTimer);
      doneTimer = window.setTimeout(() => setShow(false), 900);
    });
    audio.addEventListener("error", () => {
      // If audio fails entirely, still run the visual timeline.
      startTimeline();
    });

    const attemptPlay = () => {
      const p = audio.play();
      if (p && typeof p.then === "function") {
        p.catch(() => {
          // Autoplay blocked — wait for first user gesture, keep splash visible.
          const unlock = () => {
            audio.play().catch(() => startTimeline());
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
            window.removeEventListener("touchstart", unlock);
          };
          window.addEventListener("pointerdown", unlock, { once: true });
          window.addEventListener("keydown", unlock, { once: true });
          window.addEventListener("touchstart", unlock, { once: true });
          // Safety: if the user never interacts, still dismiss splash.
          window.setTimeout(() => { if (!started) startTimeline(); }, 2500);
        });
      }
    };
    attemptPlay();

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
      try { audio.pause(); } catch {}
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className={`obs-intro-splash${fadeOut ? " is-leaving" : ""}`}
      aria-hidden="true"
      onClick={() => setFadeOut(true)}
    >
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
