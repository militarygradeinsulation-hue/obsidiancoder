import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Sparkles } from "lucide-react";
import { IntrosShell, Page } from "@/components/intros/shell";
import { InitialsAvatar, Panel } from "@/components/intros/primitives";
import { connectors, introRequests, people } from "@/lib/intros-data";

export const Route = createFileRoute("/intros/requests")({
  head: () => ({ meta: [{ title: "Aetheris Intros — Introductions" }] }),
  component: RequestsPage,
});

function RequestsPage() {
  const [target, setTarget] = useState<string>(people[0].id);
  const [via, setVia] = useState<string>(connectors[0].name);
  const [note, setNote] = useState("");

  return (
    <IntrosShell>
      <Page>
        <div className="mb-5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Introductions
          </p>
          <h1 className="font-serif text-3xl font-semibold">Requests</h1>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <Panel title={`Active introduction requests (${introRequests.length})`} action="View all">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {introRequests.map((r) => (
                <div key={r.from} className="flex gap-3 rounded-md border border-border/70 p-3">
                  <InitialsAvatar name={r.from} size={40} square live />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12.5px] font-semibold">{r.from}</span>
                      <span className="flex-none text-[10.5px] text-muted-foreground">
                        {r.date}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{r.role}</div>
                    <p className="mt-1.5 text-[11.5px] text-muted-foreground/90">
                      wants to be introduced to{" "}
                      <span className="font-medium text-foreground">{r.target}</span>
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      <button className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90 transition">
                        Review
                      </button>
                      <button className="rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-white/5 transition">
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="glass-panel flex flex-col items-center justify-center p-5 text-center">
            <p className="font-serif text-lg leading-snug">
              "The right people turn conversations into compound opportunity."
            </p>
            <div className="mt-4 h-px w-11 bg-border" />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
          <Panel title="Request a new introduction">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="text-[12px]">
                <span className="mb-1.5 block text-muted-foreground">
                  Who would you like to meet?
                </span>
                <select
                  className="h-9 w-full rounded-md border border-border bg-white/5 px-2.5 text-[13px]"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.company}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[12px]">
                <span className="mb-1.5 block text-muted-foreground">Request through</span>
                <select
                  className="h-9 w-full rounded-md border border-border bg-white/5 px-2.5 text-[13px]"
                  value={via}
                  onChange={(e) => setVia(e.target.value)}
                >
                  {connectors.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} — {c.company}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-3.5 block text-[12px]">
              <span className="mb-1.5 block text-muted-foreground">
                Add context for your connector
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why would this introduction be valuable? What should they know going in?"
                className="h-24 w-full resize-none rounded-md border border-border bg-white/5 p-3 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
              />
            </label>
            <button className="mt-3.5 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:opacity-90 transition">
              <Mail className="h-[15px] w-[15px]" /> Send request
            </button>
          </Panel>

          <Panel>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-[17px] w-[17px] text-primary" />
              <h3 className="text-[13px] font-semibold">AI introduction brief</h3>
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                Beta
              </span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              Get a brief with key context, alignment points, and suggested discussion areas before
              the connector reaches out on your behalf.
            </p>
            <button className="mt-3 w-full rounded-md border border-border py-2 text-[13px] hover:bg-white/5 transition">
              View brief
            </button>
          </Panel>
        </div>
      </Page>
    </IntrosShell>
  );
}
