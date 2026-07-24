// 21st.dev component library — server-only helper.
//
// Talks to the 21st.dev MCP HTTP endpoint (JSON-RPC 2.0) at
// https://21st.dev/api/mcp with the `x-api-key` header. Metadata `search` is
// free; `get_component` is metered. We call `search` per query (up to 3
// queries per build), pick the top hit, then fetch its code with
// `get_component`. Any failure — missing key, network, 4xx/5xx, unexpected
// shape — silently returns [] so a bad 21st.dev day cannot break builds.

import { aiFetch } from "./ai-fetch";
import { markTwentyfirstAuth } from "./twentyfirst-metrics.server";

export interface ComponentHit {
  name: string;
  description?: string;
  code: string;
  previewUrl?: string;
  tags?: string[];
  identifier?: string;
}

const MCP_URL = "https://21st.dev/api/mcp";

// Tiny in-memory LRU + failure cache. Both live for the process lifetime of
// this server worker, which is fine — a stale hit for 10 min is harmless and a
// 5-min "key is bad" cache stops us from hammering after a rotation error.
type CacheEntry = { at: number; hits: ComponentHit[] };
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 60;
let AUTH_BAD_UNTIL = 0;

function cacheGet(key: string): ComponentHit[] | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { CACHE.delete(key); return null; }
  // touch — reinsert to move to MRU end
  CACHE.delete(key); CACHE.set(key, hit);
  return hit.hits;
}
function cacheSet(key: string, hits: ComponentHit[]): void {
  if (CACHE.size >= CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest) CACHE.delete(oldest);
  }
  CACHE.set(key, { at: Date.now(), hits });
}

interface JsonRpcResp<T = unknown> {
  jsonrpc?: string;
  id?: number | string;
  result?: T;
  error?: { code?: number; message?: string };
}

async function mcpCall<T>(
  key: string,
  method: string,
  params: unknown,
  requestId: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T | null> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: Math.floor(Math.random() * 1_000_000),
    method,
    params,
  });
  try {
    const res = await aiFetch(
      MCP_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // MCP Streamable HTTP spec requires both — see mcp-servers knowledge.
          Accept: "application/json, text/event-stream",
          "x-api-key": key,
        },
        body,
      },
      {
        breakerKey: `21st/${method}`,
        stage: "plan",
        requestId,
        signal,
        maxAttempts: 1,
        totalTimeoutMs: timeoutMs,
      },
    );
    const status = res.response.status;
    if (status === 401 || status === 403) {
      AUTH_BAD_UNTIL = Date.now() + 5 * 60 * 1000;
      // eslint-disable-next-line no-console
      console.warn("[21st.dev] auth rejected — pausing calls for 5 min", { status });
      return null;
    }
    if (!res.response.ok) return null;
    const ct = res.response.headers.get("content-type") ?? "";
    let json: JsonRpcResp<T>;
    if (ct.includes("text/event-stream")) {
      // Very small SSE: read whole body, find the last `data:` line, parse.
      const text = await res.response.text();
      const lines = text.split(/\r?\n/).filter((l) => l.startsWith("data:"));
      const last = lines[lines.length - 1]?.slice(5).trim();
      if (!last) return null;
      json = JSON.parse(last) as JsonRpcResp<T>;
    } else {
      json = (await res.response.json()) as JsonRpcResp<T>;
    }
    if (json.error) return null;
    return (json.result ?? null) as T | null;
  } catch {
    return null;
  }
}

// The MCP tools/call envelope returns `{ content: [{ type:"text", text:"..." }] }`
// or a `structuredContent` field. We accept either.
interface McpToolResult {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

function readToolResult(result: McpToolResult | null): unknown | null {
  if (!result) return null;
  if (result.isError) return null;
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = result.content?.find((c) => c?.type === "text")?.text;
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

interface SearchHitRaw {
  id?: string | number;
  slug?: string;
  name?: string;
  title?: string;
  description?: string;
  preview_url?: string;
  previewUrl?: string;
  demo_url?: string;
  tags?: string[];
  author?: { username?: string };
  username?: string;
}

interface ComponentCodeRaw {
  code?: string;
  source?: string;
  files?: Array<{ path?: string; content?: string }>;
  demo?: string;
}

function pickIdentifier(hit: SearchHitRaw): string | null {
  // 21st get_component accepts `<username>/<slug>` or the raw id.
  if (hit.author?.username && hit.slug) return `${hit.author.username}/${hit.slug}`;
  if (hit.username && hit.slug) return `${hit.username}/${hit.slug}`;
  if (hit.slug) return hit.slug;
  if (hit.id != null) return String(hit.id);
  return null;
}

async function fetchComponentCode(
  key: string,
  identifier: string,
  requestId: string,
  signal: AbortSignal,
): Promise<string | null> {
  const raw = await mcpCall<McpToolResult>(
    key,
    "tools/call",
    { name: "get_component", arguments: { component: identifier } },
    requestId,
    signal,
    4500,
  );
  const parsed = readToolResult(raw) as ComponentCodeRaw | string | null;
  if (!parsed) return null;
  if (typeof parsed === "string") return parsed;
  if (parsed.code) return parsed.code;
  if (parsed.source) return parsed.source;
  if (Array.isArray(parsed.files)) {
    const primary = parsed.files.find((f) => f?.content) ?? parsed.files[0];
    if (primary?.content) return primary.content;
  }
  return null;
}

export async function searchComponents(
  query: string,
  opts: { limit?: number; requestId: string; signal: AbortSignal } = { requestId: "no-req", signal: new AbortController().signal },
): Promise<ComponentHit[]> {
  const key = process.env.TWENTYFIRST_API_KEY;
  if (!key) return [];
  if (Date.now() < AUTH_BAD_UNTIL) return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const cacheKey = `s:${q}:${opts.limit ?? 1}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const raw = await mcpCall<McpToolResult>(
    key,
    "tools/call",
    { name: "search", arguments: { query: q, limit: Math.max(1, Math.min(5, opts.limit ?? 3)) } },
    opts.requestId,
    opts.signal,
    4000,
  );
  const parsed = readToolResult(raw);
  if (!parsed || typeof parsed !== "object") { cacheSet(cacheKey, []); return []; }
  const list: SearchHitRaw[] = Array.isArray(parsed)
    ? (parsed as SearchHitRaw[])
    : Array.isArray((parsed as { results?: unknown }).results)
      ? ((parsed as { results: SearchHitRaw[] }).results)
      : Array.isArray((parsed as { components?: unknown }).components)
        ? ((parsed as { components: SearchHitRaw[] }).components)
        : [];
  if (!list.length) { cacheSet(cacheKey, []); return []; }

  // Only fetch code for the top hit per query — cost + latency control.
  const top = list[0];
  const id = pickIdentifier(top);
  if (!id) { cacheSet(cacheKey, []); return []; }
  const code = await fetchComponentCode(key, id, opts.requestId, opts.signal);
  if (!code) { cacheSet(cacheKey, []); return []; }

  const hits: ComponentHit[] = [{
    name: top.name || top.title || id,
    description: top.description,
    code,
    previewUrl: top.preview_url ?? top.previewUrl ?? top.demo_url,
    tags: top.tags,
  }];
  cacheSet(cacheKey, hits);
  return hits;
}
