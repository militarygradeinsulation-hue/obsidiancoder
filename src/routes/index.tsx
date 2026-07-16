import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState, useEffect } from "react";
import {
  Send, Eye, Code2, Loader2, Home, FolderOpen, FileText, Files, Code,
  Layers, Bot, CheckSquare, Database, Sparkles, TerminalSquare,
  FlaskConical, GitBranch, Rocket, Settings, ChevronDown, Search,
  Menu, X, Plus, ChevronLeft, ChevronRight, MoreHorizontal, Monitor,
  Smartphone, Calendar, Check, ArrowRight, FileCode, Paperclip,
} from "lucide-react";
import { generateHtml } from "@/lib/aetheris.functions";
import aetherisLogo from "@/assets/aetheris-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Obsidian — Vibe coding, elevated" },
      { name: "description", content: "A premium prompt-to-page workspace. Deep space palette, warm gold accents, live preview." },
      { property: "og:title", content: "Obsidian — Vibe coding, elevated" },
      { property: "og:description", content: "A premium prompt-to-page workspace. Deep space palette, warm gold accents, live preview." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Index,
});

type ChatMsg = { role: "user" | "assistant"; content: string };

const MODELS = [
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "anthropic/claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
  { id: "openai/gpt-4-turbo", label: "GPT-4 Turbo" },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
] as const;
type ModelId = (typeof MODELS)[number]["id"];

type Session = {
  id: string;
  title: string;
  messages: ChatMsg[];
  html: string;
  model: ModelId;
};

const WORKSPACE_NAV = [
  { id: "home", label: "Home", icon: Home },
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "notes", label: "Notes", icon: FileText },
  { id: "files", label: "Files", icon: Files },
  { id: "code", label: "Code", icon: Code },
  { id: "snippets", label: "Snippets", icon: Layers },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "databases", label: "Databases", icon: Database },
] as const;

const TOOLS_NAV: { id: string; label: string; icon: typeof Sparkles; shortcut?: string }[] = [
  { id: "ai-chat", label: "AI Chat", icon: Sparkles, shortcut: "⌘ I" },
  { id: "code-assist", label: "Code Assist", icon: Code2, shortcut: "⌘ L" },
  { id: "terminal", label: "Terminal", icon: TerminalSquare, shortcut: "⌘ J" },
  { id: "playground", label: "Playground", icon: FlaskConical },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "deploy", label: "Deploy", icon: Rocket },
];

const SUGGESTIONS = [
  { icon: Calendar, label: "Add a hero with a call-to-action" },
  { icon: Layers, label: "Build a pricing section" },
  { icon: FileCode, label: "Generate a landing page" },
] as const;

const STORAGE_KEY = "obsidian.vibe.sessions.v1";
const ACTIVE_KEY = "obsidian.vibe.active.v1";

function newSession(): Session {
  return {
    id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
    title: "Untitled",
    messages: [{ role: "assistant", content: "Obsidian is ready. Tell me what to build." }],
    html: "",
    model: "google/gemini-3.5-flash",
  };
}

const INITIAL_SESSION = newSession();

