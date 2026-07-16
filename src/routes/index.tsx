import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState, useEffect } from "react";
import {
  Send, Eye, Code2, Loader2, Home, FileText, Share2, CheckSquare,
  Calendar, Type, Plus, Search, Bookmark, PanelsTopLeft, MoreHorizontal,
  ChevronLeft, ChevronRight, Settings, HelpCircle, ChevronDown, Diamond, Menu, X,
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

const NAV = [
  { id: "home", label: "Home", icon: Home },
  { id: "notes", label: "Notes", icon: FileText },
  { id: "graph", label: "Graph", icon: Share2 },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "templates", label: "Templates", icon: Type },
] as const;

function Index() {
  const callGenerate = useServerFn(generateHtml);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "Obsidian ready. Describe what you want built." },
  ]);
  const [input, setInput] = useState("");
  const [html, setHtml] = useState("");
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<ModelId>("google/gemini-3.5-flash");
  const [active, setActive] = useState<string>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  const previewSrcDoc = useMemo(
    () =>
      html ||
      `<!doctype html><html><body style="margin:0;display:grid;place-items:center;height:100vh;background:transparent;color:#7a6a4a;font-family:system-ui;font-size:13px;letter-spacing:.02em">Nothing built yet.</body></html>`,
    [html],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt || loading) return;
    setError(null);
    setInput("");
    const nextHistory: ChatMsg[] = [...messages, { role: "user", content: prompt }];
    setMessages(nextHistory);
    setLoading(true);
    try {
      const { html: newHtml } = await callGenerate({
        data: { prompt, currentHtml: html, history: messages.slice(-10), model },
      });
      setHtml(newHtml);
      setMessages((m) => [...m, { role: "assistant", content: "Done — updated the preview." }]);
      setTab("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
      setMessages((m) => [...m, { role: "assistant", content: `⚠ ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="obsidian-shell">
      {/* Sidebar */}
      <aside className="obsidian-sidebar">
        <div className="brand">
          <Diamond className="h-6 w-6 text-amber" strokeWidth={1.2} />
          <span className="brand-word">OBSIDIAN</span>
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
            <button type="button" className="icon-btn" aria-label="Back"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" className="icon-btn" aria-label="Forward"><ChevronRight className="h-4 w-4" /></button>
            <div className="tab-strip">
              <div className="tab tab-active">
                <span>New tab</span>
              </div>
              <button type="button" className="icon-btn" aria-label="New tab"><Plus className="h-4 w-4" /></button>
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
        <div className="canvas">
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
                    value={model}
                    onChange={(e) => setModel(e.target.value as ModelId)}
                    disabled={loading}
                    className="model-select"
                    aria-label="Model"
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  {messages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => { setMessages([messages[0]]); setHtml(""); setError(null); }}
                      className="pane-reset"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              <div ref={scrollRef} className="chat-scroll">
                {messages.map((m, i) => (
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
                {html && (
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {(html.length / 1024).toFixed(1)} KB
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
                  <pre className="code-view">{html || "// Nothing yet."}</pre>
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
