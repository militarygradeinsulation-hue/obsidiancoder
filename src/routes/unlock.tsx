import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { unlockSite } from "@/lib/gate.functions";
import logoAsset from "@/assets/aetheris-logo.png.asset.json";


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
        setError("Incorrect code.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      position: "relative",
      minHeight: "100dvh",
      display: "grid",
      placeItems: "center",
      background: "#050607",
      color: "#f2eee7",
      fontFamily: "Inter, system-ui, sans-serif",
      padding: 24,
      overflow: "hidden",
    }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${logoAsset.url})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "min(720px, 90vmin)",
          opacity: 0.12,
          filter: "blur(0.5px)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 20%, rgba(244,161,37,0.10) 0%, rgba(5,6,7,0) 60%)",
          pointerEvents: "none",
        }}
      />
      <form onSubmit={onSubmit} style={{
        position: "relative",
        width: "100%",
        maxWidth: 380,
        background: "rgba(20,18,15,0.85)",
        border: "1px solid rgba(244,161,37,0.25)",
        borderRadius: 16,
        padding: 28,
        boxShadow: "0 30px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
        backdropFilter: "blur(20px)",
      }}>
        <div style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 28, letterSpacing: -0.5, marginBottom: 6 }}>
          Aetheris Obsidian
        </div>
        <div style={{ color: "#b6bcc8", fontSize: 14, marginBottom: 20 }}>
          Enter your access code to continue.
        </div>
        <label htmlFor="password" style={{ display: "block", fontSize: 12, color: "#b6bcc8", marginBottom: 6 }}>
          Access code
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          inputMode="numeric"
          disabled={busy}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.4)",
            color: "#f2eee7",
            fontSize: 16,
            letterSpacing: 4,
            outline: "none",
          }}
        />
        {error && (
          <div role="alert" style={{ marginTop: 12, color: "#f4a125", fontSize: 13 }}>{error}</div>
        )}
        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: 18,
            width: "100%",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #dd9324",
            background: "linear-gradient(180deg, #f4a125 0%, #dd9324 100%)",
            color: "#111317",
            fontWeight: 600,
            fontSize: 15,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: "Fraunces, Georgia, serif",
          fontSize: 13,
          letterSpacing: 3,
          textTransform: "uppercase",
          color: "rgba(244,161,37,0.7)",
        }}
      >
        Aetheris.Technology
      </div>
    </div>
  );
}
