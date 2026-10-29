import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ObsidianModeNav } from "@/components/ObsidianModeNav";
import { supabase } from "@/integrations/supabase/client";
import { PROVIDERS, callbackMessage } from "@/lib/connections-catalog";
import {
  listConnections, startGithubConnect, checkGithubConnection, disconnectGithub, type ConnectionStatus,
} from "@/lib/connections.functions";

export const Route = createFileRoute("/connections")({
  validateSearch: (s: Record<string, unknown>) => ({ result: typeof s.result === "string" ? s.result : undefined }),
  head: () => ({
    meta: [
      { title: "Connections — link your accounts to Obsidian" },
      { name: "description", content: "Connect your GitHub account to Obsidian securely. See status, check access, and disconnect any time." },
      { property: "og:title", content: "Obsidian Connections Hub" },
      { property: "og:description", content: "Securely link GitHub and, soon, more accounts to your Obsidian profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const { result } = Route.useSearch();
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null);
  const [rows, setRows] = React.useState<ConnectionStatus[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(callbackMessage(result));
  const list = useServerFn(listConnections);
  const start = useServerFn(startGithubConnect);
  const check = useServerFn(checkGithubConnection);
  const disc = useServerFn(disconnectGithub);

  const load = React.useCallback(async () => {
    try { setRows(await list()); } catch { setNote("Couldn't load your connections."); }
  }, [list]);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const ok = !!data.session;
      setSignedIn(ok);
      if (ok) void load();
    });
  }, [load]);

  async function connect() {
    setBusy("connect");
    const r = await start().catch(() => null);
    setBusy(null);
    if (!r) return setNote("Couldn't start the GitHub connection.");
    if (!r.ok) return setNote(r.error === "rate_limited" ? "Too many attempts — wait a few minutes." : r.error === "not_configured" ? "GitHub connections aren't set up yet." : "Couldn't start the GitHub connection.");
    // Top-level navigation so GitHub isn't blocked inside an embedded preview.
    try { (window.top ?? window).location.href = r.url; } catch { window.open(r.url, "_blank", "noopener"); }
  }
  async function runCheck() {
    setBusy("check");
    const r = await check().catch(() => null);
    setBusy(null);
    setNote(r ? ({ connected: "GitHub access is working.", revoked: "GitHub access was revoked or expired — reconnect.", unreachable: "GitHub didn't respond. Try again shortly.", not_connected: "Not connected.", not_configured: "Not set up yet.", error: "Couldn't verify GitHub access." } as Record<string, string>)[r.status] : "Check failed.");
    await load();
  }
  async function disconnect() {
    if (!confirm("Disconnect GitHub from Obsidian? This deletes the stored access.")) return;
    setBusy("disconnect");
    const r = await disc().catch(() => null);
    setBusy(null);
    setNote(r?.ok ? "Disconnected. To fully revoke, also remove the app under GitHub → Settings → Applications." : "Couldn't disconnect.");
    await load();
  }

  return (
    <div className="obs-page">
      <header className="obs-page-top">
        <span className="obs-display text-2xl" style={{ color: "var(--obs-orange)" }}>Obsidian</span>
        <ObsidianModeNav />
      </header>
      <main className="obs-page-wrap">
        <p className="obs-kicker">Connections</p>
        <h1 className="obs-display mt-2 text-5xl sm:text-7xl">Your accounts</h1>
        <p className="mt-3 max-w-2xl text-sm opacity-70">
          Linked accounts belong to you only. Connecting does not give any build or AI tool access — that will always need your separate approval.
        </p>
        {note && <p role="status" className="mt-6 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--obs-orange)" }}>{note}</p>}
        {signedIn === false && (
          <p className="mt-8 text-sm">Sign in first to manage connections. <Link to="/auth" className="underline" style={{ color: "var(--obs-orange)" }}>Sign in</Link></p>
        )}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROVIDERS.map((p) => {
            const s = rows?.find((r) => r.provider === p.id);
            const acct = s?.account;
            const label = !p.implemented ? "Coming later" : !s ? (signedIn ? "Loading…" : "Sign in required") : !s.configured ? "Setup required" : acct ? (acct.status === "connected" ? "Connected" : acct.status === "revoked" ? "Access revoked" : "Needs attention") : "Not connected";
            return (
              <section key={p.id} className="obs-card" aria-label={p.name}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="obs-display text-2xl">{p.name}</h2>
                  <span className="text-[11px] uppercase tracking-widest opacity-80" style={{ color: label === "Connected" ? "var(--obs-orange)" : undefined }}>{label}</span>
                </div>
                <p className="mt-2 text-sm opacity-70">{p.blurb}</p>
                {acct && (
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    {acct.avatarUrl && <img src={acct.avatarUrl} alt="" className="h-6 w-6 rounded-full" />}
                    <span>@{acct.login}</span>
                  </div>
                )}
                {(!p.implemented || (s && !s.configured)) && (
                  <div className="mt-3 text-xs opacity-70">
                    <p>{p.prerequisites}</p>
                    {s && s.missingEnv.length > 0 && <p className="mt-1">Missing: {s.missingEnv.join(", ")}</p>}
                    {s?.redirectUri && <p className="mt-1 break-all">Callback URL: {s.redirectUri}</p>}
                  </div>
                )}
                {p.implemented && s?.configured && signedIn && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!acct || acct.status !== "connected" ? (
                      <button className="obs-btn-primary rounded-md px-3 py-1.5 text-sm" disabled={!!busy} onClick={connect}>{busy === "connect" ? "Opening GitHub…" : acct ? "Reconnect" : "Connect"}</button>
                    ) : null}
                    {acct && <button className="rounded-md border px-3 py-1.5 text-sm" disabled={!!busy} onClick={runCheck}>{busy === "check" ? "Checking…" : "Check access"}</button>}
                    {acct && <button className="rounded-md border px-3 py-1.5 text-sm" disabled={!!busy} onClick={disconnect}>{busy === "disconnect" ? "Removing…" : "Disconnect"}</button>}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
