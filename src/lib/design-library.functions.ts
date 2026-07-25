// Server-only 21st.dev design-library adapter.
// Reads TWENTYFIRST_API_KEY (aliased as API_KEY_21ST) inside handlers only.
// Never exposes the key to the client; results are normalized + sanitized.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { safeText, safeUrl } from "./design-library";

// Tiny in-memory cache + rate limiter (per-process; per-Worker isolate).
type CacheEntry<T> = { at: number; value: T };
const CACHE = new Map<string, CacheEntry<unknown>>();
const CACHE_MAX = 80;
const CACHE_TTL_MS = 5 * 60 * 1000;
function cget<T>(k: string): T | null {
  const e = CACHE.get(k); if (!e) return null;
  if (Date.now() - e.at > CACHE_TTL_MS) { CACHE.delete(k); return null; }
  CACHE.delete(k); CACHE.set(k, e); return e.value as T;
}
function cset<T>(k: string, v: T) {
  if (CACHE.size >= CACHE_MAX) { const first = CACHE.keys().next().value; if (first) CACHE.delete(first); }
  CACHE.set(k, { at: Date.now(), value: v });
}

const RATE: Map<string, number[]> = new Map();
const RATE_MAX = 20;                // 20 requests
const RATE_WINDOW_MS = 60_000;      // per minute per bucket
function rateOk(bucket: string): boolean {
  const now = Date.now();
  const arr = (RATE.get(bucket) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) return false;
  arr.push(now); RATE.set(bucket, arr); return true;
}

function readKey(): string | undefined {
  return process.env.TWENTYFIRST_API_KEY ?? process.env.API_KEY_21ST;
}

// -------- Status ------------------------------------------------------------

export const designLibraryStatusFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; provider: "21st.dev" }> => {
    return { configured: !!readKey(), provider: "21st.dev" };
  },
);

// -------- Search components ------------------------------------------------

export interface UiComponentHit {
  id: string;
  identifier: string;
  name: string;
  description?: string;
  previewUrl?: string;
  tags: string[];
  author?: string;
}

export const searchComponentsFn = createServerFn({ method: "POST" })
  .inputValidator((raw) =>
    z.object({
      query: z.string().max(120).default(""),
      kind: z.string().max(40).optional(),
      limit: z.number().int().min(1).max(24).default(12),
    }).parse(raw),
  )
  .handler(async ({ data }): Promise<{ enabled: boolean; hits: UiComponentHit[] }> => {
    const key = readKey();
    if (!key) return { enabled: false, hits: [] };
    if (!rateOk("cmp")) return { enabled: true, hits: [] };
    const q = `${data.query} ${data.kind ?? ""}`.trim();
    if (!q) return { enabled: true, hits: [] };
    const cacheKey = `cmp:${q.toLowerCase()}:${data.limit}`;
    const cached = cget<UiComponentHit[]>(cacheKey);
    if (cached) return { enabled: true, hits: cached };

    const requestId = `dl-cmp-${Date.now().toString(36)}`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 6000);
    try {
      const mod = await import("./twentyfirst.server");
      const raw = await mod.searchComponents(q, { limit: data.limit, requestId, signal: ac.signal });
      const hits: UiComponentHit[] = raw.map((r, i) => ({
        id: safeText(r.identifier ?? String(i), 200),
        identifier: safeText(r.identifier ?? String(i), 200),
        name: safeText(r.name ?? "Component", 120),
        description: r.description ? safeText(r.description, 240) : undefined,
        previewUrl: safeUrl(r.previewUrl),
        tags: (r.tags ?? []).map((x) => safeText(x, 40)).filter(Boolean).slice(0, 8),
      })).filter((h) => h.identifier);
      cset(cacheKey, hits);
      return { enabled: true, hits };
    } catch {
      return { enabled: true, hits: [] };
    } finally {
      clearTimeout(t);
    }
  });

// -------- Search templates (mapped through /search with `type:"template"`) --

export interface UiTemplateHit {
  id: string;
  identifier: string;
  name: string;
  description?: string;
  previewUrl?: string;
  tags: string[];
}

export const searchTemplatesFn = createServerFn({ method: "POST" })
  .inputValidator((raw) =>
    z.object({
      query: z.string().max(120).default(""),
      limit: z.number().int().min(1).max(24).default(12),
    }).parse(raw),
  )
  .handler(async ({ data }): Promise<{ enabled: boolean; hits: UiTemplateHit[] }> => {
    const key = readKey();
    if (!key) return { enabled: false, hits: [] };
    if (!rateOk("tpl")) return { enabled: true, hits: [] };
    // 21st.dev doesn't publish a stable `type:"template"` endpoint via MCP at
    // time of writing — reuse component search with a template-flavored query
    // and let the adapter normalize. If the API surfaces a dedicated tool
    // later, swap the underlying call here.
    const q = `${data.query || "template landing page"}`.trim();
    const cacheKey = `tpl:${q.toLowerCase()}:${data.limit}`;
    const cached = cget<UiTemplateHit[]>(cacheKey);
    if (cached) return { enabled: true, hits: cached };
    const requestId = `dl-tpl-${Date.now().toString(36)}`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 6000);
    try {
      const mod = await import("./twentyfirst.server");
      const raw = await mod.searchComponents(q, { limit: data.limit, requestId, signal: ac.signal });
      const hits: UiTemplateHit[] = raw.map((r, i) => ({
        id: safeText(r.identifier ?? String(i), 200),
        identifier: safeText(r.identifier ?? String(i), 200),
        name: safeText(r.name ?? "Template", 120),
        description: r.description ? safeText(r.description, 240) : undefined,
        previewUrl: safeUrl(r.previewUrl),
        tags: (r.tags ?? []).map((x) => safeText(x, 40)).filter(Boolean).slice(0, 8),
      })).filter((h) => h.identifier);
      cset(cacheKey, hits);
      return { enabled: true, hits };
    } catch {
      return { enabled: true, hits: [] };
    } finally {
      clearTimeout(t);
    }
  });
