import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Send,
  Loader2,
  Sparkles,
  MessageSquare,
  Check,
  Plus,
  History,
  Rocket,
  RefreshCw,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { discussBuild } from "@/lib/build-chat.functions";
import { containsTradesOnlyLanguage, isExplicitTradesContext } from "@/lib/suggestion-safety";

type Msg = {
  role: "user" | "assistant";
  content: string;
  revisionId?: string;
  ts?: number;
};

interface Props {
  open: boolean;
  onClose: () => void;
  currentHtml: string;
  draftPrompt: string;
  onInsertToPrompt: (text: string) => void;
  onApplyAndRebuild?: (prompt: string) => void;
}

const STORAGE_KEY = "obs.build-chat.history.v3";
const CONFIRMED_KEY = "obs.build-chat.confirmed.v2";
const STALE_KEYS = ["obs.build-chat.history.v2", "obs.build-chat.confirmed.v1"];

/** Cheap revision id from HTML content. */
function revisionOf(html: string): string {
  if (!html) return "empty";
  let h = 5381;
  for (let i = 0; i < html.length; i += 97) h = ((h << 5) + h + html.charCodeAt(i)) | 0;
  return `r_${(h >>> 0).toString(36)}_${html.length}`;
}

/** Parse assistant text into individually-actionable suggestions.
 *  Matches lines that start with →, -, *, •, or a numbered "1." list. */
function extractSuggestions(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(?:→|-|\*|•|\d+[.)])\s+(.{4,})$/);
    if (m) {
      // Strip inline markdown bold
      out.push(m[1].replace(/\*\*/g, "").trim());
    }
  }
  return out.slice(0, 20);
}

