// Server-only helpers for the Connections Hub. Never import from components.
import { CALLBACK_PATH, DEFAULT_PUBLIC_ORIGIN } from "./connections-catalog";

export function githubConfig() {
  const clientId = process.env["GITHUB_OAUTH_CLIENT_ID"] ?? "";
  const clientSecret = process.env["GITHUB_OAUTH_CLIENT_SECRET"] ?? "";
  const tokenKey = process.env["CONNECTIONS_TOKEN_KEY"] ?? "";
  const origin = (process.env["CONNECTIONS_PUBLIC_ORIGIN"] || DEFAULT_PUBLIC_ORIGIN).replace(
    /\/+$/,
    "",
  );
  const missing: string[] = [];
  if (!clientId) missing.push("GITHUB_OAUTH_CLIENT_ID");
  if (!clientSecret) missing.push("GITHUB_OAUTH_CLIENT_SECRET");
  if (!tokenKey) missing.push("CONNECTIONS_TOKEN_KEY");
  return {
    clientId,
    clientSecret,
    tokenKey,
    redirectUri: origin + CALLBACK_PATH,
    origin,
    missing,
    configured: missing.length === 0,
  };
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = 8000,
): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

export interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
}

export async function githubGetUser(
  token: string,
): Promise<{ status: number; user?: GithubUser; scopes: string[] }> {
  const r = await fetchWithTimeout("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Obsidian-Connections",
    },
  });
  const scopes = (r.headers.get("x-oauth-scopes") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!r.ok) return { status: r.status, scopes };
  const j = (await r.json()) as GithubUser;
  if (typeof j?.id !== "number" || typeof j?.login !== "string") return { status: 502, scopes };
  return { status: 200, user: j, scopes };
}
