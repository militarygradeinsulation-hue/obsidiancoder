import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState, useEffect } from "react";
import {
  Send, Eye, Code2, Loader2, Home, FileText, Share2, CheckSquare,
  Calendar, Type, Plus, Search, Bookmark, PanelsTopLeft, MoreHorizontal,
  ChevronLeft, ChevronRight, Settings, HelpCircle, ChevronDown, Diamond, Menu, X, Sparkle,
} from "lucide-react";
import { generateHtml } from "@/lib/aetheris.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Obsidian — Prompt-to-page builder" },
      { name: "description", content: "A dark, focused prompt-to-page builder. Describe it — Obsidian builds it." },
      { property: "og:title", content: "Obsidian — Prompt-to-page builder" },
      { property: "og:description", content: "A dark, focused prompt-to-page builder. Describe it — Obsidian builds it." },
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

const NAV = [
  { id: "home", label: "Home", icon: Home },
  { id: "notes", label: "Notes", icon: FileText },
  { id: "graph", label: "Graph", icon: Share2 },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "templates", label: "Templates", icon: Type },
] as const;

const STORAGE_KEY = "obsidian.vibe.sessions.v1";
const ACTIVE_KEY = "obsidian.vibe.active.v1";

function newSession(): Session {
  return {
    id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
    title: "Vibe Coder",
    messages: [{ role: "assistant", content: "Obsidian ready. Describe what you want built." }],
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const current = sessions.find((s) => s.id === activeId) ?? sessions[0];

  // Hydrate from localStorage after mount
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

  // Persist to localStorage (only after hydration to avoid clobbering)
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
      `<!doctype html><html><body style="margin:0;display:grid;place-items:center;height:100vh;background:transparent;color:#7a6a4a;font-family:system-ui;font-size:13px;letter-spacing:.02em">Nothing built yet.</body></html>`,
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt || loading) return;
    setError(null);
    setInput("");
    const nextHistory: ChatMsg[] = [...current.messages, { role: "user", content: prompt }];
    const isFirstUserMsg = !current.messages.some((m) => m.role === "user");
    updateCurrent({
      messages: nextHistory,
      title: isFirstUserMsg ? prompt.slice(0, 28) : current.title,
    });
    setLoading(true);
    const sessionId = activeId;
    try {
      const { html: newHtml } = await callGenerate({
        data: { prompt, currentHtml: current.html, history: current.messages.slice(-10), model: current.model },
      });
      setSessions((all) => all.map((s) => s.id === sessionId
        ? { ...s, html: newHtml, messages: [...s.messages, { role: "assistant", content: "Done — updated the preview." }] }
        : s));
      setTab("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
      setSessions((all) => all.map((s) => s.id === sessionId
        ? { ...s, messages: [...s.messages, { role: "assistant", content: `⚠ ${msg}` }] }
        : s));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="obsidian-shell">
      {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
      {/* Sidebar */}
      <aside className={"obsidian-sidebar " + (sidebarOpen ? "sidebar-open" : "")}>
        <div className="brand">
          <Diamond className="h-6 w-6 text-amber" strokeWidth={1.2} />
          <span className="brand-word">OBSIDIAN</span>
          <button
            type="button"
            className="icon-btn sidebar-close"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="nav-list">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActive(item.id)}
                className={"nav-item " + (isActive ? "nav-item-active" : "")}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.4} />
                <span>{item.label}</span>
                {isActive && <span className="nav-spark" aria-hidden="true" />}
              </button>
            );
          })}
        </nav>

        <div className="section-label">
          <span>VAULTS</span>
          <button type="button" className="section-add" aria-label="Add vault">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="vault-item">
          <Diamond className="h-3.5 w-3.5 text-amber" strokeWidth={1.4} />
          <span>Obsidian Vault</span>
        </div>

        <div className="sidebar-bottom">
          <button type="button" className="nav-item">
            <Settings className="h-[18px] w-[18px]" strokeWidth={1.4} />
            <span>Settings</span>
          </button>
          <button type="button" className="nav-item">
            <HelpCircle className="h-[18px] w-[18px]" strokeWidth={1.4} />
            <span>Help</span>
          </button>
          <div className="profile-row">
            <div className="avatar">A</div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </aside>

      {/* Main */}
      <section className="obsidian-main">
        {/* Top tab bar */}
        <div className="topbar">
          <div className="topbar-left">
            <button type="button" className="icon-btn sidebar-toggle" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-4 w-4" />
            </button>
            <button type="button" className="icon-btn" aria-label="Back"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" className="icon-btn" aria-label="Forward"><ChevronRight className="h-4 w-4" /></button>
            <div className="tab-strip">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setActiveId(s.id);
                    setError(null);
                    setInput("");
                    setTab("preview");
                  }}
                  className={"tab tab-vibe " + (s.id === activeId ? "tab-active" : "")}
                  aria-label={`Switch to session ${s.title}`}
                  title={s.title}
                >
                  <Sparkle className="h-3.5 w-3.5" strokeWidth={2} />
                  <span className="tab-title">{s.title}</span>
                  {sessions.length > 1 && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="tab-close"
                      aria-label="Close session"
                      onClick={(e) => closeSession(s.id, e)}
                    >
                      <X className="h-3 w-3" />
                    </span>
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={addSession}
                className="icon-btn"
                aria-label="New Vibe session"
                title="New Vibe session"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="topbar-right">
            <button type="button" className="icon-btn" aria-label="Search"><Search className="h-4 w-4" /></button>
            <button type="button" className="icon-btn" aria-label="Bookmarks"><Bookmark className="h-4 w-4" /></button>
            <button type="button" className="icon-btn" aria-label="Split view"><PanelsTopLeft className="h-4 w-4" /></button>
            <button type="button" className="icon-btn" aria-label="More"><MoreHorizontal className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Canvas */}
        <div className="canvas" id="vibe-canvas">
          <div className="canvas-shine" aria-hidden="true" />
          <div className="workspace">
            {/* Chat pane */}
            <div className="pane">
              <div className="pane-head">
                <div className="pane-head-title">
                  <span className="dot" />
                  <span>CHAT</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={current.model}
                    onChange={(e) => updateCurrent({ model: e.target.value as ModelId })}
                    disabled={loading}
                    className="model-select"
                    aria-label="Model"
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  {current.messages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => updateCurrent({ messages: [current.messages[0]], html: "" })}
                      className="pane-reset"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              <div ref={scrollRef} className="chat-scroll">
                {current.messages.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "msg msg-user" : "msg msg-assistant"}>
                    {m.content}
                  </div>
                ))}
                {loading && (
                  <div className="msg msg-assistant msg-loading">
                    <Loader2 className="h-4 w-4 animate-spin text-amber" />
                    Building…
                  </div>
                )}
              </div>
              <form onSubmit={submit} className="composer">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Describe what to build…"
                  disabled={loading}
                  className="composer-input"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  aria-label="Send"
                  className="composer-send"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            </div>

            {/* Preview pane */}
            <div className="pane">
              <div className="pane-head">
                <div className="flex items-center gap-1">
                  <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </TabButton>
                  <TabButton active={tab === "code"} onClick={() => setTab("code")}>
                    <Code2 className="h-3.5 w-3.5" /> Code
                  </TabButton>
                </div>
                {current.html && (
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {(current.html.length / 1024).toFixed(1)} KB
                  </span>
                )}
              </div>
              <div className="pane-body">
                {tab === "preview" ? (
                  <iframe
                    title="Obsidian preview"
                    srcDoc={previewSrcDoc}
                    sandbox="allow-scripts"
                    className="h-full w-full"
                  />
                ) : (
                  <pre className="code-view">{current.html || "// Nothing yet."}</pre>
                )}
              </div>
            </div>
          </div>
          {error && <p className="error-line">{error}</p>}
        </div>
      </section>
    </main>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={"tab-btn " + (active ? "tab-btn-active" : "")}
    >
      {children}
    </button>
  );
}