function Index() {
  const callGenerate = useServerFn(generateHtml);
  const [sessions, setSessions] = useState<Session[]>([INITIAL_SESSION]);
  const [activeId, setActiveId] = useState<string>(INITIAL_SESSION.id);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<string>("projects");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [terminal, setTerminal] = useState<string[]>([
    "✓ Compiled successfully in 842ms",
    "✓ Preview ready",
    "→ Local: http://localhost:5173",
    "✓ No errors found",
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const current = sessions.find((s) => s.id === activeId) ?? sessions[0];

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const activeRaw = window.localStorage.getItem(ACTIVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Session[];
        if (Array.isArray(parsed) && parsed.length) {
          setSessions(parsed);
          const id = activeRaw && parsed.find((s) => s.id === activeRaw) ? activeRaw : parsed[0].id;
          setActiveId(id);
        }
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); } catch { /* ignore */ }
  }, [sessions, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(ACTIVE_KEY, activeId); } catch { /* ignore */ }
  }, [activeId, hydrated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [current.messages, loading, activeId]);

  const previewSrcDoc = useMemo(
    () =>
      current.html ||
      `<!doctype html><html><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0a0a0a;color:#666;font-family:Inter,system-ui;font-size:13px;letter-spacing:.02em">Nothing built yet.</body></html>`,
    [current.html],
  );

  function updateCurrent(patch: Partial<Session>) {
    setSessions((all) => all.map((s) => (s.id === activeId ? { ...s, ...patch } : s)));
  }

  function addSession() {
    const s = newSession();
    setSessions((all) => [...all, s]);
    setActiveId(s.id);
    setInput("");
    setError(null);
    setTab("preview");
  }

  function closeSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSessions((all) => {
      const next = all.filter((s) => s.id !== id);
      if (next.length === 0) {
        const s = newSession();
        setActiveId(s.id);
        return [s];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  }

  const [pendingImage, setPendingImage] = useState<{ name: string; dataUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files can be attached.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("Image is too large (max 3 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPendingImage({ name: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => setError("Could not read that image.");
    reader.readAsDataURL(file);
  }

  async function submit(promptOverride?: string) {
    const basePrompt = (promptOverride ?? input).trim();
    if ((!basePrompt && !pendingImage) || loading) return;
    const prompt = pendingImage
      ? `${basePrompt || "Use this image in the design."}\n\n[Attached image — embed exactly, do not replace]\nfilename: ${pendingImage.name}\nsrc: ${pendingImage.dataUrl}`
      : basePrompt;
    setError(null);
    setInput("");
    setPendingImage(null);
    const nextHistory: ChatMsg[] = [...current.messages, { role: "user", content: prompt }];
    const isFirstUserMsg = !current.messages.some((m) => m.role === "user");
    updateCurrent({
      messages: nextHistory,
      title: isFirstUserMsg ? prompt.slice(0, 28) : current.title,
    });
    setLoading(true);
    setTerminal((t) => [...t, `→ Building: "${prompt.slice(0, 40)}…"`]);
    const sessionId = activeId;
    const t0 = performance.now();
    try {
      const { html: newHtml } = await callGenerate({
        data: { prompt, currentHtml: current.html, history: current.messages.slice(-10), model: current.model },
      });
      setSessions((all) => all.map((s) => s.id === sessionId
        ? { ...s, html: newHtml, messages: [...s.messages, { role: "assistant", content: "Done — updated the preview." }] }
        : s));
      setTab("preview");
      const ms = Math.round(performance.now() - t0);
      setTerminal((t) => [...t, `✓ Compiled in ${ms}ms`, "✓ Preview ready"]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
      setSessions((all) => all.map((s) => s.id === sessionId
        ? { ...s, messages: [...s.messages, { role: "assistant", content: `⚠ ${msg}` }] }
        : s));
      setTerminal((t) => [...t, `✗ ${msg}`]);
    } finally {
      setLoading(false);
    }
  }

  const kb = current.html ? (current.html.length / 1024).toFixed(1) : "0.0";

  return (
    <main className="obs-shell">
      {/* Ambient matrix backdrop */}
      <div className="obs-matrix" aria-hidden="true">
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="matrix-line"
            style={{
              left: `${(i * 7.3) % 100}%`,
              animationDelay: `${(i * 1.7) % 12}s`,
              animationDuration: `${14 + (i % 5) * 3}s`,
              opacity: 0.3 + ((i * 13) % 40) / 200,
            }}
          />
        ))}
      </div>

      {sidebarOpen && <div className="obs-scrim" onClick={() => setSidebarOpen(false)} />}

      {/* ========== SIDEBAR ========== */}
      <aside className={"obs-sidebar " + (sidebarOpen ? "is-open" : "")}>
        <div className="obs-brand">
          <img src={aetherisLogo.url} alt="Aetheris" className="obs-mark obs-mark-img" />
          <span className="obs-brand-word">OBSIDIAN</span>
          <button type="button" className="obs-icon-btn obs-sidebar-close" aria-label="Close menu" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="obs-search">
          <Search className="h-3.5 w-3.5 obs-search-icon" strokeWidth={1.6} />
          <input placeholder="Search anything…" className="obs-search-input" />
          <kbd className="obs-kbd">⌘ K</kbd>
        </div>

        <div className="obs-section-label">Workspace</div>
        <nav className="obs-nav">
          {WORKSPACE_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={"obs-nav-item " + (isActive ? "is-active" : "")}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="obs-section-label">Tools</div>
        <nav className="obs-nav">
          {TOOLS_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" className="obs-nav-item">
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                <span>{item.label}</span>
                {item.shortcut && <kbd className="obs-kbd obs-kbd-nav">{item.shortcut}</kbd>}
              </button>
            );
          })}
        </nav>

        <div className="obs-sidebar-footer">
          <div className="obs-user">
            <div className="obs-avatar">A</div>
            <div className="obs-user-meta">
              <div className="obs-user-name">Obsidian Dev</div>
              <div className="obs-user-sub">Pro Workspace</div>
            </div>
            <button type="button" className="obs-icon-btn" aria-label="Settings">
              <Settings className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </aside>

      {/* ========== MAIN ========== */}
      <section className="obs-main">
        {/* Topbar */}
        <div className="obs-topbar">
          <div className="obs-topbar-left">
            <button type="button" className="obs-icon-btn" aria-label="Menu" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-4 w-4" />
            </button>
            <img src={aetherisLogo.url} alt="Aetheris" className="obs-mark obs-mark-img obs-topbar-logo" />
            <button type="button" className="obs-icon-btn" aria-label="Back"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" className="obs-icon-btn" aria-label="Forward"><ChevronRight className="h-4 w-4" /></button>
            <div className="obs-tabs">
              {sessions.map((s) => {
                const isActive = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setActiveId(s.id);
                      setError(null);
                      setInput("");
                      setTab("preview");
                    }}
                    className={"obs-tab " + (isActive ? "is-active" : "")}
                    title={s.title}
                  >
                    <FileCode className="h-3.5 w-3.5" strokeWidth={1.6} />
                    <span className="obs-tab-title">{s.title}</span>
                    {isActive && s.html && <span className="obs-tab-live">LIVE</span>}
                    {sessions.length > 1 && (
                      <span
                        role="button"
                        tabIndex={0}
                        className="obs-tab-close"
                        aria-label="Close tab"
                        onClick={(e) => closeSession(s.id, e)}
                      >
                        <X className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
              <button type="button" onClick={addSession} className="obs-icon-btn" aria-label="New tab">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="obs-topbar-right">
            <button
              type="button"
              className={"obs-chip " + (tab === "preview" ? "is-on" : "")}
              onClick={() => setTab("preview")}
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
            <button
              type="button"
              className={"obs-chip " + (tab === "code" ? "is-on" : "")}
              onClick={() => setTab("code")}
            >
              <Code2 className="h-3.5 w-3.5" /> Code
            </button>
            <div className="obs-divider" />
            <button
              type="button"
              className={"obs-icon-btn " + (device === "desktop" ? "is-on" : "")}
              onClick={() => setDevice("desktop")}
              aria-label="Desktop preview"
            >
              <Monitor className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={"obs-icon-btn " + (device === "mobile" ? "is-on" : "")}
              onClick={() => setDevice("mobile")}
              aria-label="Mobile preview"
            >
              <Smartphone className="h-4 w-4" />
            </button>
            <div className="obs-divider" />
            <button
              type="button"
              className="obs-chip obs-chip-gold"
              disabled={!current.html}
              onClick={() => {
                if (!current.html) return;
                const blob = new Blob([current.html], { type: "text/html" });
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank", "noopener,noreferrer");
                setTerminal((t) => [...t, `→ Live: opened "${current.title}" in new tab`]);
              }}
              title={current.html ? "Open the current build as a standalone site" : "Build something first"}
            >
              <Rocket className="h-3.5 w-3.5" /> Go Live
            </button>
            <button type="button" className="obs-icon-btn" aria-label="More"><MoreHorizontal className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Body: canvas + right rail */}
        <div className="obs-body">
          <div className="obs-canvas">
            <div className="obs-canvas-head">
              <div className="obs-page-title">
                <span className="obs-title-mark" />
                <h1>{current.title === "Untitled" ? "Vibe Coder" : current.title}</h1>
              </div>
              <div className="obs-page-meta">
                <select
                  value={current.model}
                  onChange={(e) => updateCurrent({ model: e.target.value as ModelId })}
                  disabled={loading}
                  className="obs-model"
                  aria-label="Model"
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <div className="obs-avatar obs-avatar-sm">JT</div>
              </div>
            </div>

            <div className={"obs-preview-wrap " + (device === "mobile" ? "is-mobile" : "")}>
              {tab === "preview" ? (
                <iframe
                  title="Obsidian preview"
                  srcDoc={previewSrcDoc}
                  sandbox="allow-scripts"
                  className="obs-preview"
                />
              ) : (
                <pre className="obs-code">{current.html || "// Nothing yet."}</pre>
              )}
              {loading && (
                <div className="obs-preview-loading" aria-live="polite">
                  <div className="obs-loading-core">
                    <div className="obs-loading-orb" />
                    <div className="obs-loading-ring" />
                    <div className="obs-loading-ring is-outer" />
                  </div>
                  <div className="obs-loading-waves" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} className="obs-loading-wave" style={{ animationDelay: `${i * 0.18}s` }} />
                    ))}
                  </div>
                  <p className="obs-loading-text">Weaving your build…</p>
                </div>
              )}
            </div>
            {error && <p className="obs-error">{error}</p>}
          </div>

          {/* ========== RIGHT RAIL ========== */}
          <aside className="obs-rail">
            {/* AI Agent */}
            <div className="obs-card">
              <div className="obs-card-head">
                <span className="obs-card-label">AI Agent</span>
                <span className="obs-status">
                  <span className="obs-status-dot" /> Active
                </span>
              </div>
              <div ref={scrollRef} className="obs-chat">
                {current.messages.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "obs-msg is-user" : "obs-msg is-assistant"}>
                    {m.content}
                  </div>
                ))}
                {loading && (
                  <div className="obs-msg is-assistant is-loading">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Building…
                  </div>
                )}
              </div>
              <div className="obs-suggestions-label">Suggestions</div>
              <div className="obs-suggestions">
                {SUGGESTIONS.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.label}
                      type="button"
                      className="obs-suggestion"
                      onClick={() => submit(s.label)}
                      disabled={loading}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>
              {pendingImage && (
                <div className="obs-attach-preview">
                  <img src={pendingImage.dataUrl} alt={pendingImage.name} />
                  <span className="obs-attach-name">{pendingImage.name}</span>
                  <button type="button" className="obs-icon-btn" aria-label="Remove attachment" onClick={() => setPendingImage(null)}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <form
                className="obs-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="obs-file-hidden"
                  onChange={handleImagePick}
                />
                <button
                  type="button"
                  className="obs-composer-attach"
                  aria-label="Attach image"
                  disabled={loading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={pendingImage ? "Describe what to do with the image…" : "Ask Obsidian AI…"}
                  disabled={loading}
                  className="obs-composer-input"
                />
                <button
                  type="submit"
                  disabled={loading || (!input.trim() && !pendingImage)}
                  aria-label="Send"
                  className="obs-composer-send"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                </button>
              </form>
            </div>

            {/* Context */}
            <div className="obs-card">
              <div className="obs-card-head">
                <span className="obs-card-label">Context</span>
                <button type="button" className="obs-add-tiny" aria-label="Add context">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <ul className="obs-file-list">
                {sessions.slice(0, 6).map((s) => (
                  <li key={s.id} className="obs-file">
                    <span className="obs-file-badge">TSX</span>
                    <span className="obs-file-name">{(s.title || "Untitled").replace(/\s+/g, "_")}.tsx</span>
                  </li>
                ))}
                <li className="obs-file">
                  <span className="obs-file-badge is-css">CSS</span>
                  <span className="obs-file-name">obsidian.css</span>
                </li>
              </ul>
              <button type="button" className="obs-add-context">
                <Paperclip className="h-3.5 w-3.5" /> Add Context
              </button>
            </div>

            {/* Terminal */}
            <div className="obs-card">
              <div className="obs-card-head">
                <span className="obs-card-label">Terminal</span>
                <span className="obs-node">node <ChevronDown className="h-3 w-3 inline" /></span>
              </div>
              <div className="obs-terminal">
                {terminal.slice(-6).map((line, i) => {
                  const ok = line.startsWith("✓");
                  const arr = line.startsWith("→");
                  const bad = line.startsWith("✗");
                  return (
                    <div
                      key={i}
                      className={
                        "obs-term-line " +
                        (ok ? "is-ok " : "") + (arr ? "is-arrow " : "") + (bad ? "is-bad " : "")
                      }
                    >
                      {ok && <Check className="h-3 w-3" strokeWidth={2.5} />}
                      <span>{line.replace(/^[✓→✗]\s?/, "")}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>

        {/* Bottom status bar */}
        <div className="obs-status-bar">
          <div className="obs-status-left">
            <span className="obs-badge-gold">Sandbox</span>
            <span>Ready</span>
            <span className="obs-muted">localhost:5173</span>
          </div>
          <div className="obs-status-right">
            <span className="obs-muted"><GitBranch className="h-3 w-3 inline mr-1" />main</span>
            <span className="obs-ok"><Check className="h-3 w-3 inline" /> Up to date</span>
            <span className="obs-muted">Prettier <span className="obs-status-dot" /></span>
            <span className="obs-muted">{kb} KB</span>
          </div>
        </div>
      </section>
    </main>
  );
}
