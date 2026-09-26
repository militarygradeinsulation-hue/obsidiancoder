import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Details = {
  authorization_id: string;
  redirect_uri: string;
  client: { name?: string; client_name?: string; uri?: string } & Record<string, unknown>;
  user: { id: string; email: string };
  scope: string;
};

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { authorization_id?: string } => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Authorize access — Obsidian Vibe" },
      { name: "description", content: "Approve an app's request to use your Obsidian Vibe tools." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConsentPage,
});

function ConsentPage() {
  const { authorization_id } = Route.useSearch();
  const navigate = useNavigate();
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!authorization_id) { setError("Missing authorization request."); return; }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        const back = `/.lovable/oauth/consent?authorization_id=${encodeURIComponent(authorization_id)}`;
        navigate({ to: "/auth", search: { redirect: back, mode: "signin" }, replace: true });
        return;
      }
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorization_id);
      if (cancelled) return;
      if (error) { setError(error.message); return; }
      if (data && "redirect_url" in data && !("authorization_id" in data)) {
        window.location.href = data.redirect_url;
        return;
      }
      setDetails(data as unknown as Details);
    })();
    return () => { cancelled = true; };
  }, [authorization_id, navigate]);

  async function decide(approve: boolean) {
    if (!authorization_id) return;
    setBusy(true);
    const fn = approve ? supabase.auth.oauth.approveAuthorization : supabase.auth.oauth.denyAuthorization;
    const { data, error } = await fn.call(supabase.auth.oauth, authorization_id, { skipBrowserRedirect: true });
    if (error) { setError(error.message); setBusy(false); return; }
    if (data?.redirect_url) window.location.href = data.redirect_url;
  }

  const clientName = (details?.client?.client_name as string) || (details?.client?.name as string) || "An app";

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Obsidian Vibe</p>
        {error ? (
          <>
            <h1 className="mt-3 text-2xl font-semibold">Can't complete this request</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </>
        ) : !details ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading request…</p>
        ) : (
          <>
            <h1 className="mt-3 text-2xl font-semibold">{clientName} wants to use your Obsidian tools</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Signed in as <span className="text-foreground">{details.user.email}</span>. Approving lets this app
              build and edit on your account, using your credits.
            </p>
            <p className="mt-3 break-all text-xs text-muted-foreground">Returns to: {details.redirect_uri}</p>
            <div className="mt-6 flex gap-3">
              <button disabled={busy} onClick={() => decide(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">
                Deny
              </button>
              <button disabled={busy} onClick={() => decide(true)}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                Approve
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
