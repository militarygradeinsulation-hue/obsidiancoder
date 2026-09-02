import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, ExternalLink, Loader2, Search, Wand2, Home, Plus, Trash2, X } from "lucide-react";
import {
  listLibraryBuilds,
  setLibraryBuildPublic,
  verifyLibraryAdmin,
  type AdminBuildRow,
} from "@/lib/community-admin.functions";


type CommunityBuild = {
  id: string;
  title: string;
  prompt: string;
  model: string | null;
  created_at: string;
  published_at: string | null;
  share_slug: string | null;
  author_label: string | null;
  remix_count: number;
  byte_size: number;
};

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Community Library — Obsidian Vibe builds you can remix" },
      {
        name: "description",
        content:
          "Browse real apps, tools and landing pages built with Obsidian Pocket. Preview any build, copy its code, or remix it into your own project in one click.",
      },
      { property: "og:title", content: "Community Library — Obsidian Vibe" },
      {
        property: "og:description",
        content: "Preview, copy and remix real builds made with Obsidian Pocket.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LibraryPage,
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen bg-[#08090b] p-8 text-[#f2eee7]">
      <h1 className="text-xl font-semibold">Couldn't load the library</h1>
      <p className="mt-2 text-sm text-[#B6BCC8]">{error.message}</p>
      <button type="button" className="mt-4 rounded-md border border-white/15 px-3 py-1.5 text-sm" onClick={reset}>
        Try again
      </button>
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-[#f2eee7]">Not found</div>,
});

const card =
  "group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-xl transition hover:border-[#F4A125]/40";
const btn =
  "inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-[#B6BCC8] transition hover:border-[#F4A125]/40 hover:text-[#F4A125] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60 disabled:opacity-50";

// Live preview tile. Mounting 120 full-page iframes at once starves the
// browser and leaves every thumbnail blank, so each frame only mounts once
// its card scrolls near the viewport.
function PreviewTile({ src, title }: { src: string | null; title: string }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <div ref={ref} className="absolute inset-0">
      {src && visible ? (
        <iframe
          src={src}
          title={`Preview of ${title}`}
          loading="lazy"
          sandbox="allow-scripts"
          onLoad={() => setLoaded(true)}
          className="pointer-events-none h-[900px] w-[1440px] origin-top-left scale-[0.32] border-0"
        />
      ) : null}
      {(!src || !loaded) && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[radial-gradient(80%_60%_at_50%_0%,rgba(244,161,37,0.10),transparent_70%)] text-xs text-[#6b7180]">
          {src ? <Loader2 size={16} className="animate-spin text-[#F4A125]/70" /> : "No preview"}
        </div>
      )}
    </div>
  );
}


