import * as React from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ObsidianModeNav } from "@/components/ObsidianModeNav";
import { brainSnapshot, resolveBrainLibraryCode, type BrainSnapshot } from "@/lib/obsidian-brain";
import { getAccountCode } from "@/lib/account-code";
import { useAuth } from "@/hooks/useSubscription";
import { cachedBrainRecords, createBrainRecord, queueBrainRecord, removeBrainRecord, syncBrainRecords, validatedCloudLearnings, type BrainRecord } from "@/lib/brain-cloud";

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
  const { userId, loading } = useAuth();
  const [snap, setSnap] = React.useState<BrainSnapshot | null>(null);
  const [records, setRecords] = React.useState<BrainRecord[]>([]);
  const [syncState, setSyncState] = React.useState("Local only");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [kind, setKind] = React.useState<"note" | "fact" | "decision">("note");
  const [busy, setBusy] = React.useState(false);
  const libraryCode = React.useMemo(() => typeof window === "undefined" ? "" : resolveBrainLibraryCode(getAccountCode()), []);
  const projectKey = snap?.project?.cloudId ?? "global";
  const refresh = React.useCallback((items: BrainRecord[]) => {
    setRecords(items);
    setSnap(brainSnapshot(libraryCode, null, validatedCloudLearnings(items)));
  }, [libraryCode]);

  const sync = React.useCallback(async () => {
    if (!userId) return;
    setSyncState("Synchronizing...");
    try {
      const merged = await syncBrainRecords(userId, libraryCode);
      refresh(merged);
      setSyncState("Synced across devices");
    } catch {
      setSyncState("Offline or cloud unavailable. Changes remain on this device.");
    }
  }, [userId, libraryCode, refresh]);

  React.useEffect(() => {
    if (!userId) {
      setRecords([]);
      setSnap(brainSnapshot(libraryCode));
      setSyncState(loading ? "Checking sign-in..." : "Sign in for cross-device sync");
      return;
    }
    refresh(cachedBrainRecords(userId));
    void sync();
    const onFocus = () => void sync();
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => void sync(), 60000);
    return () => { window.removeEventListener("focus", onFocus); window.clearInterval(interval); };
  }, [userId, loading, libraryCode, refresh, sync]);

  function saveRecord() {
    if (!userId || !title.trim() || !body.trim()) return;
    const next = queueBrainRecord(userId, createBrainRecord(projectKey, kind, title, body));
    refresh(next);
    setTitle(""); setBody("");
    void sync();
  }
  function deleteRecord(record: BrainRecord) {
    if (!userId) return;
    refresh(queueBrainRecord(userId, removeBrainRecord(record)));
    void sync();
  }
  const visible = records.filter((r) => r.kind !== "learning" && !r.deleted_at &&
    (r.project_key === projectKey || r.project_key === "global"));
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
          Brain learns from real builds. Sign in to sync notes, project decisions and scored outcomes across your devices.
          The existing local memory remains available when offline.
        </p>
        <section className="obs-node mt-6" aria-label="Brain sync and project knowledge">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3>Cloud continuity</h3><p className="mt-1 text-xs opacity-70" role="status">{syncState}</p></div>
            <button className="obs-btn-ghost" type="button" disabled={!userId || busy} onClick={() => { setBusy(true); void sync().finally(() => setBusy(false)); }}>Sync now</button>
          </div>
          {!userId ? (
            <p className="mt-3 text-sm">Cloud sync needs an authenticated account. Local learning still works.</p>
          ) : (
            <>
              <div className="mt-5 grid gap-3">
                <label className="text-sm">Knowledge type
                  <select className="obs-textarea mt-1" value={kind} onChange={(e) => setKind(e.target.value as "note" | "fact" | "decision")}>
                    <option value="note">Note</option><option value="fact">Project fact</option><option value="decision">Decision</option>
                  </select>
                </label>
                <label className="text-sm">Title
                  <input className="obs-textarea mt-1" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What should Brain remember?" />
                </label>
                <label className="text-sm">Context
                  <textarea className="obs-textarea mt-1" maxLength={4000} rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Context, rationale and what to keep in mind" />
                </label>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs opacity-60">Scope: {snap?.project?.cloudId ? snap.project.title : "Account-wide"} · project notes need a saved cloud project.</span>
                  <button type="button" className="obs-btn-primary" disabled={!title.trim() || !body.trim()} onClick={saveRecord}>Save to Brain</button>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                <h3>Remembered knowledge ({visible.length})</h3>
                {visible.length === 0 ? <Empty>Nothing saved yet for this project.</Empty> : visible.slice(0, 40).map((r) => (
                  <article key={r.record_id} className="rounded-lg border border-white/10 p-3">
                    <div className="flex items-start justify-between gap-2"><div><strong className="text-sm">{r.title}</strong><span className="ml-2 text-xs opacity-60">{r.kind} · {new Date(r.updated_at).toLocaleDateString()}</span></div>
                      <button type="button" className="obs-btn-ghost" onClick={() => deleteRecord(r)} aria-label={`Delete ${r.title}`}>Delete</button></div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm opacity-75">{r.body}</p>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
        {!snap ? <p className="mt-10 obs-empty">Reading memory…</p> : <BrainMap snap={snap} />}
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
