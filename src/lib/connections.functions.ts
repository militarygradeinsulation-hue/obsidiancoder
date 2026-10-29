import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  GITHUB_SCOPES,
  OAUTH_START_LIMIT,
  OAUTH_STATE_TTL_MS,
  PROVIDERS,
} from "./connections-catalog";
import { LINK_COOKIE, LINK_COOKIE_MAX_AGE_S } from "./connections-cookie";

export type ConnectionStatus = {
  provider: string;
  configured: boolean;
  missingEnv: string[];
  redirectUri: string | null;
  account: null | {
    login: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    status: string;
    scopes: string[];
    lastCheckedAt: string | null;
    connectedAt: string;
  };
};

export type ListConnectionsResult =
  | { ok: true; rows: ConnectionStatus[] }
  | { ok: false; error: "load_failed" };

export const listConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ListConnectionsResult> => {
    const { githubConfig } = await import("./connections.server");
    const gh = githubConfig();
    // RLS: owner-only safe metadata. No token columns exist on this table.
    const { data, error } = await context.supabase
      .from("connected_accounts")
      .select(
        "provider, login, display_name, avatar_url, status, scopes, last_checked_at, created_at",
      )
      .eq("user_id", context.userId);
    // Fail closed: a read error must not look like "not connected".
    if (error || !data) {
      console.error("connections list failed", error?.code ?? "no_data");
      return { ok: false, error: "load_failed" };
    }
    const rows = PROVIDERS.map((p) => {
      const row = data.find((r) => r.provider === p.id);
      const isGh = p.id === "github";
      return {
        provider: p.id,
        configured: isGh ? gh.configured : false,
        missingEnv: isGh ? gh.missing : [],
        redirectUri: isGh ? gh.redirectUri : null,
        account: row
          ? {
              login: row.login,
              displayName: row.display_name,
              avatarUrl: row.avatar_url,
              status: row.status,
              scopes: row.scopes ?? [],
              lastCheckedAt: row.last_checked_at,
              connectedAt: row.created_at,
            }
          : null,
      };
    });
    return { ok: true, rows };
  });

type StartResult =
  | { ok: true; url: string }
  | {
      ok: false;
      error: "not_configured" | "rate_limited" | "start_failed" | "wrong_origin";
      missingEnv: string[];
      origin?: string;
    };

export const startGithubConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StartResult> => {
    const { githubConfig } = await import("./connections.server");
    const gh = githubConfig();
    if (!gh.configured) return { ok: false, error: "not_configured", missingEnv: gh.missing };

    const { getRequest, setCookie } = await import("@tanstack/react-start/server");
    // The binding cookie is host-only, so the flow must start on the same
    // origin GitHub redirects back to; otherwise the callback can't see it.
    let reqHost = "";
    try {
      reqHost = new URL(getRequest().url).host;
    } catch {
      reqHost = "";
    }
    if (reqHost !== new URL(gh.origin).host)
      return { ok: false, error: "wrong_origin", missingEnv: [], origin: gh.origin };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { randomState, hashState, bindingHash } = await import("./connections-crypto.server");
    const since = new Date(Date.now() - OAUTH_STATE_TTL_MS).toISOString();
    const { count, error: countErr } = await supabaseAdmin
      .from("connection_oauth_states")
      .select("state_hash", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("created_at", since);
    // Fail closed: an unreadable counter must not bypass the rate limit.
    if (countErr || count === null) {
      console.error("connections rate-limit read failed", countErr?.code ?? "null_count");
      return { ok: false, error: "start_failed", missingEnv: [] };
    }
    if (count >= OAUTH_START_LIMIT) return { ok: false, error: "rate_limited", missingEnv: [] };

    const state = randomState();
    const nonce = randomState();
    const { error } = await supabaseAdmin.from("connection_oauth_states").insert({
      state_hash: await hashState(state),
      binding_hash: await bindingHash(nonce, state, "github"),
      user_id: context.userId,
      provider: "github",
      expires_at: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString(),
    });
    if (error) {
      console.error("connections state insert failed", error.code);
      return { ok: false, error: "start_failed", missingEnv: [] };
    }
    // HttpOnly: never readable by page scripts. Lax: sent on GitHub's top-level
    // redirect back. A newer start in another tab replaces it (older tab fails closed).
    setCookie(LINK_COOKIE, nonce, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: LINK_COOKIE_MAX_AGE_S,
    });
    const u = new URL("https://github.com/login/oauth/authorize");
    u.searchParams.set("client_id", gh.clientId);
    u.searchParams.set("redirect_uri", gh.redirectUri);
    u.searchParams.set("scope", GITHUB_SCOPES.join(" "));
    u.searchParams.set("state", state);
    u.searchParams.set("allow_signup", "false");
    return { ok: true, url: u.toString() };
  });

