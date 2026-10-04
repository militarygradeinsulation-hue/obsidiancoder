import { createFileRoute, Link } from "@tanstack/react-router";
import { Database, MessageCircle, Sparkles } from "lucide-react";
import { IntrosShell, Page } from "@/components/intros/shell";
import { IntrosLanding, IntrosLoading } from "@/components/intros/landing";
import {
  InitialsAvatar,
  Panel,
  Plate,
  Creed,
  StatLine,
  IconLine,
  EmptyState,
} from "@/components/intros/primitives";
import { NetworkMap } from "@/components/intros/network-map";
import {
  rememberedConversations,
  peopleInMemory,
  learned,
  newlyLearnedNeeds,
  reconnect,
  cooling,
  contextualConnections,
  relationshipPatterns,
} from "@/lib/intros-data";
import { useIntrosMode } from "@/lib/use-intros-mode";

export const Route = createFileRoute("/intros/memory")({
  head: () => ({ meta: [{ title: "Aetheris Intros — Memory" }] }),
  component: MemoryPage,
});

const FILTERS = [
  { label: "Relationship strength", options: ["All strengths", "Strong", "Warm", "Cooling"] },
  { label: "Last interaction", options: ["Any time", "Past week", "Past month", "Past year"] },
  { label: "People", options: ["All people", "Founders", "Investors", "Operators"] },
  { label: "Companies", options: ["All companies", "Portfolio", "Prospective"] },
  { label: "Topics", options: ["All topics", "Climate tech", "AI infrastructure", "Fundraising"] },
  { label: "Privacy", options: ["My memory only", "Shared with team", "Everything"] },
];

