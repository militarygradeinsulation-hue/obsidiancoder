import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";

type Build = {
  id: string;
  created_at: string;
  title: string;
  prompt: string;
  model: string | null;
  client_id: string | null;
  byte_size: number;
};

const TOKEN_KEY = "obs.gallery.admin_token";

export const Route = createFileRoute("/gallery")({
  beforeLoad: async () => {
    const { ensureUnlocked } = await import("@/lib/gate.functions");
    await ensureUnlocked();
  },
  head: () => ({
    meta: [
      { title: "Vibe Coder Gallery — admin" },
      { name: "description", content: "Private admin view of every build saved by the Vibe Coder." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Gallery,
  errorComponent: ({ error, reset }) => (
    <div style={{ padding: 32, color: "#f2eee7", background: "#111317", minHeight: "100vh" }}>
      <h1>Couldn't load gallery</h1>
      <p style={{ color: "#B6BCC8" }}>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  ),
  notFoundComponent: () => <div style={{ padding: 32 }}>Not found</div>,
});

function Gallery() {
  const [token, setToken] = useState<string>("");
  const [tokenInput, setTokenInput] = useState<string>("");
  const [builds, setBuilds] = useState<Build[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : "";
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (!token) return;
    setError(null);
    setBuilds(null);
    fetch("/api/public/builds", { headers: { "x-admin-token": token } })
      .then((r) => {
        if (r.status === 401) throw new Error("Invalid admin token");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setBuilds(d.builds as Build[]))
      .catch((e) => {
        setError(e.message);
        if (String(e.message).toLowerCase().includes("invalid")) {
          localStorage.removeItem(TOKEN_KEY);
          setToken("");
        }
      });
  }, [token]);

  const filtered = (builds ?? []).filter((b) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return b.title.toLowerCase().includes(s) || b.prompt.toLowerCase().includes(s);
  });

  if (!token) {
    return (
      <div style={{ minHeight: "100vh", background: "#111317", color: "#f2eee7", fontFamily: "Inter, system-ui", display: "grid", placeItems: "center", padding: 24 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!tokenInput.trim()) return;
            localStorage.setItem(TOKEN_KEY, tokenInput.trim());
            setToken(tokenInput.trim());
          }}
          style={{ background: "#171a20", border: "1px solid #22262d", borderRadius: 12, padding: 24, width: "100%", maxWidth: 420 }}
        >
          <h1 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 22, margin: 0, color: "#F4A125" }}>Gallery — Admin</h1>
          <p style={{ color: "#B6BCC8", marginTop: 8, fontSize: 13 }}>
            This view is private. Paste the gallery admin token to see saved builds.
          </p>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Admin token"
            style={{ width: "100%", marginTop: 12, padding: "10px 12px", background: "#0b0d10", color: "#f2eee7", border: "1px solid #22262d", borderRadius: 8 }}
          />
          <button
            type="submit"
            style={{ marginTop: 12, width: "100%", padding: "10px 12px", background: "#F4A125", color: "#111317", border: 0, borderRadius: 8, fontWeight: 600, cursor: "pointer" }}
          >
            Unlock
          </button>
          {error && <p style={{ color: "#ff8a8a", marginTop: 10, fontSize: 12 }}>{error}</p>}
          <Link to="/" style={{ display: "inline-block", marginTop: 14, color: "#B6BCC8", fontSize: 13 }}>← Back to Coder</Link>
        </form>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#111317", color: "#f2eee7", fontFamily: "Inter, system-ui" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 28px", borderBottom: "1px solid #22262d" }}>
        <div>
          <h1 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 28, margin: 0, color: "#F4A125" }}>Build Gallery <span style={{ fontSize: 12, color: "#B6BCC8", marginLeft: 8 }}>admin</span></h1>
          <p style={{ color: "#B6BCC8", margin: "4px 0 0", fontSize: 13 }}>
            {builds ? `${builds.length} builds saved` : "Loading…"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(TOKEN_KEY);
              setToken("");
              setBuilds(null);
            }}
            style={{ background: "transparent", color: "#B6BCC8", border: "1px solid #22262d", padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
          >
            Sign out
          </button>
          <Link to="/" style={{ color: "#F4A125", textDecoration: "none", fontSize: 14 }}>← Back to Coder</Link>
        </div>
      </header>

      <div style={{ padding: "20px 28px" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search builds…"
          style={{ width: "100%", maxWidth: 480, padding: "10px 14px", background: "#0b0d10", color: "#f2eee7", border: "1px solid #22262d", borderRadius: 8, fontFamily: "inherit" }}
        />
      </div>

      {error && <div style={{ padding: "0 28px", color: "#ff8a8a" }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, padding: "8px 28px 40px" }}>
        {filtered.map((b) => {
          const url = `/api/public/builds/${b.id}?token=${encodeURIComponent(token)}`;
          return (
            <a
              key={b.id}
              href={url}
              target="_blank"
              rel="noreferrer"
              style={{ display: "block", background: "#171a20", border: "1px solid #22262d", borderRadius: 12, overflow: "hidden", textDecoration: "none", color: "inherit" }}
            >
              <iframe
                src={url}
                title={b.title}
                sandbox="allow-scripts"
                style={{ width: "100%", height: 180, border: 0, background: "#0b0d10", pointerEvents: "none" }}
                loading="lazy"
              />
              <div style={{ padding: 14 }}>
                <div style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 16, color: "#F4A125", marginBottom: 4 }}>{b.title}</div>
                <div style={{ fontSize: 12, color: "#B6BCC8", display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>{new Date(b.created_at).toLocaleString()}</span>
                  <span>{(b.byte_size / 1024).toFixed(1)} KB</span>
                </div>
                {b.prompt && (
                  <div style={{ fontSize: 12, color: "#8a919b", marginTop: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {b.prompt}
                  </div>
                )}
              </div>
            </a>
          );
        })}
        {builds && filtered.length === 0 && (
          <div style={{ color: "#B6BCC8", padding: 20 }}>No builds yet.</div>
        )}
      </div>
    </div>
  );
}
