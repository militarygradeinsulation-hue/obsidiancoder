import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MapPin, Search, Sparkles, UserPlus } from "lucide-react";
import { IntrosShell, Page } from "@/components/intros/shell";
import { IntrosLanding, IntrosLoading } from "@/components/intros/landing";
import { InitialsAvatar, Panel, Tag, EmptyState } from "@/components/intros/primitives";
import { people } from "@/lib/intros-data";
import { useIntrosMode } from "@/lib/use-intros-mode";

export const Route = createFileRoute("/intros/people")({
  head: () => ({ meta: [{ title: "Aetheris Intros — People" }] }),
  component: PeoplePage,
});

const FILTERS = ["All", "Founders", "Investors", "Operators", "Advisors"] as const;

function PeoplePage() {
  const { mode, enterDemo } = useIntrosMode();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const shown = useMemo(() => {
    return people.filter((p) => {
      if (query && !`${p.name} ${p.company} ${p.role}`.toLowerCase().includes(query.toLowerCase()))
        return false;
      if (filter === "All") return true;
      return p.category === filter;
    });
  }, [query, filter]);

  if (mode === "loading") return <IntrosLoading />;
  if (mode === null) return <IntrosLanding onDemo={enterDemo} />;

  if (mode === "live") {
    return (
      <IntrosShell>
        <Page>
          <EmptyState
            icon={<UserPlus className="h-7 w-7 text-muted-foreground" />}
            title="No one in your directory yet"
            description="As you connect with people on Aetheris, they'll show up here."
            action={
              <Link
                to="/intros/preferences"
                className="mt-2 rounded-full bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition"
              >
                Set your intro preferences
              </Link>
            }
          />
        </Page>
      </IntrosShell>
    );
  }

  return (
    <IntrosShell>
      <Page>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Directory
            </p>
            <h1 className="font-serif text-3xl font-semibold">People worth meeting</h1>
          </div>
          <label className="flex h-10 items-center gap-2 rounded-full border border-border bg-white/5 px-4 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, role, or company..."
              aria-label="Search people"
              className="w-64 bg-transparent outline-none placeholder:text-muted-foreground/60"
            />
          </label>
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12.5px] transition ${
                filter === f
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <Panel key={p.id} className="flex flex-col">
              <div className="flex items-start gap-3">
                <InitialsAvatar name={p.name} size={44} square />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold">{p.name}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {p.role}, {p.company}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/70">
                    <MapPin className="h-3 w-3" /> {p.location}
                  </div>
                </div>
                <span className="flex flex-none items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10.5px] text-primary">
                  <Sparkles className="h-3 w-3" /> {p.fit}%
                </span>
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-foreground/80">{p.note}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.tags.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between pt-4 text-[11px] text-muted-foreground">
                <span>
                  {p.fitLabel} · {p.mutuals} mutuals
                </span>
                <button className="rounded-full border border-border px-3 py-1.5 text-[11.5px] text-foreground hover:bg-white/5 transition">
                  Connect
                </button>
              </div>
            </Panel>
          ))}
          {shown.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              No one matches that search yet.
            </p>
          )}
        </div>
      </Page>
    </IntrosShell>
  );
}
