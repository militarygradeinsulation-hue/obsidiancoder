import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/admin/waitlist")({
  head: () => ({ meta: [{ title: "Waitlist Admin · Obsidian" }, { name: "robots", content: "noindex" }] }),
  component: WaitlistAdmin,
});

interface Entry {
  id: string;
  created_at: string;
  name: string;
  email: string;
  company: string | null;
  intended_use: string;
  interest_level: string;
  tier: string | null;
  source: string | null;
}

function WaitlistAdmin() {
  const [token, setToken] = useState(() =>
    (typeof window !== "undefined" ? window.sessionStorage.getItem("waitlist_admin_token") ?? "" : ""),
  );
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(t: string) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/public/waitlist?token=${encodeURIComponent(t)}`);
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      const json = await res.json() as { entries: Entry[] };
      setEntries(json.entries);
      window.sessionStorage.setItem("waitlist_admin_token", t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setEntries(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (token) void load(token); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <main className="min-h-screen bg-[#050607] text-[#f2eee7] p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold">Waitlist Admin</h1>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); void load(token); }}
        >
          <input
            type="password"
            placeholder="Admin token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="flex-1 px-3 py-2 rounded bg-white/[0.03] border border-white/10 text-sm"
          />
          <button className="px-4 py-2 rounded bg-[#F4A125] text-black text-sm font-semibold" disabled={loading}>
            {loading ? "Loading…" : "Load"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {entries && (
          <div className="mt-6">
            <p className="text-xs text-[#B6BCC8] mb-3">{entries.length} entries</p>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-xs">
                <thead className="bg-white/[0.03] text-[#B6BCC8]">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Email</th>
                    <th className="px-3 py-2 text-left">Company</th>
                    <th className="px-3 py-2 text-left">Interest</th>
                    <th className="px-3 py-2 text-left">Tier</th>
                    <th className="px-3 py-2 text-left">Intended use</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-t border-white/5 align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-[#B6BCC8]">{new Date(e.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2">{e.name}</td>
                      <td className="px-3 py-2"><a href={`mailto:${e.email}`} className="text-[#F4A125] hover:underline">{e.email}</a></td>
                      <td className="px-3 py-2">{e.company ?? "—"}</td>
                      <td className="px-3 py-2">{e.interest_level}</td>
                      <td className="px-3 py-2">{e.tier ?? "—"}</td>
                      <td className="px-3 py-2 max-w-md whitespace-pre-wrap">{e.intended_use}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
