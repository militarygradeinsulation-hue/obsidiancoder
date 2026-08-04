// Shared team page for a Cloud Memory build.
//
// A teammate opens /team/<slug>, enters the team code once, and then uses the
// build normally — every entry it saves goes to the shared cloud store and
// shows up for everyone else. There is no prompt box, no edit bar, and no way
// to change the build itself from this page.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  teamUnlock, rememberTeamToken, recallTeamToken, forgetTeamToken,
} from "@/lib/cloud-memory";
import { useCloudMemoryHost, teamAdapter } from "@/hooks/useCloudMemoryHost";
import { deviceLabel } from "@/lib/project-sync";

export const Route = createFileRoute("/team/$slug")({
  head: () => ({
    meta: [
      { title: "Team build — Obsidian Cloud Memory" },
      { name: "description", content: "Open a shared Obsidian build with your team. Everyone sees the same data, updated live." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Team build — Obsidian Cloud Memory" },
      { property: "og:description", content: "A shared Obsidian build. Enter your team code to use it with your team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const { slug } = Route.useParams();
  const [token, setToken] = useState<string | null>(null);
  const [title, setTitle] = useState("Shared build");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const deviceRef = useRef<string>("");
  if (!deviceRef.current) deviceRef.current = deviceLabel();

  useEffect(() => { setToken(recallTeamToken(slug)); }, [slug]);

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await teamUnlock(slug, code);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    rememberTeamToken(slug, r.data.token);
    setTitle(r.data.title);
    setToken(r.data.token);
  }, [slug, code]);

  useCloudMemoryHost({
    frame,
    projectId: null,
    enabled: Boolean(token),
    adapter: token ? teamAdapter(slug, token, deviceRef.current) : null,
    realtime: false,
    pollMs: 3000,
  });

  if (!token) {
    return (
      <main style={shell}>
        <form onSubmit={submit} style={card}>
          <h1 style={{ fontSize: 20, margin: "0 0 6px", letterSpacing: "-0.01em" }}>
            Team access — shared Obsidian build
          </h1>
          <p style={{ margin: "0 0 16px", fontSize: 13, opacity: 0.7 }}>
            Enter the team code you were given. You only need to do this once on this device.
          </p>
          <input
            value={code}
            onChange={(ev) => setCode(ev.target.value)}
            type="password"
            autoComplete="one-time-code"
            aria-label="Team code"
            placeholder="Team code"
            style={input}
          />
          {error && <p style={{ color: "#F4A125", fontSize: 12, margin: "10px 0 0" }}>{error}</p>}
          <button type="submit" disabled={busy || code.trim().length < 4} style={primary}>
            {busy ? "Checking…" : "Enter"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b0d", color: "#e8e8ea", display: "flex", flexDirection: "column" }}>
      <header style={bar}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 11, opacity: 0.55 }}>☁ Cloud Memory · shared with your team</span>
        <button
          type="button"
          onClick={() => { forgetTeamToken(slug); setToken(null); }}
          style={{ marginLeft: "auto", fontSize: 11, background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "3px 8px", color: "inherit", cursor: "pointer" }}
        >
          Sign out of this build
        </button>
      </header>
      <iframe
        ref={setFrame}
        title={title}
        src={`/api/public/share/${encodeURIComponent(slug)}`}
        sandbox="allow-scripts allow-forms allow-popups"
        style={{ flex: 1, width: "100%", border: "none", background: "#fff" }}
      />
    </div>
  );
}

const shell: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0a0b0d",
  color: "#e8e8ea",
  display: "grid",
  placeItems: "center",
  padding: 24,
};

const card: React.CSSProperties = {
  width: "min(420px, 100%)",
  padding: 24,
  borderRadius: 14,
  border: "1px solid rgba(244,161,37,0.2)",
  background: "rgba(17,19,23,0.9)",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.05)",
  color: "inherit",
  fontSize: 14,
};

const primary: React.CSSProperties = {
  marginTop: 14,
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid rgba(244,161,37,0.45)",
  background: "rgba(244,161,37,0.12)",
  color: "#F4A125",
  fontSize: 14,
  cursor: "pointer",
};

const bar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "8px 14px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(17,19,23,0.95)",
};