export const checkGithubConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { githubConfig, githubGetUser } = await import("./connections.server");
    const { decryptToken, tokenAad } = await import("./connections-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const gh = githubConfig();
    if (!gh.tokenKey) return { status: "not_configured" as const };
    const { data: v, error: vErr } = await supabaseAdmin
      .from("connection_token_vault")
      .select("ciphertext")
      .eq("user_id", context.userId)
      .eq("provider", "github")
      .maybeSingle();
    if (vErr) {
      console.error("connections vault read failed", vErr.code);
      return { status: "error" as const };
    }
    if (!v) return { status: "not_connected" as const };
    let token: string;
    try {
      token = await decryptToken(v.ciphertext, gh.tokenKey, tokenAad(context.userId, "github"));
    } catch {
      await supabaseAdmin
        .from("connected_accounts")
        .update({ status: "error", last_checked_at: new Date().toISOString() })
        .eq("user_id", context.userId)
        .eq("provider", "github");
      return { status: "error" as const };
    }
    let result: Awaited<ReturnType<typeof githubGetUser>>;
    try {
      result = await githubGetUser(token);
    } catch {
      return { status: "unreachable" as const };
    }
    const status =
      result.status === 200 ? "connected" : result.status === 401 ? "revoked" : "error";
    const { error: upErr } = await supabaseAdmin
      .from("connected_accounts")
      .update({
        status,
        last_checked_at: new Date().toISOString(),
        ...(result.user
          ? {
              login: result.user.login,
              display_name: result.user.name,
              avatar_url: result.user.avatar_url,
              scopes: result.scopes,
            }
          : {}),
      })
      .eq("user_id", context.userId)
      .eq("provider", "github");
    if (upErr) console.error("connections status update failed", upErr.code);
    return { status };
  });

export type DisconnectResult =
  | { ok: true }
  | { ok: false; stage: "pending_links" | "token" | "account" };

export const disconnectGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DisconnectResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    // 1) Kill pending links first so an old authorize URL can't reconnect.
    const s = await supabaseAdmin
      .from("connection_oauth_states")
      .delete()
      .eq("user_id", uid)
      .eq("provider", "github");
    if (s.error) {
      console.error("disconnect: states delete failed", s.error.code);
      return { ok: false, stage: "pending_links" };
    }
    // 2) Token next. If this fails keep the account row so the user still sees
    //    the connection and can retry, rather than an invisible orphan token.
    const a = await supabaseAdmin
      .from("connection_token_vault")
      .delete()
      .eq("user_id", uid)
      .eq("provider", "github");
    if (a.error) {
      console.error("disconnect: vault delete failed", a.error.code);
      return { ok: false, stage: "token" };
    }
    // 3) Metadata. Token is already gone, so a failure here is cosmetic; mark it.
    const b = await supabaseAdmin
      .from("connected_accounts")
      .delete()
      .eq("user_id", uid)
      .eq("provider", "github");
    if (b.error) {
      console.error("disconnect: account delete failed", b.error.code);
      await supabaseAdmin
        .from("connected_accounts")
        .update({ status: "disconnected", updated_at: new Date().toISOString() })
        .eq("user_id", uid)
        .eq("provider", "github");
      return { ok: false, stage: "account" };
    }
    return { ok: true };
  });
