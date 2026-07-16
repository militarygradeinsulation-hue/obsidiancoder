import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState, useEffect } from "react";
import { Send, Loader2, ChevronRight } from "lucide-react";
import { generateHtml } from "@/lib/aetheris.functions";

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

function Index() {
  const callGenerate = useServerFn(generateHtml);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Aetheris Obsidian. Powered by Gemini 2.5 Pro, Claude 3.5 Sonnet, and GPT-4 Turbo. Just describe what you need—I'll understand and build it right the first time.",
    },
  ]);
  const [input, setInput] = useState("");
  const [html, setHtml] = useState("");
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<ModelId>("google/gemini-3.5-flash");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  const previewSrcDoc = useMemo(
    () =>
      html ||
      `<!doctype html><html><body style="margin:0;display:grid;place-items:center;height:100vh;background:transparent;color:#9a8b6c;font-family:system-ui;font-size:14px">Nothing built yet — tell it what you want on the left.</body></html>`,
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
    <main className="min-h-screen bg-constellation">
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
          {/* Left: Premium Landing Section */}
          <div className="flex flex-col justify-between">
            {/* Logo & Branding */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <svg className="w-8 h-8" viewBox="0 0 32 40" fill="none">
                  <path d="M16 0L8 10L16 20L8 30L16 40M16 0L24 10L16 20L24 30L16 40" stroke="currentColor" strokeWidth="1.5" className="text-amber"/>
                </svg>
                <span className="font-mono text-xs uppercase tracking-widest text-amber">Obsidian</span>
              </div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-8">Vibe Coding. Elevated.</p>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl font-light leading-tight tracking-tight mb-1">
                <span className="text-foreground">Code with clarity.</span>
                <br />
                <span className="text-amber">Build with intention.</span>
              </h1>
              <div className="w-12 h-px bg-amber my-6" />

              {/* Subheader */}
              <p className="text-base text-muted-foreground leading-relaxed mb-8 max-w-lg">
                Obsidian is the vibe coding tool for builders who value focus, flow, and precision.
              </p>

              {/* Features Grid */}
              <div className="grid grid-cols-3 gap-4 mb-12">
                <div className="space-y-2">
                  <div className="w-2 h-2 rounded-full bg-amber" />
                  <h3 className="text-xs uppercase tracking-widest text-amber font-medium">Focus</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    A distraction-free workspace that keeps you in flow.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="w-2 h-2 rounded-full bg-amber" />
                  <h3 className="text-xs uppercase tracking-widest text-amber font-medium">Vibe</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Smart suggestions that understand your intent, not just syntax.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="w-2 h-2 rounded-full bg-amber" />
                  <h3 className="text-xs uppercase tracking-widest text-amber font-medium">Ship</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    From idea to production with speed, confidence, and control.
                  </p>
                </div>
              </div>
            </div>

            {/* Chat Input */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label htmlFor="model-select" className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Model
                </label>
                <select
                  id="model-select"
                  value={model}
                  onChange={(e) => setModel(e.target.value as ModelId)}
                  disabled={loading}
                  className="flex-1 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-[11px] font-medium text-foreground focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 disabled:opacity-50"
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
                    className="text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-amber"
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
                  className="flex-1 rounded-lg border border-border bg-background/40 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="grid h-11 w-11 place-items-center rounded-lg bg-[color:var(--primary)] text-[color:var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-40 flex-shrink-0"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
              {error && <p className="text-xs text-red-400/80">{error}</p>}
            </div>
          </div>

          {/* Right: Code Editor Panel */}
          <div className="glass-panel-amber flex flex-col overflow-hidden min-h-[600px]">
            {/* Code Editor with Line Numbers */}
            <div className="flex-1 overflow-auto p-6 font-mono text-sm leading-relaxed">
              {html ? (
                <CodeDisplay code={html} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-muted-foreground/50 text-xs">No code yet</p>
                  <p className="text-muted-foreground/30 text-xs mt-1">Tell it what you want to build →</p>
                </div>
              )}
            </div>

            {/* Status Bar */}
            <div className="border-t border-border/30 px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber" />
                <span className="text-xs uppercase tracking-widest text-amber font-medium">
                  {loading ? "Building…" : "In Flow"}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/40">
            Your Vibe. Our Intelligence. Limitless Possibilities.
          </p>
        </div>
      </div>
    </main>
  );
}

function CodeDisplay({ code }: { code: string }) {
  const lines = code.split('\n');
  const maxLines = Math.min(lines.length, 20);
  const displayLines = lines.slice(0, maxLines);

  const highlightLine = (line: string) => {
    // Simple syntax highlighting for amber keywords
    return line
      .replace(/(".*?")/g, '<span class="text-amber">$1</span>')
      .replace(/('.*?')/g, '<span class="text-amber">$1</span>')
      .replace(/\b(function|const|let|var|return|if|else|class|import|export)\b/g, '<span class="text-amber">$1</span>');
  };

  return (
    <div className="w-full">
      {displayLines.map((line, idx) => (
        <div key={idx} className="flex gap-4 hover:bg-white/5 transition-colors">
          <div className="text-muted-foreground/50 w-8 text-right flex-shrink-0 pt-px">
            {String(idx + 1).padStart(2, '0')}
          </div>
          <div
            className="text-muted-foreground/90 flex-1 whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{ __html: highlightLine(line) || '&nbsp;' }}
          />
        </div>
      ))}
      {lines.length > maxLines && (
        <div className="mt-4 text-xs text-muted-foreground/30 italic">
          ... and {lines.length - maxLines} more lines
        </div>
      )}
    </div>
  );
}
