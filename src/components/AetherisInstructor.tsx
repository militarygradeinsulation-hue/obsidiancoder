// Aetheris Instructor — the built-in teacher for Obsidian Pocket.
//
// A small floating tutor that explains the whole Obsidian system in plain,
// 5th-grade English to people who have never coded. It streams from the real
// /api/generate advisory path with the server-side "instructor" persona, so
// no prompt/persona lives in the browser and Pocket's free surface rules
// (x-obs-free) still apply.
import * as React from "react";
import { X, Send, Loader2 } from "lucide-react";

import { authFetch } from "@/lib/auth-fetch";
import { isAiErrorEnvelope } from "@/lib/ai-errors";
import { isCreditsRequiredEnvelope } from "@/lib/credit-gate";

type Msg = { role: "user" | "assistant"; content: string };

const GREETING =
  "Hi! I'm your Aetheris Instructor. I'll teach you how to use Obsidian, one small step at a time — no coding needed.\n\nAsk me things like:\n- What do I do first?\n- What does the Build button do?\n- Give me an idea I can build right now.\n\nTry this next: type \"what do I do first?\" below.";

const QUICK = [
  "What do I do first?",
  "Give me a build idea",
  "What is Pocket vs Vibe?",
  "How do I save my project?",
];

/** Tiny inline renderer: bold, `code`, bullets and fenced blocks. No deps. */
function Rich({ text }: { text: string }) {
  const blocks = text.split(/```/g);
  return (
    <>
      {blocks.map((block, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            className="my-2 overflow-x-auto rounded-lg border border-[#F4A125]/25 bg-black/60 p-2 text-[11px] leading-relaxed text-[#F4C77A]"
          >
            <code>{block.replace(/^\w*\n/, "")}</code>
          </pre>
        ) : (
          <p key={i} className="whitespace-pre-wrap">
            {block.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, j) => {
              if (/^\*\*[^*]+\*\*$/.test(part))
                return (
                  <strong key={j} className="font-semibold text-[#F4A125]">
                    {part.slice(2, -2)}
                  </strong>
                );
              if (/^`[^`]+`$/.test(part))
                return (
                  <code key={j} className="rounded bg-white/10 px-1 py-[1px] text-[11px] text-[#F4C77A]">
                    {part.slice(1, -1)}
                  </code>
                );
              return <React.Fragment key={j}>{part}</React.Fragment>;
            })}
          </p>
        ),
      )}
    </>
  );
}

/** Mini version of the home-screen amber orb — the Instructor's face. */
function InstructorOrb({ size = 34, busy = false }: { size?: number; busy?: boolean }) {
  return (
    <span
      className="obs-mini-orb"
      style={{ width: size, height: size, animationDuration: busy ? "1.1s" : "3.4s" }}
      aria-hidden="true"
    >
      <span className="obs-mini-orb-core" />
      <span className="obs-mini-orb-ring" />
      <span className="obs-mini-orb-ring is-outer" />
    </span>
  );
}

/**
 * Optional hands-on controls. When Pocket passes these, the Instructor stops
 * being a read-only chat and can actually drive the workspace for the learner:
 * read their prompt, write or add to it, start a build, and reset.
 */
export interface InstructorControls {
  getPrompt: () => string;
  setPrompt: (next: string) => void;
  appendPrompt: (extra: string) => void;
  build?: () => void;
  extendIdeas?: () => void;
  clear?: () => void;
  busy?: boolean;
}

