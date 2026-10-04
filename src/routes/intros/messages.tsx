import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Calendar,
  Edit3,
  Link2,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  Smile,
  Sparkles,
  Star,
  Users,
  MoreHorizontal,
} from "lucide-react";
import { IntrosShell, Page } from "@/components/intros/shell";
import { IntrosLanding, IntrosLoading } from "@/components/intros/landing";
import { InitialsAvatar, Panel, Tag, EmptyState } from "@/components/intros/primitives";
import { introRequests, threadDetails, threads } from "@/lib/intros-data";
import { useIntrosMode } from "@/lib/use-intros-mode";

export const Route = createFileRoute("/intros/messages")({
  head: () => ({ meta: [{ title: "Aetheris Intros — Messages" }] }),
  component: MessagesPage,
});

const FILTERS = ["All", "Unread", "Introductions", "Starred"] as const;

function MessagesPage() {
  const { mode, enterDemo } = useIntrosMode();
  const [active, setActive] = useState(threads[0].id);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [draft, setDraft] = useState("");
  const [starred, setStarred] = useState<Set<number>>(
    () => new Set(threads.filter((t) => t.starred).map((t) => t.id)),
  );

  if (mode === "loading") return <IntrosLoading />;
  if (mode === null) return <IntrosLanding onDemo={enterDemo} />;

  if (mode === "live") {
    return (
      <IntrosShell>
        <Page>
          <EmptyState
            icon={<MessageCircle className="h-7 w-7 text-muted-foreground" />}
            title="No messages yet"
            description="Conversations with people you connect with on Aetheris will show up here."
          />
        </Page>
      </IntrosShell>
    );
  }

  const isStarred = (id: number) => starred.has(id);
  const toggleStarred = (id: number) =>
    setStarred((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const shown = threads.filter((t) => {
    if (filter === "Unread") return t.unread;
    if (filter === "Introductions") return t.badge;
    if (filter === "Starred") return isStarred(t.id);
    return true;
  });

  const activeThread = threads.find((t) => t.id === active) ?? threads[0];
  const detail = threadDetails[activeThread.id];

  return (
    <IntrosShell>
      <Page>
        {/* intro request band */}
        <div className="mb-3.5 grid gap-4 lg:grid-cols-[1fr_300px]">
          <Panel>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">
                Active introduction requests ({introRequests.length})
              </h3>
              <button className="text-[11px] font-medium uppercase tracking-wider text-primary hover:opacity-80 transition">
                View all
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {introRequests.map((r) => (
                <div key={r.from} className="flex gap-2.5 rounded-md border border-border/70 p-2.5">
                  <InitialsAvatar name={r.from} size={40} square live />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-[12px] font-semibold">{r.from}</span>
                      <span className="flex-none text-[10px] text-muted-foreground">{r.date}</span>
                    </div>
                    <div className="text-[10.5px] text-muted-foreground">{r.role}</div>
                    <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground/90">
                      wants to meet <span className="font-medium text-foreground">{r.target}</span>
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <button className="rounded-md bg-primary px-2 py-0.5 text-[10.5px] font-medium text-primary-foreground">
                        Review
                      </button>
                      <button className="rounded-md border border-border px-2 py-0.5 text-[10.5px]">
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="glass-panel flex flex-col items-center justify-center p-4 text-center">
            <p className="font-serif text-[15px] leading-snug">
              "The right people turn conversations into compound opportunity."
            </p>
            <div className="mt-3 h-px w-11 bg-border" />
          </div>
        </div>

        {/* messenger */}
        <div className="grid gap-3.5 lg:grid-cols-[280px_1fr_300px]" style={{ minHeight: 560 }}>
          {/* thread list */}
          <div className="glass-panel flex flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between px-3.5 pb-2.5 pt-3.5">
              <h3 className="text-[13px] font-semibold">Messages</h3>
              <button
                aria-label="New message"
                className="rounded-full border border-border p-1.5 hover:bg-white/5 transition"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex gap-3.5 px-3.5 pb-2.5 text-[12px]">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`pb-0.5 transition ${filter === f ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <label className="mx-3.5 mb-2.5 flex h-8 items-center gap-2 rounded-md border border-border bg-white/5 px-2.5 text-xs text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              <input
                placeholder="Search conversations..."
                aria-label="Search conversations"
                className="w-full bg-transparent outline-none"
              />
            </label>
            <div className="flex-1 overflow-y-auto px-1.5 pb-2">
              {shown.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition ${active === t.id ? "bg-white/8" : "hover:bg-white/5"}`}
                >
                  {t.unread ? (
                    <span className="h-1.5 w-1.5 flex-none rounded-full bg-primary" />
                  ) : (
                    <span className="w-1.5 flex-none" />
                  )}
                  <InitialsAvatar name={t.name} size={38} live={t.live} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-1">
                      <span className="truncate text-[12.5px] font-medium">{t.name}</span>
                      <span className="flex-none text-[10.5px] text-muted-foreground">
                        {t.time}
                      </span>
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {t.preview}
                    </span>
                    {t.badge && <Tag blue>{t.badge}</Tag>}
                  </span>
                </button>
              ))}
              {shown.length === 0 && (
                <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  No conversations here yet.
                </p>
              )}
            </div>
          </div>

          {/* chat */}
          <div className="glass-panel flex flex-col overflow-hidden p-0">
            <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
              <InitialsAvatar name={activeThread.name} size={42} live={activeThread.live} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] font-semibold">{activeThread.name}</span>
                  {activeThread.live && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                </div>
                <div className="text-[11px] text-muted-foreground">{detail.role}</div>
                <div className="mt-1.5 flex gap-1.5">
                  {detail.tags.map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </div>
              </div>
              <button
                aria-label={isStarred(activeThread.id) ? "Unstar" : "Star"}
                aria-pressed={isStarred(activeThread.id)}
                onClick={() => toggleStarred(activeThread.id)}
                className={`transition ${isStarred(activeThread.id) ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Star
                  className="h-[17px] w-[17px]"
                  fill={isStarred(activeThread.id) ? "currentColor" : "none"}
                />
              </button>
              <button
                aria-label="More"
                className="text-muted-foreground hover:text-foreground transition"
              >
                <MoreHorizontal className="h-[17px] w-[17px]" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {detail.conversation.map((m, i) => (
                <div
                  key={i}
                  className={`mb-3 flex gap-2.5 ${m.from === "me" ? "flex-row-reverse" : ""}`}
                >
                  <InitialsAvatar name={m.who} size={30} />
                  <div className={m.from === "me" ? "text-right" : ""}>
                    <div
                      className={`inline-block max-w-sm rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed ${
                        m.from === "me"
                          ? "bg-primary/15 text-foreground"
                          : "bg-white/6 text-foreground/90"
                      }`}
                    >
                      {m.text}
                    </div>
                    <div className="mt-1 text-[10.5px] text-muted-foreground">
                      {m.who} &nbsp;{m.time}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2.5">
              <button
                aria-label="Add"
                className="text-muted-foreground hover:text-foreground transition"
              >
                <Plus className="h-[19px] w-[19px]" />
              </button>
              <input
                placeholder={`Message ${activeThread.name}...`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Write a message"
                className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
              />
              <button
                aria-label="Attach"
                className="text-muted-foreground hover:text-foreground transition"
              >
                <Paperclip className="h-[17px] w-[17px]" />
              </button>
              <button
                aria-label="Emoji"
                className="text-muted-foreground hover:text-foreground transition"
              >
                <Smile className="h-[17px] w-[17px]" />
              </button>
              <button
                aria-label="Send"
                className="rounded-full bg-primary p-2 text-primary-foreground hover:opacity-90 transition"
              >
                <Send className="h-[15px] w-[15px]" />
              </button>
            </div>
          </div>

          {/* context rail */}
          <div className="flex flex-col gap-3.5 overflow-y-auto">
            <Panel title="Shared context" action="View more">
              {[
                { icon: Sparkles, k: "Shared interests", v: detail.sharedInterests },
                {
                  icon: Users,
                  k: "Shared connections",
                  v: detail.sharedConnections.map((c) => c.name).join(", "),
                },
                { icon: Link2, k: "Relevant topics", v: detail.relevantTopics },
              ].map((r) => (
                <div
                  key={r.k}
                  className="flex items-start gap-2.5 border-b border-border/60 py-2 last:border-0"
                >
                  <r.icon className="mt-0.5 h-4 w-4 flex-none text-primary" />
                  <div>
                    <div className="text-[12.5px]">{r.k}</div>
                    <div className="text-[11px] text-muted-foreground">{r.v}</div>
                  </div>
                </div>
              ))}
            </Panel>

            <Panel
              title={`Mutual connections (${detail.sharedConnections.length})`}
              action="View all"
            >
              {detail.sharedConnections.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center gap-2.5 border-b border-border/60 py-2 last:border-0"
                >
                  <InitialsAvatar name={c.name} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium">{c.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{c.role}</div>
                  </div>
                </div>
              ))}
            </Panel>

            <div className="grid grid-cols-2 gap-3.5">
              <Panel title="Current need">
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {detail.currentNeed}
                </p>
              </Panel>
              <Panel title="Commitments">
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {detail.commitments}
                </p>
              </Panel>
            </div>

            <Panel title="Suggested next step">
              <p className="mb-3 text-[12.5px] leading-relaxed text-muted-foreground">
                Schedule a 30-minute call to explore next steps with {activeThread.name}.
              </p>
              <button className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition">
                <Calendar className="h-[15px] w-[15px]" /> Schedule meeting
              </button>
            </Panel>
          </div>
        </div>
      </Page>
    </IntrosShell>
  );
}
