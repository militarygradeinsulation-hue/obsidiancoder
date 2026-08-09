import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState, useEffect } from "react";
import { Send, Loader2, Home, FileText, Grid3x3, CheckSquare, Calendar, Layout, Settings, HelpCircle, Search, Plus, MoreHorizontal, Bookmark, Rocket, ExternalLink } from "lucide-react";
import { generateHtml } from "@/lib/aetheris.functions";
import { pushToLovable, getLovablePushStatus } from "@/lib/lovable-push.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Obsidian — Vibe Coding. Elevated." },
      {
        name: "description",
        content:
          "Code with clarity. Build with intention. Obsidian is the vibe coding tool for builders who value focus, flow, and precision.",
      },
      { property: "og:title", content: "Obsidian — Vibe Coding. Elevated." },
      {
        property: "og:description",
        content: "Code with clarity. Build with intention. Obsidian is the vibe coding tool for builders who value focus, flow, and precision.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Index,
});

type ChatMsg = { role: "user" | "assistant"; content: string };

const MODELS = [
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Default · multimodal" },
  { id: "anthropic/claude-3-5-sonnet", label: "Claude 3.5 Sonnet", hint: "Anthropic · best code" },
  { id: "openai/gpt-4-turbo", label: "GPT-4 Turbo", hint: "OpenAI · powerful" },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", hint: "Fast alternative" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", hint: "Deep reasoning" },
] as const;
type ModelId = (typeof MODELS)[number]["id"];

const NAV_ITEMS = [
  { icon: Home, label: "Home", id: "home" },
  { icon: FileText, label: "Notes", id: "notes" },
  { icon: Grid3x3, label: "Graph", id: "graph" },
  { icon: CheckSquare, label: "Tasks", id: "tasks" },
  { icon: Calendar, label: "Calendar", id: "calendar" },
  { icon: Layout, label: "Templates", id: "templates" },
];

type PushState = "idle" | "queued" | "processing" | "done" | "error";

