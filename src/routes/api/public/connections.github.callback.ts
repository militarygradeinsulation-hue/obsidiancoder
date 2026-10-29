import { createFileRoute } from "@tanstack/react-router";
import { clearLinkCookieHeader, precheckCallback } from "@/lib/connections-cookie";

// GitHub OAuth callback. Public by necessity (GitHub redirects here). Two trust
// anchors are required together: the single-use hashed state row AND the
// HttpOnly browser-binding cookie set when this same browser started the link.
// Without the cookie nothing is consumed, exchanged or stored.
// Always redirects to a fixed same-site page; never to a caller-supplied URL.

export const Route = createFileRoute("/api/public/connections/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { githubConfig, fetchWithTimeout, githubGetUser } =
          await import("@/lib/connections.server");
        const gh = githubConfig();
        const done = (code: string) =>
          new Response(null, {
            status: 302,
            headers: {
              Location: `${gh.origin}/connections?result=${code}`,
              "Cache-Control": "no-store",
              "Referrer-Policy": "no-referrer",
              // One-shot: clear the binding cookie on every outcome.
              "Set-Cookie": clearLinkCookieHeader(),
            },
          });
        try {
          if (!gh.configured) return done("not_configured");
          const url = new URL(request.url);
          const pre = precheckCallback(url.searchParams.get("state"), request.headers.get("cookie"));
          if (!pre.ok) return done(pre.code);
          const code = url.searchParams.get("code") ?? "";

          const { hashState, bindingHash, encryptToken, tokenAad } =
            await import("@/lib/connections-crypto.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // Atomic consume, only when state AND browser binding match. Replay,
          // expiry, provider mismatch and foreign browser all return NULL.
          const { data: userId, error } = await supabaseAdmin.rpc(
            "consume_connection_oauth_state_v2",
            {
              _state_hash: await hashState(pre.state),
              _provider: "github",
              _binding_hash: await bindingHash(pre.nonce, pre.state, "github"),
            },
          );
          if (error) {
            console.error("github callback consume failed", error.code);
            return done("error");
          }
          if (!userId) return done("invalid_state");
          if (url.searchParams.get("error")) return done("denied");
          if (!code || code.length > 200) return done("exchange_failed");

          const tr = await fetchWithTimeout("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "User-Agent": "Obsidian-Connections",
            },
            body: JSON.stringify({
              client_id: gh.clientId,
              client_secret: gh.clientSecret,
              code,
              redirect_uri: gh.redirectUri,
            }),
          });
          const tj = (await tr.json().catch(() => ({}))) as {
            access_token?: string;
            error?: string;
          };
          if (!tr.ok || !tj.access_token) {
            console.error("github token exchange failed", tr.status, tj.error ?? "");
            return done("exchange_failed");
          }
          const me = await githubGetUser(tj.access_token);
          if (!me.user) return done("identity_failed");

          const now = new Date().toISOString();
          const ciphertext = await encryptToken(
            tj.access_token,
            gh.tokenKey,
            tokenAad(userId, "github"),
          );
          const v = await supabaseAdmin
            .from("connection_token_vault")
            .upsert(
              { user_id: userId, provider: "github", ciphertext, key_version: 1, updated_at: now },
              { onConflict: "user_id,provider" },
            );
          if (v.error) {
            console.error("github callback vault write failed", v.error.code);
            return done("error");
          }
          const a = await supabaseAdmin.from("connected_accounts").upsert(
            {
              user_id: userId,
              provider: "github",
              provider_account_id: String(me.user.id),
              login: me.user.login,
              display_name: me.user.name,
              avatar_url: me.user.avatar_url,
              scopes: me.scopes,
              status: "connected",
              last_checked_at: now,
              updated_at: now,
            },
            { onConflict: "user_id,provider" },
          );
          if (a.error) {
            // Don't leave an invisible token behind: roll the vault write back.
            console.error("github callback account write failed", a.error.code);
            await supabaseAdmin
              .from("connection_token_vault")
              .delete()
              .eq("user_id", userId)
              .eq("provider", "github");
            return done("error");
          }
          return done("connected");
        } catch (e) {
          console.error("github callback error", e instanceof Error ? e.name : "unknown");
          return done("error");
        }
      },
    },
  },
});
