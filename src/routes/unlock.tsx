import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { unlockSite } from "@/lib/gate.functions";

export const Route = createFileRoute("/unlock")({
  head: () => ({
    meta: [
      { title: "Unlock — Aetheris Obsidian" },
      { name: "description", content: "Enter your access code to open Aetheris Obsidian." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Unlock,
});

function Unlock() {
  const router = useRouter();
  const unlock = useServerFn(unlockSite);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    try {
      const { ok } = await unlock({ data: { password } });
      if (ok) {
        await router.navigate({ to: "/" });
        router.invalidate();
      } else {
        setError("Access denied.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="unlock-root">
      <style>{unlockCss}</style>

      {/* Ghost digital face — fades in/out occasionally */}
      <div aria-hidden className="unlock-face">
        <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="faceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f4a125" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#dd9324" stopOpacity="0.2" />
            </linearGradient>
            <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
              <rect width="4" height="1" fill="#f4a125" fillOpacity="0.25" />
            </pattern>
          </defs>
          <g fill="none" stroke="url(#faceGrad)" strokeWidth="1.1">
            {/* Face silhouette */}
            <path d="M200 60 C120 60 90 140 90 220 C90 300 120 400 200 440 C280 400 310 300 310 220 C310 140 280 60 200 60 Z" />
            {/* Jaw */}
            <path d="M120 300 C150 380 200 430 200 430 C200 430 250 380 280 300" />
            {/* Nose */}
            <path d="M200 190 L188 270 L200 285 L212 270 L200 190" />
            {/* Eyes */}
            <ellipse cx="155" cy="215" rx="24" ry="10" />
            <ellipse cx="245" cy="215" rx="24" ry="10" />
            <circle cx="155" cy="215" r="4" fill="#f4a125" />
            <circle cx="245" cy="215" r="4" fill="#f4a125" />
            {/* Mouth */}
            <path d="M160 340 Q200 360 240 340" />
            {/* Wireframe contours */}
            <path d="M110 180 Q200 200 290 180" />
            <path d="M105 250 Q200 275 295 250" />
            <path d="M115 320 Q200 345 285 320" />
            <path d="M200 60 L200 440" strokeOpacity="0.3" />
          </g>
          {/* Scanline overlay */}
          <rect x="0" y="0" width="400" height="500" fill="url(#scan)" />
        </svg>
      </div>

      {/* Noise / grain layer */}
      <div aria-hidden className="unlock-noise" />

      <form onSubmit={onSubmit} className="unlock-card">
        <div className="unlock-card-glow" aria-hidden />
        <div className="unlock-title" data-text="AETHERIS">AETHERIS</div>
        <div className="unlock-sub">Obsidian // Access Terminal</div>

        <label htmlFor="password" className="unlock-label">Access code</label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          inputMode="numeric"
          disabled={busy}
          className="unlock-input"
          placeholder="••••"
        />
        {error && <div role="alert" className="unlock-error">⚠ {error}</div>}
        <button type="submit" disabled={busy} className="unlock-btn">
          {busy ? "AUTHENTICATING…" : "UNLOCK"}
        </button>

        <div className="unlock-foot">AETHERIS.TECHNOLOGY</div>
      </form>
    </div>
  );
}

const unlockCss = `
.unlock-root {
  position: relative;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  background: #000;
  color: #f2eee7;
  font-family: Inter, system-ui, sans-serif;
  padding: 24px;
  overflow: hidden;
}
.unlock-face {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
  opacity: 0;
  filter: blur(1.2px) contrast(1.1);
  mix-blend-mode: screen;
  animation: face-cycle 14s ease-in-out infinite;
}
.unlock-face svg {
  width: min(520px, 70vmin);
  height: auto;
  filter: drop-shadow(0 0 24px rgba(244,161,37,0.35));
  animation: face-jitter 6s steps(1) infinite;
}
@keyframes face-cycle {
  0%, 100% { opacity: 0; }
  40% { opacity: 0; }
  46% { opacity: 0.18; }
  50% { opacity: 0.32; }
  54% { opacity: 0.10; }
  58% { opacity: 0.28; }
  64% { opacity: 0; }
}
@keyframes face-jitter {
  0%, 100% { transform: translate(0,0); }
  20% { transform: translate(-1px, 0.5px); }
  40% { transform: translate(1.5px, -0.5px); }
  60% { transform: translate(-0.5px, 1px); }
  80% { transform: translate(0.5px, -1px); }
}
.unlock-noise {
  position: absolute; inset: 0; pointer-events: none;
  background-image:
    repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0 1px, transparent 1px 3px);
  mix-blend-mode: overlay;
  opacity: 0.7;
}
.unlock-card {
  position: relative;
  width: 100%;
  max-width: 380px;
  background: rgba(8,8,10,0.75);
  border: 1px solid rgba(244,161,37,0.25);
  border-radius: 14px;
  padding: 30px 28px 22px;
  box-shadow:
    0 0 0 1px rgba(244,161,37,0.05),
    0 30px 80px rgba(0,0,0,0.85),
    inset 0 1px 0 rgba(255,255,255,0.06);
  backdrop-filter: blur(14px);
  animation: card-float 6s ease-in-out infinite, card-glitch 7s steps(1) infinite;
}
.unlock-card-glow {
  position: absolute; inset: -1px; border-radius: 14px; pointer-events: none;
  background: linear-gradient(120deg, transparent 30%, rgba(244,161,37,0.25) 50%, transparent 70%);
  background-size: 200% 100%;
  animation: shimmer 4s linear infinite;
  mix-blend-mode: overlay;
  opacity: 0.6;
}
@keyframes card-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes card-glitch {
  0%, 92%, 100% { transform: translate(0,0); filter: none; }
  93% { transform: translate(-2px, 0); filter: hue-rotate(-15deg); }
  94% { transform: translate(2px, 1px); }
  95% { transform: translate(-1px, -1px); filter: hue-rotate(10deg); }
  96% { transform: translate(0,0); }
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -100% 0; }
}
.unlock-title {
  position: relative;
  font-family: Fraunces, Georgia, serif;
  font-size: 28px;
  letter-spacing: 6px;
  color: #f2eee7;
  text-shadow: 0 0 12px rgba(244,161,37,0.3);
}
.unlock-title::before, .unlock-title::after {
  content: attr(data-text);
  position: absolute; top: 0; left: 0; width: 100%;
  overflow: hidden;
}
.unlock-title::before {
  color: #f4a125;
  animation: glitch-1 3.5s infinite steps(1);
  clip-path: polygon(0 0, 100% 0, 100% 45%, 0 45%);
}
.unlock-title::after {
  color: #7ad4ff;
  animation: glitch-2 4.2s infinite steps(1);
  clip-path: polygon(0 55%, 100% 55%, 100% 100%, 0 100%);
  mix-blend-mode: screen;
}
@keyframes glitch-1 {
  0%, 90%, 100% { transform: translate(0,0); opacity: 0; }
  91% { transform: translate(-2px, 0); opacity: 0.9; }
  93% { transform: translate(2px, 0); opacity: 0.9; }
  95% { transform: translate(-1px, 1px); opacity: 0.6; }
  97% { opacity: 0; }
}
@keyframes glitch-2 {
  0%, 88%, 100% { transform: translate(0,0); opacity: 0; }
  89% { transform: translate(2px, 0); opacity: 0.7; }
  91% { transform: translate(-2px, 1px); opacity: 0.7; }
  93% { opacity: 0; }
}
.unlock-sub {
  margin-top: 8px;
  font-size: 11px;
  letter-spacing: 3px;
  color: rgba(182,188,200,0.7);
  text-transform: uppercase;
  margin-bottom: 22px;
}
.unlock-label {
  display: block;
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: rgba(182,188,200,0.75);
  margin-bottom: 8px;
}
.unlock-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid rgba(244,161,37,0.25);
  background: rgba(0,0,0,0.65);
  color: #f4a125;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 18px;
  letter-spacing: 8px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.unlock-input:focus {
  border-color: #f4a125;
  box-shadow: 0 0 0 3px rgba(244,161,37,0.15), 0 0 24px rgba(244,161,37,0.2);
}
.unlock-error {
  margin-top: 10px;
  color: #f4a125;
  font-size: 12px;
  letter-spacing: 1px;
  animation: card-glitch 0.4s steps(1) 2;
}
.unlock-btn {
  margin-top: 18px;
  width: 100%;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid #dd9324;
  background: linear-gradient(180deg, #f4a125 0%, #dd9324 100%);
  color: #0a0a0a;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 3px;
  cursor: pointer;
  text-transform: uppercase;
  transition: transform 0.15s, box-shadow 0.2s;
}
.unlock-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(244,161,37,0.35);
}
.unlock-btn:disabled { opacity: 0.6; cursor: wait; }
.unlock-foot {
  margin-top: 22px;
  text-align: center;
  font-family: Fraunces, Georgia, serif;
  font-size: 11px;
  letter-spacing: 4px;
  color: rgba(244,161,37,0.55);
  text-transform: uppercase;
}
`;