export function BuildChatPanel({
  open,
  onClose,
  currentHtml,
  draftPrompt,
  onInsertToPrompt,
  onApplyAndRebuild,
}: Props) {
  const discuss = useServerFn(discussBuild);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<"claude" | "grok" | "auto">("claude");
  const [lastProvider, setLastProvider] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [view, setView] = useState<"chat" | "timeline">("chat");
  const [revisionFilter, setRevisionFilter] = useState<string>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const currentRevision = useMemo(() => revisionOf(currentHtml), [currentHtml]);

  // Load persisted state.
  useEffect(() => {
    try {
      STALE_KEYS.forEach((key) => localStorage.removeItem(key));
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Msg[];
        setMessages(parsed.filter((message) => !containsTradesOnlyLanguage(message.content)));
      }
      const c = localStorage.getItem(CONFIRMED_KEY);
      if (c) {
        const parsed = JSON.parse(c) as string[];
        setConfirmed(parsed.filter((item) => !containsTradesOnlyLanguage(item)));
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-60))); } catch { /* ignore */ }
  }, [messages]);
  useEffect(() => {
    try { localStorage.setItem(CONFIRMED_KEY, JSON.stringify(confirmed.slice(-40))); } catch { /* ignore */ }
  }, [confirmed]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, view]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setError("");
    setInput("");
    // Live sync: always send freshest HTML + unsaved prompt text
    const liveHtml = currentHtml || "";
    const liveDraft = draftPrompt || "";
    const next: Msg[] = [...messages, { role: "user", content: q, revisionId: currentRevision, ts: Date.now() }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await discuss({
        data: {
          question: q,
          currentHtml: liveHtml,
          draftPrompt: liveDraft,
          history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
          preferredModel: provider,
        },
      });
      const allowTrades = isExplicitTradesContext(`${q}\n${liveDraft}\n${liveHtml}`);
      if (!allowTrades && containsTradesOnlyLanguage(res.reply)) {
        throw new Error("domain_mismatch");
      }
      setLastProvider(res.providerUsed);
      setMessages([...next, { role: "assistant", content: res.reply, revisionId: currentRevision, ts: Date.now() }]);
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

  const toggleConfirm = (s: string) => {
    setConfirmed((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const applyConfirmedBatch = () => {
    if (confirmed.length === 0) return;
    const batch = `Apply the following improvements together in a single update:\n${confirmed
      .map((s, i) => `${i + 1}. ${s}`)
      .join("\n")}`;
    onInsertToPrompt(batch);
    setConfirmed([]);
  };

  const applyTopAndRebuild = () => {
    // Pull the top suggestions from the most recent assistant message.
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    const top = extractSuggestions(lastAssistant.content).slice(0, 3);
    if (top.length === 0) return;
    const prompt = `Apply these top improvements now and rebuild:\n${top.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
    if (onApplyAndRebuild) {
      onApplyAndRebuild(prompt);
      onClose();
    } else {
      onInsertToPrompt(prompt);
    }
  };

  // Group messages into revisions for the timeline view.
  const revisions = useMemo(() => {
    const map = new Map<string, Msg[]>();
    for (const m of messages) {
      const key = m.revisionId || "unknown";
      const arr = map.get(key) ?? [];
      arr.push(m);
      map.set(key, arr);
    }
    return Array.from(map.entries()).reverse();
  }, [messages]);

  const filteredMessages = useMemo(
    () => (revisionFilter === "all" ? messages : messages.filter((m) => m.revisionId === revisionFilter)),
    [messages, revisionFilter],
  );

  if (!open) return null;

  const suggestions = currentHtml
    ? [
        "What's the weakest part of this build right now?",
        "Suggest 3 ways to make this more polished and premium.",
        "Which sections should I annotate to change first?",
      ]
    : [
        "Help me sharpen my idea before I build it.",
        "What sections should the first version include?",
        "What's a niche angle nobody else is doing?",
      ];

  const renderAssistant = (content: string, msgIndex: number) => {
    const lines = content.split("\n");
    return lines.map((line, j) => {
      const raw = line.trim();
      if (!raw) return <div key={j} className="h-2" />;
      const m = raw.match(/^(→|-|\*|•|\d+[.)])\s+(.{4,})$/);
      if (m) {
        const clean = m[2].replace(/\*\*/g, "").trim();
        const isConfirmed = confirmed.includes(clean);
        return (
          <div
            key={j}
            className="flex items-start gap-2 mt-1.5 px-2 py-1.5 rounded border"
            style={{
              borderColor: isConfirmed ? "rgba(244,161,37,0.55)" : "rgba(244,161,37,0.22)",
              background: isConfirmed ? "rgba(244,161,37,0.12)" : "rgba(244,161,37,0.05)",
            }}
          >
            <button
              type="button"
              onClick={() => toggleConfirm(clean)}
              className="mt-0.5 h-4 w-4 rounded flex items-center justify-center border shrink-0"
              style={{
                borderColor: "rgba(244,161,37,0.6)",
                background: isConfirmed ? "#f4a125" : "transparent",
              }}
              title={isConfirmed ? "Remove from batch" : "Add to confirmed batch"}
              aria-label={isConfirmed ? "Confirmed" : "Confirm suggestion"}
            >
              {isConfirmed && <Check className="h-3 w-3" style={{ color: "#111317" }} />}
            </button>
            <div className="flex-1 text-xs leading-relaxed" style={{ color: "#f2eee7" }}>
              {clean}
            </div>
            <button
              type="button"
              onClick={() => onInsertToPrompt(clean)}
              className="p-1 rounded hover:bg-white/10 shrink-0"
              title="Insert this single change into the builder prompt"
              aria-label="Insert suggestion"
            >
              <Plus className="h-3.5 w-3.5" style={{ color: "#f4a125" }} />
            </button>
          </div>
        );
      }
      // Section headers referencing "section", "header", "hero", etc. become subtle anchors.
      const isAnchor = /\b(section|header|hero|footer|nav|CTA|pricing|form|card)\b/i.test(raw) && raw.length < 80;
      return (
        <div
          key={j}
          className="text-sm leading-relaxed"
          style={isAnchor ? { color: "#f6e6c8", fontWeight: 500 } : { color: "#e6e9ef" }}
        >
          {raw}
        </div>
      );
    });
  };

  const htmlKb = Math.round((currentHtml?.length || 0) / 1024);
  const draftLen = draftPrompt?.trim().length || 0;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end pointer-events-none">
      <div
        className="pointer-events-auto flex flex-col w-full sm:w-[480px] h-full border-l shadow-2xl"
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
              <div className="text-[11px] flex items-center gap-1.5" style={{ color: "#b6bcc8" }}>
                <RefreshCw className="h-2.5 w-2.5" />
                Live sync · HTML {htmlKb}KB · draft {draftLen} chars
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

        {/* Tabs */}
        <div className="flex items-center gap-1 px-3 pt-2">
          {(["chat", "timeline"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className="text-[11px] uppercase tracking-wider px-2 py-1 rounded flex items-center gap-1"
              style={{
                color: view === v ? "#f4a125" : "#b6bcc8",
                background: view === v ? "rgba(244,161,37,0.10)" : "transparent",
                border: `1px solid ${view === v ? "rgba(244,161,37,0.35)" : "transparent"}`,
              }}
            >
              {v === "chat" ? <MessageSquare className="h-3 w-3" /> : <History className="h-3 w-3" />}
              {v}
            </button>
          ))}
          {view === "timeline" && revisions.length > 0 && (
            <select
              value={revisionFilter}
              onChange={(e) => setRevisionFilter(e.target.value)}
              className="ml-auto text-[10px] rounded px-2 py-1"
              style={{ background: "rgba(0,0,0,0.5)", color: "#f2eee7", border: "1px solid rgba(244,161,37,0.25)" }}
            >
              <option value="all">All revisions</option>
              {revisions.map(([rev]) => (
                <option key={rev} value={rev}>
                  {rev === currentRevision ? "◉ current" : rev.slice(0, 10)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {view === "chat" && messages.length === 0 && (
            <div className="text-sm space-y-3" style={{ color: "#d9dde5" }}>
              <p>
                Talk through your build with me — before, during, or after you generate.
                Check the boxes on the suggestions you want, then batch-apply them.
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
            </div>
          )}

          {view === "chat" &&
            messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className="max-w-[94%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed"
                  style={
                    m.role === "user"
                      ? { background: "rgba(244,161,37,0.16)", color: "#f6e6c8", border: "1px solid rgba(244,161,37,0.35)" }
                      : { background: "rgba(255,255,255,0.04)", color: "#f2eee7", border: "1px solid rgba(255,255,255,0.08)", width: "100%" }
                  }
                >
                  {m.role === "assistant" ? renderAssistant(m.content, i) : m.content}
                </div>
              </div>
            ))}

          {view === "timeline" && (
            <div className="space-y-4">
              {revisions.length === 0 && (
                <div className="text-xs" style={{ color: "#b6bcc8" }}>No chat history yet. Talk to me first.</div>
              )}
              {revisions
                .filter(([rev]) => revisionFilter === "all" || rev === revisionFilter)
                .map(([rev, msgs]) => {
                  const isCurrent = rev === currentRevision;
                  const suggestionsInRev = msgs
                    .filter((m) => m.role === "assistant")
                    .flatMap((m) => extractSuggestions(m.content));
                  return (
                    <div
                      key={rev}
                      className="rounded-lg border p-3"
                      style={{
                        borderColor: isCurrent ? "rgba(244,161,37,0.5)" : "rgba(255,255,255,0.08)",
                        background: "rgba(0,0,0,0.35)",
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[11px] font-mono" style={{ color: isCurrent ? "#f4a125" : "#b6bcc8" }}>
                          {isCurrent ? "◉ current revision" : rev.slice(0, 14)}
                        </div>
                        <div className="text-[10px]" style={{ color: "#7a8290" }}>
                          {msgs.length} msgs · {suggestionsInRev.length} ideas
                        </div>
                      </div>
                      {suggestionsInRev.length > 0 && (
                        <div className="space-y-1">
                          {suggestionsInRev.slice(0, 6).map((s, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => onInsertToPrompt(s)}
                              className="w-full text-left text-[11px] px-2 py-1.5 rounded border transition hover:border-amber-400/60"
                              style={{ borderColor: "rgba(244,161,37,0.2)", color: "#f2eee7", background: "rgba(255,255,255,0.02)" }}
                              title="Reapply this prior idea"
                            >
                              → {s}
                            </button>
                          ))}
                        </div>
                      )}
                      {!isCurrent && suggestionsInRev.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const prompt = `Reapply these prior ideas to the current build:\n${suggestionsInRev
                              .slice(0, 5)
                              .map((s, i) => `${i + 1}. ${s}`)
                              .join("\n")}`;
                            onInsertToPrompt(prompt);
                          }}
                          className="mt-2 text-[10px] px-2 py-1 rounded"
                          style={{ background: "rgba(244,161,37,0.15)", color: "#f4a125", border: "1px solid rgba(244,161,37,0.35)" }}
                        >
                          Reapply this revision's ideas
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {busy && view === "chat" && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "#b6bcc8" }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking with {provider === "grok" ? "Grok" : provider === "auto" ? "best available" : "Claude"}…
            </div>
          )}
          {error && (
            <div className="text-xs px-3 py-2 rounded border" style={{ color: "#ff9b9b", borderColor: "rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.08)" }}>
              {error}
            </div>
          )}
          {!busy && lastProvider && messages.length > 0 && view === "chat" && (
            <div className="text-[10px] text-right" style={{ color: "#7a8290" }}>via {lastProvider}</div>
          )}
        </div>

        {/* Batch action bar */}
        {(confirmed.length > 0 || messages.some((m) => m.role === "assistant")) && (
          <div
            className="border-t px-3 py-2 flex items-center gap-2 flex-wrap"
            style={{ borderColor: "rgba(244,161,37,0.22)", background: "rgba(244,161,37,0.04)" }}
          >
            <button
              type="button"
              onClick={applyConfirmedBatch}
              disabled={confirmed.length === 0}
              className="text-xs px-3 py-1.5 rounded flex items-center gap-1.5 font-semibold disabled:opacity-40"
              style={{ background: "#f4a125", color: "#111317" }}
              title="Send every confirmed suggestion into the composer as one batch"
            >
              <Check className="h-3.5 w-3.5" />
              Apply {confirmed.length || ""} confirmed as batch
            </button>
            {onApplyAndRebuild && (
              <button
                type="button"
                onClick={applyTopAndRebuild}
                className="text-xs px-3 py-1.5 rounded flex items-center gap-1.5 border"
                style={{ borderColor: "rgba(244,161,37,0.55)", color: "#f4a125", background: "rgba(244,161,37,0.10)" }}
                title="Apply the top 3 ideas from the last reply and rebuild immediately"
              >
                <Rocket className="h-3.5 w-3.5" />
                Auto-apply top 3 & rebuild
              </button>
            )}
            {confirmed.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmed([])}
                className="text-[10px] ml-auto hover:text-amber-400"
                style={{ color: "#b6bcc8" }}
              >
                Clear
              </button>
            )}
          </div>
        )}

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
            <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> Check ideas to batch-apply. Timeline saves them per revision.</span>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => { setMessages([]); setError(""); setLastProvider(""); setConfirmed([]); }}
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
