import { useEffect, useRef, useState } from "react";
import { X, Send, Loader2, Sparkles, MessageSquare } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { discussBuild } from "@/lib/build-chat.functions";

type Msg = { role: "user" | "assistant"; content: string };

interface Props {
  open: boolean;
  onClose: () => void;
  currentHtml: string;
  draftPrompt: string;
  onInsertToPrompt: (text: string) => void;
}

const STORAGE_KEY = "obs.build-chat.history";

export function BuildChatPanel({ open, onClose, currentHtml, draftPrompt, onInsertToPrompt }: Props) {
  const discuss = useServerFn(discussBuild);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<"claude" | "grok" | "auto">("claude");
  const [lastProvider, setLastProvider] = useState<string>("");
  const [error, setError] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load / persist chat history per session.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40))); } catch { /* ignore */ }
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setError("");
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await discuss({
        data: {
          question: q,
          currentHtml: currentHtml || "",
          draftPrompt: draftPrompt || "",
          history: messages.slice(-10),
          preferredModel: provider,
        },
      });
      setLastProvider(res.providerUsed);
      setMessages([...next, { role: "assistant", content: res.reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      setError(msg === "build_chat_unavailable"
        ? "Chat models are offline right now. Try again in a moment."
        : `Chat failed: ${msg}`);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  };

  if (!open) return null;

  const suggestions = currentHtml
    ? [
        "What's the weakest part of this build right now?",
        "Suggest 3 ways to make this more polished and premium.",
        "How would you monetize this or add a paid tier?",
      ]
    : [
        "Help me sharpen my idea before I build it.",
        "What sections should the first version include?",
        "What's a niche angle nobody else is doing?",
      ];

  return (
    <div className="fixed inset-0 z-[60] flex justify-end pointer-events-none">
      <div
        className="pointer-events-auto flex flex-col w-full sm:w-[440px] h-full border-l shadow-2xl"
        style={{
          background: "rgba(17, 19, 23, 0.96)",
          borderColor: "rgba(244, 161, 37, 0.28)",
          backdropFilter: "blur(18px)",
        }}
        role="dialog"
        aria-label="Discuss this build"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(244,161,37,0.18)" }}>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" style={{ color: "#f4a125" }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: "#f4a125" }}>Discuss this build</div>
              <div className="text-[11px]" style={{ color: "#b6bcc8" }}>
                Powered by Claude Sonnet 4.5 · advisory only
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as "claude" | "grok" | "auto")}
              className="text-[11px] rounded px-2 py-1"
              style={{ background: "rgba(0,0,0,0.5)", color: "#f2eee7", border: "1px solid rgba(244,161,37,0.25)" }}
              title="Which model powers the chat"
            >
              <option value="claude">Claude 4.5</option>
              <option value="grok">Grok 4.3</option>
              <option value="auto">Auto</option>
            </select>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-white/10"
              aria-label="Close discussion"
            >
              <X className="h-4 w-4" style={{ color: "#b6bcc8" }} />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-sm space-y-3" style={{ color: "#d9dde5" }}>
              <p>
                Talk through your build with me — before, during, or after you generate.
                I'll suggest concrete improvements you can paste back into the composer.
              </p>
              <div className="text-[11px] uppercase tracking-wider" style={{ color: "#b6bcc8" }}>Try:</div>
              <div className="flex flex-col gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-left text-xs px-3 py-2 rounded border transition hover:border-amber-400/60"
                    style={{ borderColor: "rgba(244,161,37,0.25)", color: "#f2eee7", background: "rgba(255,255,255,0.03)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {!currentHtml && (
                <p className="text-[11px]" style={{ color: "#b6bcc8" }}>
                  Tip: this chat also works before you build — great for shaping the first version.
                </p>
              )}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className="max-w-[92%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed"
                style={
                  m.role === "user"
                    ? { background: "rgba(244,161,37,0.16)", color: "#f6e6c8", border: "1px solid rgba(244,161,37,0.35)" }
                    : { background: "rgba(255,255,255,0.05)", color: "#f2eee7", border: "1px solid rgba(255,255,255,0.08)" }
                }
              >
                {m.role === "assistant"
                  ? m.content.split("\n").map((line, j) => {
                      const isSuggestion = line.trim().startsWith("→");
                      if (isSuggestion) {
                        const clean = line.trim().replace(/^→\s*/, "");
                        return (
                          <button
                            key={j}
                            type="button"
                            onClick={() => onInsertToPrompt(clean)}
                            className="block text-left mt-1 w-full text-xs px-2 py-1 rounded border transition hover:border-amber-400/60"
                            style={{ borderColor: "rgba(244,161,37,0.35)", color: "#f4a125", background: "rgba(244,161,37,0.08)" }}
                            title="Insert into the builder prompt"
                          >
                            → {clean}
                          </button>
                        );
                      }
                      return <div key={j}>{line}</div>;
                    })
                  : m.content}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "#b6bcc8" }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking with {provider === "grok" ? "Grok" : provider === "auto" ? "best available" : "Claude"}…
            </div>
          )}
          {error && (
            <div className="text-xs px-3 py-2 rounded border" style={{ color: "#ff9b9b", borderColor: "rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.08)" }}>
              {error}
            </div>
          )}
          {!busy && lastProvider && messages.length > 0 && (
            <div className="text-[10px] text-right" style={{ color: "#7a8290" }}>via {lastProvider}</div>
          )}
        </div>

        <footer className="border-t px-3 py-2" style={{ borderColor: "rgba(244,161,37,0.18)" }}>
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
              }}
              placeholder={currentHtml ? "Ask about the build, or brainstorm the next move…" : "Shape the idea before you build…"}
              rows={2}
              className="flex-1 resize-none text-sm rounded px-3 py-2 focus:outline-none"
              style={{ background: "rgba(0,0,0,0.4)", color: "#f2eee7", border: "1px solid rgba(244,161,37,0.25)" }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              className="px-3 py-2 rounded flex items-center gap-1 text-xs font-semibold disabled:opacity-40"
              style={{ background: "#f4a125", color: "#111317" }}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px]" style={{ color: "#7a8290" }}>
            <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> Ideas here don't touch the preview — use the composer to apply them.</span>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => { setMessages([]); setError(""); setLastProvider(""); }}
                className="hover:text-amber-400"
              >
                Clear chat
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