/** Pull a suggested prompt out of an assistant answer: fenced block first. */
function extractSuggestedPrompt(text: string): string {
  const fenced = /```(?:prompt|text)?\s*\n([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  const quoted = /"([^"]{40,600})"/.exec(text);
  if (quoted?.[1]?.trim()) return quoted[1].trim();
  return "";
}

export function AetherisInstructor({
  currentHtml = "",
  controls,
}: {
  currentHtml?: string;
  controls?: InstructorControls;
}) {

  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msgs, setMsgs] = React.useState<Msg[]>([{ role: "assistant", content: GREETING }]);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, open]);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const ask = React.useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || busy) return;
      setInput("");
      setBusy(true);
      const history = msgs.slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
      setMsgs((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "" }]);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        // Give the teacher eyes on the workspace: what the learner has typed
        // and whether anything is built yet.
        const draft = controls?.getPrompt().trim() ?? "";
        const workspace = controls
          ? `\n\n[Workspace the learner is looking at]\nPrompt box: ${draft ? `"${draft.slice(0, 900)}"` : "(empty)"}\nPreview: ${currentHtml.length > 200 ? "a build is on screen" : "nothing built yet"}\nWhen you suggest wording for the prompt box, put the exact text in a fenced \`\`\`prompt block so it can be applied with one tap.`
          : "";
        const res = await authFetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-obs-free": "1" },
          body: JSON.stringify({
            prompt: `${question}${workspace}`,
            currentHtml: currentHtml ? currentHtml.slice(0, 4000) : "",
            history,
            advisory: true,
            advisoryPersona: "instructor",
          }),
          signal: controller.signal,
        });


        const ctype = (res.headers.get("content-type") || "").toLowerCase();
        if (ctype.includes("application/json")) {
          const envelope: unknown = await res.json().catch(() => null);
          if (isCreditsRequiredEnvelope(envelope)) throw new Error(envelope.message);
          if (isAiErrorEnvelope(envelope)) throw new Error(envelope.message);
          throw new Error(`The instructor could not answer (${res.status}).`);
        }
        if (!res.ok || !res.body) throw new Error(`The instructor could not answer (${res.status}).`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          const clean = acc.replace(/\s*<!--OBS_(?:TIMING|PLACEHOLDERS):[\s\S]*?-->\s*$/g, "");
          setMsgs((m) => {
            const next = m.slice();
            next[next.length - 1] = { role: "assistant", content: clean };
            return next;
          });
        }
        if (!acc.trim()) {
          setMsgs((m) => {
            const next = m.slice();
            next[next.length - 1] = {
              role: "assistant",
              content: "Sorry — I lost my train of thought. Ask me that again?",
            };
            return next;
          });
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Something went wrong.";
        setMsgs((m) => {
          const next = m.slice();
          next[next.length - 1] = { role: "assistant", content: `I hit a snag: ${message}` };
          return next;
        });
      } finally {
        setBusy(false);
        abortRef.current = null;
        inputRef.current?.focus();
      }
    },
    [busy, currentHtml, msgs],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-[#F4A125]/40 bg-black/60 py-1.5 pl-1.5 pr-4 text-xs font-semibold text-[#F4A125] shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl transition hover:border-[#F4A125]/80 hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
        aria-label="Open the Aetheris Instructor — learn how to use Obsidian"
        title="Aetheris Instructor — your plain-English teacher"
      >
        <InstructorOrb size={30} />
        Aetheris Instructor
      </button>
    );
  }

  return (
    <aside
      className="fixed bottom-4 right-4 z-40 flex h-[min(560px,78vh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#F4A125]/30 bg-black/70 shadow-[0_24px_80px_rgba(0,0,0,0.7)] backdrop-blur-2xl"
      aria-label="Aetheris Instructor"
    >
      <header className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2">
        <InstructorOrb size={28} busy={busy} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-[#F4A125]">Aetheris Instructor</p>
          <p className="truncate text-[10px] text-[#7d8494]">
            {busy ? "Thinking…" : "Teaching you Obsidian, step by step"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md p-1 text-[#B6BCC8] transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
          aria-label="Close the instructor"
        >
          <X size={14} />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-[12px] leading-relaxed">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-[#F4A125] px-3 py-2 font-medium text-[#111317]"
                  : "max-w-full text-[#E8E6E1]"
              }
            >
              {m.role === "assistant" && !m.content && busy ? (
                <span className="inline-flex items-center gap-2 text-[#7d8494]">
                  <Loader2 size={12} className="animate-spin" /> Thinking it through…
                </span>
              ) : (
                <Rich text={m.content} />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 px-3 py-2">
        <div className="mb-2 flex flex-wrap gap-1">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => void ask(q)}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-[#B6BCC8] transition hover:border-[#F4A125]/50 hover:text-[#F4A125] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <label htmlFor="instructor-input" className="sr-only">
            Ask the Aetheris Instructor a question
          </label>
          <textarea
            id="instructor-input"
            ref={inputRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            placeholder="Ask me anything — I'll keep it simple."
            className="min-h-[38px] w-full resize-none rounded-lg border border-white/10 bg-black/50 px-2.5 py-2 text-[12px] text-[#E8E6E1] placeholder:text-[#4b5060] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-b from-[#F4A125] to-[#DD9324] text-[#111317] transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
            aria-label="Send your question"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </form>
      </div>
    </aside>
  );
}

export default AetherisInstructor;
