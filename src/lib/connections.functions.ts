import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  GITHUB_SCOPES,
  OAUTH_START_LIMIT,
  OAUTH_STATE_TTL_MS,
  PROVIDERS,
} from "./connections-catalog";

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

export const listConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConnectionStatus[]> => {
    const { githubConfig } = await import("./connections.server");
    const gh = githubConfig();
    // RLS: owner-only safe metadata. No token columns exist on this table.
    const { data } = await context.supabase
      .from("connected_accounts")
      .select(
        "provider, login, display_name, avatar_url, status, scopes, last_checked_at, created_at",
      )
      .eq("user_id", context.userId);
    return PROVIDERS.map((p) => {
      const row = data?.find((r) => r.provider === p.id);
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
  });

export const startGithubConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { githubConfig } = await import("./connections.server");
    const gh = githubConfig();
    if (!gh.configured)
      return { ok: false as const, error: "not_configured", missingEnv: gh.missing };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { randomState, hashState } = await import("./connections-crypto.server");
    const since = new Date(Date.now() - OAUTH_STATE_TTL_MS).toISOString();
    const { count } = await supabaseAdmin
      .from("connection_oauth_states")
      .select("state_hash", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("created_at", since);
    if ((count ?? 0) >= OAUTH_START_LIMIT)
      return { ok: false as const, error: "rate_limited", missingEnv: [] };
    const state = randomState();
    const { error } = await supabaseAdmin.from("connection_oauth_states").insert({
      state_hash: await hashState(state),
      user_id: context.userId,
      provider: "github",
      expires_at: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString(),
    });
    if (error) return { ok: false as const, error: "start_failed", missingEnv: [] };
    const u = new URL("https://github.com/login/oauth/authorize");
    u.searchParams.set("client_id", gh.clientId);
    u.searchParams.set("redirect_uri", gh.redirectUri);
    u.searchParams.set("scope", GITHUB_SCOPES.join(" "));
    u.searchParams.set("state", state);
    u.searchParams.set("allow_signup", "false");
    return { ok: true as const, url: u.toString() };
  });

export const checkGithubConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { githubConfig, githubGetUser } = await import("./connections.server");
    const { decryptToken, tokenAad } = await import("./connections-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const gh = githubConfig();
    if (!gh.tokenKey) return { status: "not_configured" as const };
    const { data: v } = await supabaseAdmin
      .from("connection_token_vault")
      .select("ciphertext")
      .eq("user_id", context.userId)
      .eq("provider", "github")
      .maybeSingle();
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
    await supabaseAdmin
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
    return { status };
  });

export const disconnectGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const a = await supabaseAdmin
      .from("connection_token_vault")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", "github");
    const b = await supabaseAdmin
      .from("connected_accounts")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", "github");
    if (a.error || b.error) return { ok: false };
    return { ok: true };
  });
