import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState, useEffect } from "react";
import { Send, Eye, Code2, Sparkles, Loader2 } from "lucide-react";
import { generateHtml } from "@/lib/aetheris.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aetheris Obsidian — Tell it what to build" },
      {
        name: "description",
        content:
          "A free, no-login prompt-to-page builder. Tell it what to build, one thing at a time — it remembers what already works and shows the result live.",
      },
      { property: "og:title", content: "Aetheris Obsidian — Tell it what to build" },
      {
        property: "og:description",
        content: "A free, no-login prompt-to-page builder. Tell it what to build, one thing at a time — it remembers what already works and shows the result live.",
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
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", hint: "Fast · default" },
  { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", hint: "Fastest" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", hint: "Deep reasoning" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Multimodal" },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini", hint: "OpenAI · balanced" },
] as const;
type ModelId = (typeof MODELS)[number]["id"];

function Index() {
  const callGenerate = useServerFn(generateHtml);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Tell me what to build. One thing at a time — I'll keep what already works.",
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
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-10 sm:px-6 lg:py-14">
        {/* Header */}
        <header className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--primary)]/30 bg-[color:var(--primary)]/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-amber sm:text-[11px]">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Obsidian · Free · No Login
          </div>
          <h1 className="mt-5 font-serif text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            Aetheris <span className="text-amber">Coder</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground sm:text-lg">
            The world's best AI models for coding.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/80 sm:text-sm">
            Tell it what to build. It remembers. Watch it appear.
          </p>
        </header>

        {/* Workspace */}
        <section className="mt-10 grid flex-1 gap-4 lg:grid-cols-2">
          {/* Chat pane */}
          <div className="glass-panel flex min-h-[560px] flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-[color:var(--primary)] shadow-glow" />
                Chat
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="model-select" className="sr-only">
                  AI model
                </label>
                <select
                  id="model-select"
                  value={model}
                  onChange={(e) => setModel(e.target.value as ModelId)}
                  disabled={loading}
                  className="rounded-md border border-border bg-background/60 px-2 py-1 text-[11px] font-medium text-foreground focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30 disabled:opacity-50"
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} — {m.hint}
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
            </div>
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[color:var(--primary)]/15 px-4 py-2.5 text-sm text-foreground"
                      : "mr-auto max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm text-foreground"
                  }
                >
                  {m.content}
                </div>
              ))}
              {loading && (
                <div className="mr-auto flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-amber" />
                  Building…
                </div>
              )}
            </div>
            <form
              onSubmit={submit}
              className="flex items-center gap-2 border-t border-border p-3"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="What do you want to build?"
                disabled={loading}
                className="flex-1 rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-[color:var(--primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]/30"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send"
                className="grid h-11 w-11 place-items-center rounded-lg bg-[color:var(--primary)] text-[color:var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </div>

          {/* Preview pane */}
          <div className="glass-panel flex min-h-[560px] flex-col overflow-hidden">
            <div className="flex items-center gap-1 border-b border-border px-3 py-2">
              <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
                <Eye className="h-3.5 w-3.5" /> Preview
              </TabButton>
              <TabButton active={tab === "code"} onClick={() => setTab("code")}>
                <Code2 className="h-3.5 w-3.5" /> Code
              </TabButton>
              {html && (
                <span className="ml-auto text-[11px] uppercase tracking-wider text-muted-foreground">
                  {(html.length / 1024).toFixed(1)} KB
                </span>
              )}
            </div>
            <div className="relative flex-1 bg-background/40">
              {tab === "preview" ? (
                <iframe
                  title="Aetheris preview"
                  srcDoc={previewSrcDoc}
                  sandbox="allow-scripts"
                  className="h-full w-full"
                />
              ) : (
                <pre className="h-full overflow-auto p-4 font-mono text-[12px] leading-relaxed text-muted-foreground">
                  {html || "// Nothing yet. Prompt on the left to generate code."}
                </pre>
              )}
            </div>
          </div>
        </section>

        {error && (
          <p className="mt-3 text-center text-xs text-red-400/80">{error}</p>
        )}

        <footer className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            Need this production-ready?{" "}
            <a
              href="https://businessforensics.tech/leak-audit"
              className="text-amber underline-offset-4 hover:underline"
            >
              Run the Free Leak Audit™ →
            </a>
          </p>
          <p className="mt-2 text-xs tracking-[0.14em] text-muted-foreground/60">
            Aetheris.Technology
          </p>
        </footer>
      </div>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
        (active
          ? "bg-[color:var(--primary)]/15 text-amber"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}
