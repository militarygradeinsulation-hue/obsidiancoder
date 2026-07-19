import { useEffect, useState } from "react";

const WORD = "OBSIDIAN";
const STORAGE_KEY = "obs.introSplashShown";
const AUDIO_URL = "/__l5e/assets-v1/8131ec77-3185-4b73-a484-17dbe1debdb1/obsidian-intro.m4a";

// Audio is ~5.96s. Tune the visual timeline to match.
const LETTER_STAGGER_MS = 180; // 8 letters * 180ms = ~1.44s of entrances
const FADE_LEAD_MS = 900;      // start fade this long before audio ends
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

    const audio = new Audio(AUDIO_URL);
    audio.preload = "auto";
    audio.volume = 0.9;

    let fadeTimer = 0;
    let doneTimer = 0;

    const scheduleFromDuration = (durationMs: number) => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
      const fadeAt = Math.max(600, durationMs - FADE_LEAD_MS);
      fadeTimer = window.setTimeout(() => setFadeOut(true), fadeAt);
      doneTimer = window.setTimeout(() => setShow(false), durationMs);
    };

    // Preliminary fallback schedule in case audio never plays.
    scheduleFromDuration(FALLBACK_DURATION_MS);

    audio.addEventListener("loadedmetadata", () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        scheduleFromDuration(Math.round(audio.duration * 1000));
      }
    });
    audio.addEventListener("ended", () => {
      setFadeOut(true);
      window.clearTimeout(doneTimer);
      doneTimer = window.setTimeout(() => setShow(false), 900);
    });

    const tryPlay = () => audio.play().catch(() => {
      const unlock = () => {
        audio.play().catch(() => {});
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
      };
      window.addEventListener("pointerdown", unlock, { once: true });
      window.addEventListener("keydown", unlock, { once: true });
    });
    tryPlay();

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