function LibraryPage() {
  const [builds, setBuilds] = React.useState<CommunityBuild[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // --- Admin backdoor (red dot -> code 9822) -------------------------------
  const [adminCode, setAdminCode] = React.useState<string | null>(null);
  const [codeOpen, setCodeOpen] = React.useState(false);
  const [codeInput, setCodeInput] = React.useState("");
  const [codeBusy, setCodeBusy] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [allBuilds, setAllBuilds] = React.useState<AdminBuildRow[]>([]);
  const [buildsTotal, setBuildsTotal] = React.useState(0);
  const [buildsCursor, setBuildsCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [adminBusy, setAdminBusy] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = React.useState(false);

  const toggleSelected = React.useCallback((id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);



  const load = React.useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/community?limit=120${query ? `&q=${encodeURIComponent(query)}` : ""}`);
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { builds: CommunityBuild[] };
      setBuilds(j.builds ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load builds");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load("");
  }, [load]);

  React.useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const copyCode = React.useCallback(async (b: CommunityBuild) => {
    setBusyId(b.id);
    try {
      const res = await fetch(`/api/public/community/${b.id}`);
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { html: string };
      await navigator.clipboard?.writeText(j.html);
      setNotice(`Copied the full code of “${b.title}”`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Copy failed");
    } finally {
      setBusyId(null);
    }
  }, []);

  const refreshAll = React.useCallback(async (code: string) => {
    const r = await listLibraryBuilds({ data: { adminCode: code } });
    if (r.ok) {
      setAllBuilds(r.builds);
      setBuildsTotal(r.total);
      setBuildsCursor(r.nextCursor);
    } else {
      setNotice(r.error);
    }
  }, []);

  // Fetches the next page of older builds and appends — this is what makes
  // everything past the first 200 reachable instead of silently cut off.
  const loadMoreBuilds = React.useCallback(async () => {
    if (!adminCode || !buildsCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await listLibraryBuilds({ data: { adminCode, before: buildsCursor } });
      if (r.ok) {
        setAllBuilds((prev) => [...prev, ...r.builds]);
        setBuildsTotal(r.total);
        setBuildsCursor(r.nextCursor);
      } else {
        setNotice(r.error);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [adminCode, buildsCursor, loadingMore]);

  const submitCode = React.useCallback(async () => {
    const code = codeInput.trim();
    if (!code) return;
    setCodeBusy(true);
    try {
      const r = await verifyLibraryAdmin({ data: { adminCode: code } });
      if (!r.ok) {
        setNotice("Wrong code");
        return;
      }
      setAdminCode(code);
      setCodeOpen(false);
      setCodeInput("");
      setManageOpen(true);
      await refreshAll(code);
      setNotice("Admin mode on");
    } finally {
      setCodeBusy(false);
    }
  }, [codeInput, refreshAll]);

  const togglePublic = React.useCallback(
    async (id: string, next: boolean) => {
      if (!adminCode) return;
      setAdminBusy(id);
      try {
        const r = await setLibraryBuildPublic({ data: { adminCode, id, is_public: next } });
        if (!r.ok) {
          setNotice(r.error);
          return;
        }
        setAllBuilds((prev) => prev.map((b) => (b.id === id ? { ...b, is_public: next } : b)));
        setNotice(next ? "Added to the library" : "Removed from the library");
        await load(q.trim());
      } finally {
        setAdminBusy(null);
      }
    },
    [adminCode, load, q],
  );

  const bulkSetPublic = React.useCallback(
    async (next: boolean) => {
      if (!adminCode || selected.length === 0) return;
      setBulkBusy(true);
      try {
        const ids = [...selected];
        let done = 0;
        for (const id of ids) {
          const r = await setLibraryBuildPublic({ data: { adminCode, id, is_public: next } });
          if (r.ok) done += 1;
        }
        setAllBuilds((prev) => prev.map((b) => (ids.includes(b.id) ? { ...b, is_public: next } : b)));
        setSelected([]);
        setNotice(`${next ? "Added" : "Removed"} ${done} build${done === 1 ? "" : "s"}`);
        await Promise.all([load(q.trim()), refreshAll(adminCode)]);
      } finally {
        setBulkBusy(false);
      }
    },
    [adminCode, selected, load, q, refreshAll],
  );




  return (
    <main className="min-h-screen bg-[#08090b] text-[#f2eee7]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(244,161,37,0.12),transparent_70%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[#F4A125]/80">Obsidian</p>
            <h1 className="mt-1 font-semibold text-2xl sm:text-3xl">Community Library</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#B6BCC8]">
              Every build people chose to share from Obsidian Pocket. Preview it live, copy the code, or remix it
              into your own workspace.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/unlock" className={btn}>
              <Home size={13} /> Home
            </a>
            <Link
              to="/pocket"
              className="inline-flex items-center gap-2 rounded-md bg-gradient-to-b from-[#F4A125] to-[#DD9324] px-4 py-2 text-sm font-semibold text-[#111317] transition hover:brightness-110"
            >
              <Wand2 size={14} /> Build your own
            </Link>
          </div>
        </header>

        <form
          className="mt-6 flex max-w-md items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(q.trim());
          }}
        >
          <Search size={14} className="text-[#6b7180]" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search builds or paste a share link…"
            aria-label="Search community builds"
            className="w-full bg-transparent text-sm text-[#f2eee7] placeholder:text-[#6b7180] focus:outline-none"
          />
          <button type="submit" className={btn}>
            Search
          </button>
        </form>

        {notice && (
          <p role="status" className="mt-4 rounded-md border border-[#F4A125]/30 bg-[#F4A125]/10 px-3 py-2 text-sm text-[#F4A125]">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}

        {loading ? (
          <div className="mt-16 flex items-center justify-center gap-2 text-sm text-[#B6BCC8]">
            <Loader2 size={16} className="animate-spin" /> Loading builds…
          </div>
        ) : builds.length === 0 ? (
          <p className="mt-16 text-center text-sm text-[#B6BCC8]">
            No shared builds yet. Be the first — build something in Pocket and press “Share to Library”.
          </p>
        ) : (
          <>
          {adminCode && (
            <div className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="text-xs text-[#B6BCC8]">{selected.length} selected</span>
              <button
                type="button"
                className={btn}
                onClick={() => setSelected(builds.map((b) => b.id))}
              >
                Select all
              </button>
              <button type="button" className={btn} onClick={() => setSelected([])}>
                Clear
              </button>
              <button
                type="button"
                className={`${btn} !border-rose-400/40 !text-rose-300`}
                disabled={bulkBusy || selected.length === 0}
                onClick={() => void bulkSetPublic(false)}
              >
                {bulkBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete selected
              </button>
            </div>
          )}
          <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {builds.map((b) => {
              const url = b.share_slug ? `/api/public/share/${b.share_slug}` : null;
              return (
                <li key={b.id} className={card}>
                  <div className="relative h-48 overflow-hidden border-b border-white/10 bg-black/60">
                    {adminCode && (
                      <label className="absolute left-2 top-2 z-10 flex cursor-pointer items-center gap-1 rounded-md border border-white/15 bg-black/70 px-2 py-1 text-[11px] text-[#f2eee7] backdrop-blur">
                        <input
                          type="checkbox"
                          className="accent-[#F4A125]"
                          checked={selected.includes(b.id)}
                          onChange={() => toggleSelected(b.id)}
                          aria-label={`Select ${b.title || "build"}`}
                        />
                        Select
                      </label>
                    )}

                    {url ? (
                      <iframe
                        src={url}
                        title={`Preview of ${b.title}`}
                        loading="lazy"
                        sandbox="allow-scripts"
                        className="pointer-events-none h-[900px] w-[1440px] origin-top-left scale-[0.32] border-0"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-[#6b7180]">No preview</div>
                    )}
                  </div>
                  <div className="p-4">
                    <h2 className="truncate text-sm font-semibold text-[#f2eee7]">{b.title || "Untitled"}</h2>
                    <p className="mt-1 line-clamp-2 text-xs text-[#8b90a0]">{b.prompt || "No description"}</p>
                    <p className="mt-2 text-[11px] text-[#6b7180]">
                      {b.author_label ? `by ${b.author_label} · ` : ""}
                      {new Date(b.published_at || b.created_at).toLocaleDateString()}
                      {b.remix_count > 0 ? ` · ${b.remix_count} remixes` : ""}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {url && (
                        <a href={url} target="_blank" rel="noopener noreferrer" className={btn}>
                          <ExternalLink size={13} /> Open
                        </a>
                      )}
                      <button
                        type="button"
                        className={btn}
                        onClick={() => void copyCode(b)}
                        disabled={busyId === b.id}
                      >
                        {busyId === b.id ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />} Copy code
                      </button>
                      <a href={`/pocket?remix=${b.share_slug || b.id}`} className={`${btn} !border-[#F4A125]/40 !text-[#F4A125]`}>
                        <Wand2 size={13} /> Remix
                      </a>
                      {adminCode && (
                        <button
                          type="button"
                          className={`${btn} !border-rose-400/40 !text-rose-300`}
                          onClick={() => void togglePublic(b.id, false)}
                          disabled={adminBusy === b.id}
                        >
                          {adminBusy === b.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}{" "}
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          </>
        )}
      </div>

      {/* Admin backdoor dot */}
      <button
        type="button"
        aria-label="Admin"
        title="Admin"
        onClick={() => (adminCode ? setManageOpen((v) => !v) : setCodeOpen(true))}
        className="fixed bottom-4 left-4 z-40 h-3.5 w-3.5 rounded-full bg-rose-500/80 shadow-[0_0_10px_rgba(244,63,94,0.8)] transition hover:scale-125"
      />

      {codeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <form
            className="w-full max-w-xs rounded-xl border border-white/10 bg-[#111317] p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitCode();
            }}
          >
            <p className="text-sm font-semibold">Admin code</p>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              aria-label="Admin code"
              className="mt-3 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-[#f2eee7] focus:outline-none focus:ring-2 focus:ring-[#F4A125]/60"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={btn} onClick={() => setCodeOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={btn} disabled={codeBusy}>
                {codeBusy ? <Loader2 size={13} className="animate-spin" /> : null} Enter
              </button>
            </div>
          </form>
        </div>
      )}

      {adminCode && manageOpen && (
        <aside className="fixed bottom-4 left-4 z-50 max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-white/10 bg-[#111317]/95 p-3 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Manage library</p>
            <button type="button" className={btn} onClick={() => setManageOpen(false)} aria-label="Close">
              <X size={13} />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-[#6b7180]">Toggle any build in or out of the public library.</p>
          <p className="mt-0.5 text-[11px] text-[#6b7180]">
            Showing {allBuilds.length} of {buildsTotal} total build{buildsTotal === 1 ? "" : "s"}
            {buildsCursor ? " — more below" : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[#B6BCC8]">{selected.length} selected</span>
            <button type="button" className={btn} onClick={() => setSelected(allBuilds.map((b) => b.id))}>
              Select all
            </button>
            <button type="button" className={btn} onClick={() => setSelected([])}>
              Clear
            </button>
            <button
              type="button"
              className={`${btn} !border-rose-400/40 !text-rose-300`}
              disabled={bulkBusy || selected.length === 0}
              onClick={() => void bulkSetPublic(false)}
            >
              {bulkBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete selected
            </button>
            <button
              type="button"
              className={`${btn} !border-emerald-400/40 !text-emerald-300`}
              disabled={bulkBusy || selected.length === 0}
              onClick={() => void bulkSetPublic(true)}
            >
              <Plus size={13} /> Add selected
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {allBuilds.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5"
              >
                <input
                  type="checkbox"
                  className="accent-[#F4A125]"
                  checked={selected.includes(b.id)}
                  onChange={() => toggleSelected(b.id)}
                  aria-label={`Select ${b.title || "build"}`}
                />
                <span className="min-w-0 flex-1">

                  <span className="block truncate text-xs text-[#f2eee7]">{b.title || "Untitled"}</span>
                  <span className="block text-[10px] text-[#6b7180]">
                    {new Date(b.created_at).toLocaleDateString()} · {b.is_public ? "in library" : "hidden"}
                  </span>
                </span>
                <button
                  type="button"
                  className={
                    b.is_public
                      ? `${btn} !border-rose-400/40 !text-rose-300`
                      : `${btn} !border-emerald-400/40 !text-emerald-300`
                  }
                  onClick={() => void togglePublic(b.id, !b.is_public)}
                  disabled={adminBusy === b.id}
                >
                  {adminBusy === b.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : b.is_public ? (
                    <Trash2 size={13} />
                  ) : (
                    <Plus size={13} />
                  )}
                  {b.is_public ? "Remove" : "Add"}
                </button>
              </li>
            ))}
          </ul>
          {buildsCursor && (
            <button
              type="button"
              className={`${btn} mt-3 w-full justify-center`}
              disabled={loadingMore}
              onClick={() => void loadMoreBuilds()}
            >
              {loadingMore ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                `Load ${Math.min(200, buildsTotal - allBuilds.length)} more (${buildsTotal - allBuilds.length} remaining)`
              )}
            </button>
          )}
        </aside>
      )}
    </main>
  );
}

