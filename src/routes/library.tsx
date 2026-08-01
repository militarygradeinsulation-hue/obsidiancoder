import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, ExternalLink, Loader2, Search, Wand2, Home } from "lucide-react";

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

function LibraryPage() {
  const [builds, setBuilds] = React.useState<CommunityBuild[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

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
            placeholder="Search builds…"
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
          <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {builds.map((b) => {
              const url = b.share_slug ? `/api/public/share/${b.share_slug}` : null;
              return (
                <li key={b.id} className={card}>
                  <div className="relative h-48 overflow-hidden border-b border-white/10 bg-black/60">
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
                      <a href={`/pocket?remix=${b.id}`} className={`${btn} !border-[#F4A125]/40 !text-[#F4A125]`}>
                        <Wand2 size={13} /> Remix
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