function Index() {
  const callGenerate = useServerFn(generateHtml);
  const callPushToLovable = useServerFn(pushToLovable);
  const callGetLovablePushStatus = useServerFn(getLovablePushStatus);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Aetheris Obsidian. Powered by Gemini 2.5 Pro, Claude 3.5 Sonnet, and GPT-4 Turbo. Just describe what you need—I'll understand and build it right the first time.",
    },
  ]);
  const [input, setInput] = useState("");
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<ModelId>("google/gemini-3.5-flash");
  const [activeNav, setActiveNav] = useState("home");
  const [pushState, setPushState] = useState<PushState>("idle");
  const [pushId, setPushId] = useState<string | null>(null);
  const [pushUrl, setPushUrl] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  useEffect(() => {
    if (!pushId || (pushState !== "queued" && pushState !== "processing")) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const row = await callGetLovablePushStatus({ data: { id: pushId } });
        if (cancelled) return;
        if (row.status === "done") {
          setPushState("done");
          setPushUrl(row.project_url ?? row.editor_url ?? null);
        } else if (row.status === "error") {
          setPushState("error");
          setPushError(row.error ?? "Push failed.");
        } else {
          setPushState(row.status as PushState);
        }
      } catch {
        // transient poll failure — try again on the next tick
      }
    };
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pushId, pushState]);

  async function handlePushToLovable() {
    if (!html || pushState === "queued" || pushState === "processing") return;
    setPushError(null);
    setPushUrl(null);
    setPushId(null);
    setPushState("queued");
    try {
      const firstUserPrompt = messages.find((m) => m.role === "user")?.content;
      const { id } = await callPushToLovable({
        data: {
          title: firstUserPrompt?.slice(0, 80) || "Obsidian build",
          html,
          history: messages.slice(-10),
        },
      });
      setPushId(id);
    } catch (err) {
      setPushState("error");
      setPushError(err instanceof Error ? err.message : "Could not queue push.");
    }
  }

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
        data: {
          prompt,
          currentHtml: html,
          history: messages.slice(-10),
          model,
        },
      });
      setHtml(newHtml);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Done — updated the preview." },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
      setMessages((m) => [...m, { role: "assistant", content: `⚠ ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-constellation h-screen flex flex-col">
      {/* Top Navigation Bar */}
      <div className="border-b border-border/30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="p-1.5 hover:bg-white/5 rounded text-muted-foreground hover:text-foreground transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button className="p-1.5 hover:bg-white/5 rounded text-muted-foreground hover:text-foreground transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="px-3 py-1.5 text-sm text-muted-foreground/60">New tab</div>
          <button className="p-1.5 hover:bg-white/5 rounded text-muted-foreground hover:text-foreground transition">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-1.5 hover:bg-white/5 rounded text-muted-foreground hover:text-foreground transition">
            <Search className="w-4 h-4" />
          </button>
          <button className="p-1.5 hover:bg-white/5 rounded text-muted-foreground hover:text-foreground transition">
            <Bookmark className="w-4 h-4" />
          </button>
          <button className="p-1.5 hover:bg-white/5 rounded text-muted-foreground hover:text-foreground transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
          </button>
          <button className="p-1.5 hover:bg-white/5 rounded text-muted-foreground hover:text-foreground transition">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-56 border-r border-border/30 flex flex-col">
          {/* Logo */}
          <div className="px-4 py-4 border-b border-border/30">
            <Link to="/welcome" className="flex items-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 32 40" fill="none">
                <path d="M16 0L8 10L16 20L8 30L16 40M16 0L24 10L16 20L24 30L16 40" stroke="currentColor" strokeWidth="1.5" className="text-amber"/>
              </svg>
              <span className="font-mono text-sm font-semibold text-amber">OBSIDIAN</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 py-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded transition ${
                    isActive
                      ? "bg-amber/10 text-amber border-l-2 border-amber"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Vaults */}
          <div className="px-2 py-4 border-t border-border/30">
            <div className="flex items-center justify-between px-3 py-2 mb-2">
              <span className="text-xs uppercase tracking-widest text-muted-foreground/50 font-medium">Vaults</span>
              <button className="p-1 hover:bg-white/5 rounded text-muted-foreground hover:text-amber transition">
                <Plus className="w-3 h-3" />
              </button>
            </div>
            <div className="px-3 py-2 text-sm text-muted-foreground hover:text-amber transition cursor-pointer flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber" />
              Obsidian Vault
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border/30 px-2 py-4 space-y-1">
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition">
              <Settings className="w-4 h-4" />
              <span className="text-sm">Settings</span>
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition">
              <HelpCircle className="w-4 h-4" />
              <span className="text-sm">Help</span>
            </button>
            <div className="px-3 py-2 flex items-center gap-2 text-sm cursor-pointer">
              <div className="w-6 h-6 rounded-full border border-amber flex items-center justify-center text-xs text-amber font-semibold">
                A
              </div>
              <svg className="w-4 h-4 text-muted-foreground ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chat Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-lg rounded-lg rounded-tr-sm px-4 py-2.5 text-sm bg-amber/10 text-foreground border border-amber/20"
                        : "max-w-lg rounded-lg rounded-tl-sm px-4 py-2.5 text-sm bg-white/5 text-muted-foreground"
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-lg rounded-tl-sm px-4 py-2.5 text-sm bg-white/5 text-muted-foreground inline-flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber" />
                    Building…
                  </div>
                </div>
              )}
              {error && <p className="text-xs text-red-400/80 px-2">{error}</p>}
            </div>

            {/* Input Area */}
            <div className="border-t border-border/30 px-6 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <label htmlFor="model-select" className="text-xs uppercase tracking-widest text-muted-foreground/60 font-medium">
                  Model
                </label>
                <select
                  id="model-select"
                  value={model}
                  onChange={(e) => setModel(e.target.value as ModelId)}
                  disabled={loading}
                  className="flex-1 rounded border border-border/30 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-foreground focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber/30 disabled:opacity-50"
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {messages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMessages([messages[0]]);
                      setHtml("");
                      setError(null);
                    }}
                    className="text-xs uppercase tracking-wider text-muted-foreground hover:text-amber transition"
                  >
                    Reset
                  </button>
                )}
              </div>
              <form onSubmit={submit} className="flex items-end gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="What do you want to build?"
                  disabled={loading}
                  className="flex-1 rounded border border-border/30 bg-white/5 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber/30 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="grid h-11 w-11 place-items-center rounded bg-amber text-background transition-opacity hover:opacity-90 disabled:opacity-40 flex-shrink-0"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            </div>
          </div>

          {/* Right Preview Panel */}
          <div className="w-96 border-l border-border/30 flex flex-col overflow-hidden bg-gradient-to-br from-background via-background to-amber/5">
            <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-widest text-amber/60 font-medium">
                Preview
              </span>
              {html && (
                <button
                  type="button"
                  onClick={handlePushToLovable}
                  disabled={pushState === "queued" || pushState === "processing"}
                  className="flex items-center gap-1.5 rounded border border-amber/30 bg-amber/10 px-2 py-1 text-xs text-amber transition hover:bg-amber/20 disabled:opacity-50"
                >
                  {pushState === "queued" || pushState === "processing" ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Rocket className="w-3 h-3" />
                  )}
                  Push to Lovable
                </button>
              )}
            </div>
            {pushState !== "idle" && (
              <div className="px-4 py-2 border-b border-border/30 text-xs">
                {(pushState === "queued" || pushState === "processing") && (
                  <span className="text-muted-foreground">
                    Queued — a worker will create this as a live Lovable project shortly.
                  </span>
                )}
                {pushState === "done" && pushUrl && (
                  <a
                    href={pushUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-amber hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Live on Lovable — open project
                  </a>
                )}
                {pushState === "error" && (
                  <span className="text-red-400/80">{pushError ?? "Push failed."}</span>
                )}
              </div>
            )}
            <div className="flex-1 overflow-auto p-4">
              {html ? (
                <div className="text-[11px] font-mono leading-relaxed text-muted-foreground/80">
                  <CodePreview code={html} />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-center">
                  <p className="text-xs text-muted-foreground/30">Generated code appears here</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CodePreview({ code }: { code: string }) {
  const lines = code.split('\n').slice(0, 30);
  return (
    <div className="space-y-1">
      {lines.map((line, idx) => (
        <div key={idx} className="flex gap-3">
          <span className="text-muted-foreground/40 w-6 text-right flex-shrink-0">{idx + 1}</span>
          <span className="whitespace-pre-wrap break-words">{line || ' '}</span>
        </div>
      ))}
      {lines.length >= 30 && <div className="text-xs text-muted-foreground/20 mt-2">... more code</div>}
    </div>
  );
}
