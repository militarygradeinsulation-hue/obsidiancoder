import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { IntrosShell, Page } from "@/components/intros/shell";
import { InitialsAvatar, Panel, Creed, StatLine, IconLine } from "@/components/intros/primitives";
import { NetworkMap } from "@/components/intros/network-map";
import {
  locations,
  industries,
  roles,
  joinedThisWeek,
  relationshipPatterns,
} from "@/lib/intros-data";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/intros/insights")({
  head: () => ({ meta: [{ title: "Aetheris Intros — Insights" }] }),
  component: InsightsPage,
});

const TABS = {
  "Top locations": locations,
  "Top industries": industries,
  "Top roles": roles,
} as const;

function InsightsPage() {
  const [tab, setTab] = useState<keyof typeof TABS>("Top locations");
  const rows = TABS[tab];
  const max = Math.max(...rows.map((r) => r.n));

  return (
    <IntrosShell>
      <Page>
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <h1 className="max-w-[11ch] font-serif text-4xl font-semibold leading-tight">
                A global network of possibility
              </h1>
              <Creed
                lines={[
                  "People",
                  "Ideas",
                  "Capital",
                  "Infrastructure",
                  "A more",
                  "connected",
                  "tomorrow.",
                ]}
              />
            </div>

            <Panel className="p-0 overflow-hidden">
              <NetworkMap height={330} />
            </Panel>

            <StatLine
              stats={[
                { n: "10K+", l: "Professionals" },
                { n: "312", l: "Companies" },
                { n: "28", l: "Countries" },
                { n: "92%", l: "Relevant matches" },
              ]}
            />

            <Panel>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold">Network insights</h3>
                <select
                  className="h-8 w-32 rounded-md border border-border bg-white/5 px-2 text-xs"
                  aria-label="Scope"
                >
                  <option>Global</option>
                  <option>My network</option>
                </select>
              </div>
              <div className="mb-3.5 flex gap-1 overflow-x-auto">
                {Object.keys(TABS).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t as keyof typeof TABS)}
                    className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] transition ${
                      tab === t
                        ? "bg-white/8 text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2.5">
                {rows.map((r) => (
                  <div
                    key={r.city}
                    className="grid grid-cols-[120px_1fr_40px] items-center gap-3 text-[12.5px]"
                  >
                    <span className="truncate">{r.city}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-white/8">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${(r.n / max) * 100}%` }}
                      />
                    </span>
                    <span className="text-right font-serif">{r.n}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="flex flex-col gap-4">
            <Panel title="People on Aetheris" action="View all">
              {joinedThisWeek.map((p) => (
                <div
                  key={p.name}
                  className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0"
                >
                  <InitialsAvatar name={p.name} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium">{p.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{p.role}</div>
                  </div>
                  <span className="flex flex-none items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Joined this week
                  </span>
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

            <div className="glass-panel p-5 text-center">
              <p className="font-serif text-lg leading-snug">
                "The best opportunities come from the right people."
              </p>
              <p className="mt-3 text-[11px] text-muted-foreground">— Aetheris member</p>
            </div>

            <div className="py-2 text-center">
              <p className="text-[11px] text-muted-foreground/60">
                The intelligence layer
                <br />
                for meaningful connections
              </p>
              <Link
                to="/intros/people"
                className="mt-3 inline-block text-[12px] text-primary hover:opacity-80 transition"
              >
                Explore people →
              </Link>
            </div>
          </div>
        </div>
      </Page>
    </IntrosShell>
  );
}
