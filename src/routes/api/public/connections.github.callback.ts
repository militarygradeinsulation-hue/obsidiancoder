import { createFileRoute } from "@tanstack/react-router";

// GitHub OAuth callback. Public by necessity (GitHub redirects here), so the
// only trust anchor is the single-use, user-bound, hashed state row.
// Always redirects to a fixed same-site page; never to a caller-supplied URL.

export const Route = createFileRoute("/api/public/connections/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { githubConfig, fetchWithTimeout, githubGetUser } = await import("@/lib/connections.server");
        const gh = githubConfig();
        const done = (code: string) =>
          new Response(null, { status: 302, headers: { Location: `${gh.origin}/connections?result=${code}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
        try {
          if (!gh.configured) return done("not_configured");
          const url = new URL(request.url);
          const state = url.searchParams.get("state") ?? "";
          const code = url.searchParams.get("code") ?? "";
          if (!/^[0-9a-f]{64}$/.test(state)) return done("invalid_state");
          const { hashState, encryptToken, tokenAad } = await import("@/lib/connections-crypto.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // Atomic consume: the row is deleted whether or not the rest succeeds (no replay).
          const { data: userId, error } = await supabaseAdmin.rpc("consume_connection_oauth_state", {
            _state_hash: await hashState(state), _provider: "github",
          });
          if (error || !userId) return done("invalid_state");
          if (url.searchParams.get("error")) return done("denied");
          if (!code || code.length > 200) return done("exchange_failed");

          const tr = await fetchWithTimeout("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "Obsidian-Connections" },
            body: JSON.stringify({ client_id: gh.clientId, client_secret: gh.clientSecret, code, redirect_uri: gh.redirectUri }),
          });
          const tj = (await tr.json().catch(() => ({}))) as { access_token?: string; error?: string };
          if (!tr.ok || !tj.access_token) {
            console.error("github token exchange failed", tr.status, tj.error ?? "");
            return done("exchange_failed");
          }
          const me = await githubGetUser(tj.access_token);
          if (!me.user) return done("identity_failed");

          const now = new Date().toISOString();
          const ciphertext = await encryptToken(tj.access_token, gh.tokenKey, tokenAad(userId, "github"));
          const v = await supabaseAdmin.from("connection_token_vault").upsert(
            { user_id: userId, provider: "github", ciphertext, key_version: 1, updated_at: now },
            { onConflict: "user_id,provider" },
          );
          if (v.error) return done("error");
          const a = await supabaseAdmin.from("connected_accounts").upsert(
            {
              user_id: userId, provider: "github",
              provider_account_id: String(me.user.id), login: me.user.login,
              display_name: me.user.name, avatar_url: me.user.avatar_url,
              scopes: me.scopes, status: "connected", last_checked_at: now, updated_at: now,
            },
            { onConflict: "user_id,provider" },
          );
          if (a.error) return done("error");
          return done("connected");
        } catch (e) {
          console.error("github callback error", e instanceof Error ? e.name : "unknown");
          return done("error");
        }
      },
    },
  },
});