function MemoryPage() {
  const { mode, enterDemo } = useIntrosMode();

  if (mode === "loading") return <IntrosLoading />;
  if (mode === null) return <IntrosLanding onDemo={enterDemo} />;

  if (mode === "live") {
    return (
      <IntrosShell>
        <Page>
          <EmptyState
            icon={<Database className="h-7 w-7 text-muted-foreground" />}
            title="Nothing remembered yet"
            description="As you talk with people on Aetheris, context from your conversations will be remembered here."
          />
        </Page>
      </IntrosShell>
    );
  }

  return (
    <IntrosShell>
      {/* hero */}
      <section className="border-b border-border/60 px-6 py-12">
        <div className="mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              People create possibilities
            </p>
            <h1 className="mt-3 font-serif text-5xl font-semibold leading-[1.05]">
              Memory that keeps
              <br />
              relationships
              <br />
              <span className="text-primary">alive.</span>
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              A professional memory for builders, backed by real people, real context, and real
              intent.
            </p>
            <div className="mt-5 flex gap-2.5">
              <Link
                to="/intros/people"
                className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition"
              >
                Your network remembers
              </Link>
              <button className="rounded-full border border-border px-5 py-2.5 text-[13px] hover:bg-white/5 transition">
                See how it works
              </button>
            </div>
            <div className="mt-8 grid grid-cols-3 gap-4 border-t border-border pt-4">
              <div>
                <div className="font-serif text-2xl font-semibold">4,892</div>
                <div className="text-[11px] text-muted-foreground">Conversations remembered</div>
              </div>
              <div>
                <div className="font-serif text-2xl font-semibold">1,246</div>
                <div className="text-[11px] text-muted-foreground">People in memory</div>
              </div>
              <div>
                <div className="font-serif text-2xl font-semibold">3,281</div>
                <div className="text-[11px] text-muted-foreground">Contextual connections</div>
              </div>
            </div>
          </div>

          <div className="relative">
            <Plate className="h-full min-h-[280px] p-6">
              <p className="font-serif text-lg leading-snug text-foreground/90">
                "Intros remembers the context people normally lose between conversations."
              </p>
              <div className="my-4 h-px w-12 bg-border" />
              <Creed
                lines={[
                  "Not just what people said.",
                  "But what they care about.",
                  "What they're building.",
                  "And where things left off.",
                ]}
              />
            </Plate>
          </div>
        </div>
      </section>

      <Page>
        {/* network memory + filters */}
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Panel title="Your network's memory" action="kebab">
            <div className="mb-1">
              <NetworkMap height={220} />
            </div>
            <StatLine
              stats={[
                { n: "4,892", l: "Conversations" },
                { n: "1,246", l: "People" },
                { n: "3,281", l: "Connections" },
                { n: "92%", l: "Relevant context" },
              ]}
            />
          </Panel>

          <Panel title="Filters">
            <div className="flex flex-col gap-2.5">
              {FILTERS.map((f) => (
                <label key={f.label} className="text-[12px]">
                  <span className="mb-1 block text-muted-foreground">{f.label}</span>
                  <select className="h-9 w-full rounded-md border border-border bg-white/5 px-2.5 text-[13px]">
                    {f.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button className="mt-3.5 w-full rounded-md bg-primary py-2 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition">
              Apply filters
            </button>
          </Panel>
        </div>

        {/* remembered + people */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
          <Panel>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-[13px] font-semibold">Remembered conversations</h3>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {rememberedConversations.map((c) => (
                <article
                  key={c.name}
                  className="grid gap-3 rounded-md border border-border/70 p-3 sm:grid-cols-[auto_1fr_auto]"
                >
                  <InitialsAvatar name={c.name} size={40} square />
                  <div>
                    <div className="text-[13.5px] font-semibold">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">{c.role}</div>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                      {c.summary}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10.5px] text-muted-foreground/80">
                      <span>{c.date}</span>
                      {c.topics.map((t) => (
                        <span key={t}>· {t}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <button className="rounded-md bg-primary px-3 py-1.5 text-[11.5px] font-medium text-primary-foreground hover:opacity-90 transition">
                      View memory
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel title="People in memory" action="View all">
              {peopleInMemory.map((p) => (
                <div
                  key={p.name}
                  className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0"
                >
                  <InitialsAvatar name={p.name} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium">{p.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{p.role}</div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-[12px] text-primary">
                      <Sparkles className="h-3 w-3" />
                      {p.score}%
                    </div>
                    <div className="text-[10.5px] text-muted-foreground">Strong match</div>
                  </div>
                </div>
              ))}
            </Panel>

            <Panel title="Relationship patterns" action="View all">
              {relationshipPatterns.map((r) => (
                <IconLine key={r.text} icon={<Sparkles className="mt-0.5 h-4 w-4 text-primary" />}>
                  {r.text}
                </IconLine>
              ))}
            </Panel>
          </div>
        </div>

        {/* learned recently */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr_1fr]">
          <Panel title="What Intros learned recently" action="View all">
            {learned.map((l) => (
              <div
                key={l.name + l.text}
                className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0"
              >
                <InitialsAvatar name={l.name} size={38} square />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] leading-snug">
                    <span className="font-semibold">{l.name}</span>{" "}
                    <span className="text-muted-foreground">{l.text}</span>
                  </p>
                  <div className="mt-1 text-[10.5px] text-muted-foreground">From: {l.src}</div>
                </div>
                <div className="hidden flex-none text-right sm:block">
                  <div className="text-[12px]">{l.confidence}%</div>
                  <div className="text-[10px] text-muted-foreground">Confidence</div>
                </div>
                <div className="hidden flex-none text-right sm:block">
                  <div className="text-[12px]">{l.privacy}</div>
                  <div className="text-[10px] text-muted-foreground">{l.scope}</div>
                </div>
                <div className="flex-none text-right text-[10.5px] text-muted-foreground">
                  {l.ago}
                </div>
              </div>
            ))}
          </Panel>

          <Panel title="Newly learned needs" action="View all">
            {newlyLearnedNeeds.map((n) => (
              <IconLine key={n.text} icon={<Sparkles className="mt-0.5 h-4 w-4 text-primary" />}>
                {n.text}
              </IconLine>
            ))}
            <div className="my-2.5 h-px bg-border" />
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Needs are drawn from conversations you had. Nothing is shared until you choose to act
              on it.
            </p>
          </Panel>

          <Panel title="Contextual connections" action="View all">
            <p className="mb-2 text-[12px] text-muted-foreground">
              People who share similar interests or have complementary expertise.
            </p>
            {contextualConnections.map((c) => (
              <div
                key={c.name}
                className="flex items-center gap-2.5 border-b border-border/60 py-2 last:border-0"
              >
                <InitialsAvatar name={c.name} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">{c.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{c.role}</div>
                </div>
                <span className="flex-none rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10.5px] text-primary">
                  {c.score}% match
                </span>
              </div>
            ))}
          </Panel>
        </div>

        {/* reconnect / cooling */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Panel title="Reconnect opportunities" action="View all">
            {reconnect.map((r) => (
              <div
                key={r.name}
                className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0"
              >
                <InitialsAvatar name={r.name} size={36} square />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">{r.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{r.last}</div>
                  <div className="truncate text-[11px] text-muted-foreground/70">{r.note}</div>
                </div>
                <button className="flex-none rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90 transition">
                  Reconnect
                </button>
              </div>
            ))}
          </Panel>

          <Panel title="Cooling conversations" action="View all">
            {cooling.map((r) => (
              <div
                key={r.name}
                className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0"
              >
                <InitialsAvatar name={r.name} size={36} square />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">{r.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{r.last}</div>
                  <div className="truncate text-[11px] text-muted-foreground/70">{r.note}</div>
                </div>
                <button className="flex-none rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-white/5 transition">
                  Reengage
                </button>
              </div>
            ))}
          </Panel>
        </div>
      </Page>
    </IntrosShell>
  );
}
