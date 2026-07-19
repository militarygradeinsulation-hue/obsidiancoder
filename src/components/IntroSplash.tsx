import { useEffect, useState } from "react";

const WORD = "OBSIDIAN";
const STORAGE_KEY = "obs.introSplashShown";
const AUDIO_URL = "/__l5e/assets-v1/8131ec77-3185-4b73-a484-17dbe1debdb1/obsidian-intro.m4a";

export default function IntroSplash() {
  const [show, setShow] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setShow(true);

    // Play the intro sound in sync with the splash
    const audio = new Audio(AUDIO_URL);
    audio.preload = "auto";
    audio.volume = 0.9;
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

    const fade = window.setTimeout(() => setFadeOut(true), 2600);
    const done = window.setTimeout(() => setShow(false), 3400);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
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
            style={{ animationDelay: `${i * 90}ms` }}
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

