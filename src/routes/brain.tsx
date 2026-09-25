import * as React from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ObsidianModeNav } from "@/components/ObsidianModeNav";
import { brainSnapshot, resolveBrainLibraryCode, type BrainSnapshot } from "@/lib/obsidian-brain";
import { getAccountCode } from "@/lib/account-code";

export const Route = createFileRoute("/brain")({
  beforeLoad: async () => {
    const { ensureUnlocked } = await import("@/lib/gate.functions");
    const { unlocked } = await ensureUnlocked();
    if (!unlocked) throw redirect({ to: "/unlock" });
  },
  head: () => ({
    meta: [
      { title: "Obsidian Brain — what your builds have taught Obsidian" },
      { name: "description", content: "The shared memory behind Pocket, Studio and Agent: proven patterns, design DNA, reusable components and quality signals from your real builds." },
      { property: "og:title", content: "Obsidian Brain — shared build intelligence" },
      { property: "og:description", content: "See exactly what Obsidian has learned from your builds and what it will reuse next." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BrainPage,
});

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="obs-empty">{children}</p>;
}

function BrainPage() {
  const [snap, setSnap] = React.useState<BrainSnapshot | null>(null);
  React.useEffect(() => {
    setSnap(brainSnapshot(resolveBrainLibraryCode(getAccountCode())));
  }, []);

  return (
    <div className="obs-page">
      <header className="obs-page-top">
        <span className="obs-display text-2xl" style={{ color: "var(--obs-orange)" }}>Obsidian</span>
        <ObsidianModeNav showProject />
      </header>
      <main className="obs-page-wrap">
        <p className="obs-kicker">Brain · shared by every mode</p>
        <h1 className="obs-display mt-2 text-5xl sm:text-7xl">The intelligence map</h1>
        <p className="mt-3 max-w-2xl text-sm opacity-70">
          Everything here comes from your real builds on this device. Nothing is estimated — empty areas mean Obsidian hasn't learned it yet.
        </p>
        {!snap ? (
          <p className="mt-10 obs-empty">Reading memory…</p>
        ) : (
          <BrainMap snap={snap} />
        )}
      </main>
    </div>
  );
}

function BrainMap({ snap }: { snap: BrainSnapshot }) {
  const L = snap.learning;
  return (
    <div className="mt-10 grid gap-4 lg:grid-cols-3">
      {/* Core: next build */}
      <section className="obs-node lg:col-span-3" data-live={snap.nextBuild.family ? "true" : "false"}>
        <h3>Next similar build <span className="obs-pill" data-tone={snap.nextBuild.family ? "good" : "muted"}>{snap.nextBuild.family ? "Brain hit ready" : "Novel path"}</span></h3>
        <ul className="space-y-1 text-sm">
          {snap.nextBuild.reasons.map((r) => <li key={r}>→ {r}</li>)}
        </ul>
      </section>

      <section className="obs-node" data-live={snap.project ? "true" : "false"}>
        <h3>Current project</h3>
        {snap.project ? (
          <div className="text-sm space-y-1">
            <div className="text-base font-semibold">{snap.project.title}</div>
            <div className="opacity-60">Last opened in {snap.project.surface === "pocket" ? "Pocket" : "Studio"} · {snap.project.cloudId ? "saved to cloud" : "local only"}</div>
            {snap.memoryText ? <pre className="mt-2 whitespace-pre-wrap text-xs opacity-80">{snap.memoryText}</pre> : <Empty>No project memory recorded yet.</Empty>}
          </div>
        ) : <Empty>No project opened yet. Start one in Pocket or Studio.</Empty>}
      </section>

      <section className="obs-node" data-live={L.total > 0 ? "true" : "false"}>
        <h3>Build outcomes <span className="opacity-60">{L.total}</span></h3>
        {L.total ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><div className="obs-display text-3xl" style={{ color: "var(--obs-orange)" }}>{L.kept}</div><div className="text-[11px] opacity-60">kept</div></div>
            <div><div className="obs-display text-3xl">{L.restored}</div><div className="text-[11px] opacity-60">restored</div></div>
            <div><div className="obs-display text-3xl opacity-70">{L.discarded}</div><div className="text-[11px] opacity-60">discarded</div></div>
          </div>
        ) : <Empty>No graded builds yet — each finished build is scored and recorded here.</Empty>}
      </section>

      <section className="obs-node" data-live={snap.archive.total > 0 ? "true" : "false"}>
        <h3>Archive <Link to="/archive" className="text-[11px] normal-case" style={{ color: "var(--obs-orange)" }}>open →</Link></h3>
        {snap.archive.total ? (
          <div className="text-sm">{snap.archive.total} builds · {Object.entries(snap.archive.bySurface).map(([k, v]) => `${v} ${k}`).join(" · ")}</div>
        ) : <Empty>Archive is empty on this device.</Empty>}
      </section>

      <section className="obs-node lg:col-span-2" data-live={L.families.length > 0 ? "true" : "false"}>
        <h3>Design DNA · style families</h3>
        {L.families.length ? (
          <div className="space-y-2">
            {L.families.map((f) => (
              <div key={f.family}>
                <div className="flex justify-between text-sm">
                  <span>{f.family} {f.proven && <span className="obs-pill ml-1" data-tone="good">proven</span>}{snap.learning.preferredFamily === f.family && <span className="obs-pill ml-1">preferred</span>}</span>
                  <span className="opacity-60">{f.n} builds · avg {f.avgScore} · {Math.round(f.keepRate * 100)}% kept</span>
                </div>
                <div className="obs-bar mt-1"><i style={{ width: `${f.avgScore}%` }} /></div>
              </div>
            ))}
          </div>
        ) : <Empty>No style family has been scored yet.</Empty>}
      </section>

      <section className="obs-node" data-live={snap.components.length > 0 ? "true" : "false"}>
        <h3>Reusable components</h3>
        {snap.components.length ? (
          <div className="flex flex-wrap gap-1.5">
            {snap.components.map((c) => <span key={c.kind} className="obs-pill">{c.kind} ×{c.count}</span>)}
          </div>
        ) : <Empty>No components stored yet — they are extracted from finished Studio builds.</Empty>}
      </section>

      <section className="obs-node lg:col-span-2" data-live={L.recent.length > 0 ? "true" : "false"}>
        <h3>Recent learning signals</h3>
        {L.recent.length ? (
          <ul className="divide-y divide-white/5 text-sm">
            {L.recent.map((r) => (
              <li key={r.at} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">{new Date(r.at).toLocaleDateString()} · {r.surface} · {r.family} · <span className="opacity-60">{r.model}</span></span>
                <span className="flex items-center gap-2"><span className="obs-pill" data-tone={r.outcome === "kept" ? "good" : "muted"}>{r.outcome}</span><b>{r.score}</b></span>
              </li>
            ))}
          </ul>
        ) : <Empty>No build outcomes recorded yet.</Empty>}
      </section>

      <section className="obs-node" data-live={L.lowQuality.length > 0 ? "true" : "false"}>
        <h3>Avoid · low-quality learnings</h3>
        {L.lowQuality.length ? (
          <ul className="space-y-2 text-sm">
            {L.lowQuality.map((l, i) => (
              <li key={i}><b>{l.score}</b> · {l.family} · <span className="opacity-60">{l.model}</span>{l.issues.length > 0 && <div className="text-xs opacity-60">{l.issues.join("; ")}</div>}</li>
            ))}
          </ul>
        ) : <Empty>No low-scoring builds recorded.</Empty>}
      </section>

      <section className="obs-node" data-live={snap.creative.length > 0 ? "true" : "false"}>
        <h3>Creative memory</h3>
        {snap.creative.length ? (
          <p className="text-sm">{snap.creative.length} recent structural signatures — used to avoid repeating the same layout.</p>
        ) : <Empty>No creative signatures yet.</Empty>}
      </section>

      <section className="obs-node lg:col-span-2" data-live={snap.preferences.applied.length > 0 ? "true" : "false"}>
        <h3>Learned preferences <span className="opacity-60">{snap.preferences.observed} observed</span></h3>
        {snap.preferences.applied.length ? (
          <div className="flex flex-wrap gap-1.5">{snap.preferences.applied.map((p) => <span key={p.id} className="obs-pill" data-tone="good">{p.key}: {p.value}</span>)}</div>
        ) : <Empty>No preference has been confirmed 3+ times yet, so none are applied.</Empty>}
      </section>
    </div>
  );
}
