import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Cloud,
  Download,
  ExternalLink,
  HardDrive,
  Loader2,
  Pencil,
  Search,
  Trash2,
  Zap,
} from "lucide-react";
import { safeGet } from "@/lib/safe-storage";
import { getAccountCode } from "@/lib/account-code";
import { authFetch } from "@/lib/auth-fetch";
import {
  deleteArchiveEntry,
  readArchive,
  hydrateArchiveFromIdb,
  renameArchiveEntry,
  searchArchive,
  stageArchiveHandoff,
  type ArchiveEntry,
} from "@/lib/build-archive";

export const Route = createFileRoute("/archive")({
  head: () => ({
    meta: [
      { title: "Build Archive — every Obsidian build you've ever made" },
      {
        name: "description",
        content:
          "One shelf for every build ever generated in Obsidian Pocket and the Vibe Coder. Search, rename, reopen, download or publish any past build at any time.",
      },
      { property: "og:title", content: "Build Archive — Obsidian Vibe" },
      {
        property: "og:description",
        content: "Search, rename and reopen every build you've ever made in Obsidian.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArchivePage,
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen bg-[#08090b] p-8 text-[#f2eee7]">
      <h1 className="text-xl font-semibold">Couldn't load the archive</h1>
      <p className="mt-2 text-sm text-[#B6BCC8]">{error.message}</p>
      <button
        type="button"
        className="mt-4 rounded-md border border-white/15 px-3 py-1.5 text-sm"
        onClick={reset}
      >
        Try again
      </button>
    </div>
  ),
});

type CloudRow = {
  id: string;
  created_at: string;
  title: string;
  prompt: string;
  model: string | null;
  byte_size: number;
  share_slug: string | null;
};

type Row = {
  key: string;
  title: string;
  prompt: string;
  model: string;
  at: number;
  bytes: number;
  surface: "pocket" | "vibe" | "cloud";
  local?: ArchiveEntry;
  cloudId?: string;
  shareSlug?: string | null;
};

const btn =
  "inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-[#B6BCC8] transition hover:border-[#F4A125]/40 hover:text-[#F4A125] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60 disabled:opacity-50";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ArchivePage() {
  const navigate = useNavigate();
  const [code, setCode] = React.useState("");
  const [local, setLocal] = React.useState<ArchiveEntry[]>([]);
  const [cloud, setCloud] = React.useState<CloudRow[]>([]);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    const stored = safeGet<string>("forge.libraryCode") || getAccountCode();
    setCode(stored || "");
  }, []);

  const refreshLocal = React.useCallback((c: string) => {
    setLocal(readArchive(c).entries);
    // Pull back anything that only survives in the durable IndexedDB mirror
    // (entries the localStorage byte cap pushed out).
    void hydrateArchiveFromIdb(c)
      .then((merged) => setLocal(merged.entries))
      .catch(() => { /* the localStorage read above already rendered */ });
  }, []);

  const refreshCloud = React.useCallback(async (c: string) => {
    const trimmed = c.trim();
    if (trimmed.length < 4) {
      setCloud([]);
      return;
    }
    try {
      const res = await authFetch(`/api/public/library/${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        setCloud([]);
        return;
      }
      const j = (await res.json()) as { builds?: CloudRow[] };
      setCloud(j.builds ?? []);
    } catch {
      setCloud([]);
    }
  }, []);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    refreshLocal(code);
    void refreshCloud(code).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [code, refreshLocal, refreshCloud]);

  const rows: Row[] = React.useMemo(() => {
    const localRows: Row[] = searchArchive(local, query).map((e) => ({
      key: `l:${e.id}`,
      title: e.title,
      prompt: e.prompt,
      model: e.model,
      at: e.at,
      bytes: e.bytes,
      surface: e.surface,
      local: e,
      ...(e.cloudId ? { cloudId: e.cloudId } : {}),
      ...(e.shareSlug ? { shareSlug: e.shareSlug } : {}),
    }));
    const seenCloud = new Set(localRows.map((r) => r.cloudId).filter(Boolean) as string[]);
    const q = query.trim().toLowerCase();
    const cloudRows: Row[] = cloud
      .filter((c) => !seenCloud.has(c.id))
      .filter((c) => !q || `${c.title} ${c.prompt} ${c.model ?? ""}`.toLowerCase().includes(q))
      .map((c) => ({
        key: `c:${c.id}`,
        title: c.title || "Untitled build",
        prompt: c.prompt || "",
        model: c.model || "",
        at: new Date(c.created_at).getTime(),
        bytes: c.byte_size || 0,
        surface: "cloud" as const,
        cloudId: c.id,
        shareSlug: c.share_slug,
      }));
    return [...localRows, ...cloudRows].sort((a, b) => b.at - a.at);
  }, [local, cloud, query]);

  const fetchCloudHtml = React.useCallback(
    async (id: string): Promise<{ title: string; prompt: string; html: string } | null> => {
      const c = code.trim();
      if (c.length < 4) return null;
      const res = await authFetch(`/api/public/library/${encodeURIComponent(c)}/${id}`);
      if (!res.ok) return null;
      const j = (await res.json()) as { title?: string; prompt?: string; html?: string };
      if (!j.html) return null;
      return { title: j.title ?? "Untitled build", prompt: j.prompt ?? "", html: j.html };
    },
    [code],
  );

  const openIn = React.useCallback(
    async (row: Row, target: "/pocket" | "/") => {
      setBusyKey(row.key);
      try {
        let entry = row.local;
        if (!entry && row.cloudId) {
          const full = await fetchCloudHtml(row.cloudId);
          if (!full) {
            setNotice("Couldn't load that build's code.");
            return;
          }
          entry = {
            id: row.key,
            at: row.at,
            surface: "pocket",
            title: full.title,
            prompt: full.prompt,
            model: row.model,
            html: full.html,
            bytes: full.html.length,
          };
        }
        if (!entry) return;
        stageArchiveHandoff(entry);
        void navigate({ to: target });
      } finally {
        setBusyKey(null);
      }
    },
    [fetchCloudHtml, navigate],
  );

  const download = React.useCallback(
    async (row: Row) => {
      setBusyKey(row.key);
      try {
        const html = row.local?.html ?? (row.cloudId ? (await fetchCloudHtml(row.cloudId))?.html : "");
        if (!html) {
          setNotice("Couldn't load that build's code.");
          return;
        }
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${row.title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "build"}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } finally {
        setBusyKey(null);
      }
    },
    [fetchCloudHtml],
  );

  const rename = React.useCallback(
    async (row: Row) => {
      const next = window.prompt("Rename this build", row.title);
      if (next === null) return;
      const title = next.trim();
      if (!title) return;
      setBusyKey(row.key);
      try {
        if (row.local) renameArchiveEntry(row.local.id, title, code);
        if (row.cloudId && code.trim().length >= 4) {
          await authFetch(`/api/public/library/${encodeURIComponent(code.trim())}/${row.cloudId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          });
          void refreshCloud(code);
        }
        refreshLocal(code);
        setNotice("Renamed");
      } finally {
        setBusyKey(null);
      }
    },
    [code, refreshCloud, refreshLocal],
  );

  const remove = React.useCallback(
    async (row: Row) => {
      if (!window.confirm(`Delete "${row.title}" from your archive?`)) return;
      setBusyKey(row.key);
      try {
        if (row.local) deleteArchiveEntry(row.local.id, code);
        if (row.cloudId && code.trim().length >= 4) {
          await authFetch(`/api/public/library/${encodeURIComponent(code.trim())}/${row.cloudId}`, {
            method: "DELETE",
          });
          void refreshCloud(code);
        }
        refreshLocal(code);
        setNotice("Deleted");
      } finally {
        setBusyKey(null);
      }
    },
    [code, refreshCloud, refreshLocal],
  );

  return (
    <div className="min-h-screen bg-[#08090b] text-[#E8E6E1]">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <Link to="/home" className={btn} aria-label="Back to Obsidian home">
            <ArrowLeft size={13} /> Home
          </Link>
          <h1 className="font-[var(--font-display,inherit)] text-base font-semibold tracking-tight">
            Build Archive
          </h1>
          <span className="rounded-full border border-[#F4A125]/30 bg-[#F4A125]/10 px-2 py-0.5 text-[10px] text-[#F4A125]">
            {rows.length} build{rows.length === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <label className="sr-only" htmlFor="archive-code">
              Library code
            </label>
            <input
              id="archive-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Library code"
              className="w-28 rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
            />
            <Link to="/pocket" className={btn}>
              <Zap size={13} /> Pocket
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <p className="text-sm text-[#B6BCC8]">
          Every build you generate in Obsidian lands here automatically — saved or not. Reopen,
          rename, download or publish any of them at any time.
        </p>

        <div className="relative mt-4">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7180]"
          />
          <label className="sr-only" htmlFor="archive-search">
            Search builds
          </label>
          <input
            id="archive-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, prompt or model…"
            className="w-full rounded-lg border border-white/10 bg-black/40 py-2 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A125]/60"
          />
        </div>

        {notice && (
          <p role="status" className="mt-3 text-xs text-[#F4A125]">
            {notice}
          </p>
        )}

        {loading ? (
          <p className="mt-8 flex items-center gap-2 text-sm text-[#B6BCC8]">
            <Loader2 size={14} className="animate-spin" /> Loading your archive…
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-8 text-sm text-[#6b7180]">
            No builds yet. Make something in{" "}
            <Link to="/pocket" className="text-[#F4A125] underline underline-offset-2">
              Obsidian Pocket
            </Link>{" "}
            and it will appear here.
          </p>
        ) : (
          <ul className="mt-5 space-y-2">
            {rows.map((row) => (
              <li
                key={row.key}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-xl transition hover:border-[#F4A125]/30"
              >
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{row.title}</p>
                    <p className="mt-0.5 truncate text-xs text-[#6b7180]">
                      {new Date(row.at).toLocaleString()} · {fmtBytes(row.bytes)}
                      {row.model ? ` · ${row.model}` : ""}
                    </p>
                    {row.prompt && (
                      <p className="mt-1 line-clamp-2 text-xs text-[#B6BCC8]">{row.prompt}</p>
                    )}
                  </div>
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-[#B6BCC8]"
                    title={row.cloudId ? "Saved to your cloud library" : "Stored on this device"}
                  >
                    {row.cloudId ? <Cloud size={11} /> : <HardDrive size={11} />}
                    {row.surface === "cloud" ? "cloud" : row.surface}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={btn}
                    disabled={busyKey === row.key}
                    onClick={() => void openIn(row, "/pocket")}
                  >
                    {busyKey === row.key ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Zap size={12} />
                    )}
                    Open in Pocket
                  </button>
                  <button
                    type="button"
                    className={btn}
                    disabled={busyKey === row.key}
                    onClick={() => void openIn(row, "/")}
                  >
                    Open in Vibe Coder
                  </button>
                  <button
                    type="button"
                    className={btn}
                    disabled={busyKey === row.key}
                    onClick={() => void rename(row)}
                  >
                    <Pencil size={12} /> Rename
                  </button>
                  <button
                    type="button"
                    className={btn}
                    disabled={busyKey === row.key}
                    onClick={() => void download(row)}
                  >
                    <Download size={12} /> Download
                  </button>
                  {row.shareSlug && (
                    <a
                      className={btn}
                      href={`/api/public/share/${row.shareSlug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={12} /> Live URL
                    </a>
                  )}
                  <button
                    type="button"
                    className={`${btn} hover:border-rose-400/40 hover:text-rose-300`}
                    disabled={busyKey === row.key}
                    onClick={() => void remove(row)}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
