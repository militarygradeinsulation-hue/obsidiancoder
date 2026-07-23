// Admin-curated demos for the /unlock gallery. Public read; writes gated by
// the site admin code (SITE_PASSWORD, e.g. "9822"). Called from the builder
// after a successful Go Live so the admin can promote a fresh share into the
// public gallery without editing DEMOS by hand.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";

const CATEGORIES = ["App", "Landing", "Dashboard", "Tool", "Game", "Portfolio"] as const;

const pushInput = z.object({
  adminCode: z.string().min(1).max(200),
  slug: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/, "invalid slug"),
  title: z.string().min(1).max(120),
  category: z.enum(CATEGORIES).default("App"),
  url: z.string().url().max(500).optional(),
});

const adminOnly = z.object({ adminCode: z.string().min(1).max(200) });

const updateInput = z.object({
  adminCode: z.string().min(1).max(200),
  id: z.string().uuid(),
  title: z.string().min(1).max(120).optional(),
  category: z.enum(CATEGORIES).optional(),
  url: z.string().url().max(500).optional(),
  slug: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  sort_order: z.number().int().optional(),
});

const deleteInput = z.object({
  adminCode: z.string().min(1).max(200),
  id: z.string().uuid(),
});

const reorderInput = z.object({
  adminCode: z.string().min(1).max(200),
  order: z.array(z.string().uuid()).min(1).max(200),
});

function matches(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

function checkAdmin(code: string): { ok: true } | { ok: false; error: string } {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return { ok: false, error: "admin not configured" };
  if (!matches(code, expected)) return { ok: false, error: "not admin" };
  return { ok: true };
}

export const pushFeaturedDemo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pushInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; id: string; slug: string } | { ok: false; error: string }> => {
    const gate = checkAdmin(data.adminCode);
    if (!gate.ok) return gate;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const url = data.url ?? `https://obsidianvibe.live/api/public/share/${data.slug}`;
    const { data: row, error } = await supabaseAdmin
      .from("featured_demos")
      .upsert(
        { slug: data.slug, title: data.title, category: data.category, url, sort_order: Math.floor(Date.now() / 1000) },
        { onConflict: "slug" },
      )
      .select("id, slug")
      .single();
    if (error || !row) return { ok: false, error: error?.message ?? "upsert failed" };
    return { ok: true, id: row.id as string, slug: row.slug as string };
  });

export type FeaturedDemoRow = {
  id: string;
  slug: string;
  title: string;
  category: string;
  url: string | null;
  sort_order: number;
  created_at: string;
};

export const listFeaturedDemos = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => adminOnly.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; demos: FeaturedDemoRow[] } | { ok: false; error: string }> => {
    const gate = checkAdmin(data.adminCode);
    if (!gate.ok) return gate;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("featured_demos")
      .select("id, slug, title, category, url, sort_order, created_at")
      .order("sort_order", { ascending: false });
    if (error) return { ok: false, error: error.message };
    return { ok: true, demos: (rows ?? []) as FeaturedDemoRow[] };
  });

export const updateFeaturedDemo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const gate = checkAdmin(data.adminCode);
    if (!gate.ok) return gate;
    const patch: {
      title?: string; category?: string; url?: string; slug?: string; sort_order?: number;
    } = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.category !== undefined) patch.category = data.category;
    if (data.url !== undefined) patch.url = data.url;
    if (data.slug !== undefined) patch.slug = data.slug;
    if (data.sort_order !== undefined) patch.sort_order = data.sort_order;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("featured_demos").update(patch).eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const deleteFeaturedDemo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const gate = checkAdmin(data.adminCode);
    if (!gate.ok) return gate;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("featured_demos").delete().eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const reorderFeaturedDemos = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => reorderInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const gate = checkAdmin(data.adminCode);
    if (!gate.ok) return gate;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Assign descending sort_order so index 0 is highest.
    const base = Math.floor(Date.now() / 1000) + data.order.length;
    for (let i = 0; i < data.order.length; i++) {
      const id = data.order[i];
      const so = base - i;
      const { error } = await supabaseAdmin
        .from("featured_demos")
        .update({ sort_order: so })
        .eq("id", id);
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true };
  });

export type WaitlistEntryRow = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  company: string | null;
  interest_level: string;
  tier: string | null;
  source: string | null;
  paid: boolean | null;
};

export type WaitlistStats = {
  total: number;
  paid: number;
  unpaid: number;
  last_24h: number;
  last_7d: number;
  by_tier: Array<{ tier: string; count: number }>;
  recent: WaitlistEntryRow[];
};

export const getWaitlistStats = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => adminOnly.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; stats: WaitlistStats } | { ok: false; error: string }> => {
    const gate = checkAdmin(data.adminCode);
    if (!gate.ok) return gate;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("waitlist_entries")
      .select("id, created_at, name, email, company, interest_level, tier, source, paid")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return { ok: false, error: error.message };
    const list = (rows ?? []) as WaitlistEntryRow[];
    const now = Date.now();
    const dayMs = 86_400_000;
    const paid = list.filter((r) => r.paid === true).length;
    const last_24h = list.filter((r) => now - new Date(r.created_at).getTime() < dayMs).length;
    const last_7d = list.filter((r) => now - new Date(r.created_at).getTime() < 7 * dayMs).length;
    const tierMap = new Map<string, number>();
    for (const r of list) {
      const t = r.tier?.trim() || "unspecified";
      tierMap.set(t, (tierMap.get(t) ?? 0) + 1);
    }
    const by_tier = Array.from(tierMap.entries())
      .map(([tier, count]) => ({ tier, count }))
      .sort((a, b) => b.count - a.count);
    return {
      ok: true,
      stats: {
        total: list.length,
        paid,
        unpaid: list.length - paid,
        last_24h,
        last_7d,
        by_tier,
        recent: list.slice(0, 20),
      },
    };
  });

// ---------------------------------------------------------------------------
// Live credit ledger feed — for the 9822 admin portal.
// Aggregates the app's own credit-consumption tables (ai_usage, credit_usage,
// owner_usage). This is your in-app ledger — separate from Lovable workspace
// credits, which have no public API.
// ---------------------------------------------------------------------------

export type CreditLedgerRow = {
  id: string;
  created_at: string;
  source: "ai_usage" | "credit_usage" | "owner_usage";
  actor: "user" | "owner";
  user_id: string | null;
  operation: string;
  provider: string | null;
  model: string | null;
  status: string;
  environment: string | null;
  credits: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
  cost_basis: string | null;
  request_id: string | null;
  error_code: string | null;
};

export type CreditLedgerStats = {
  now_iso: string;
  window_hours: number;
  totals: {
    credits_committed: number;
    credits_pending: number;
    credits_refunded: number;
    cost_usd: number;
    calls: number;
    input_tokens: number;
    output_tokens: number;
  };
  by_operation: Array<{ operation: string; credits: number; cost_usd: number; calls: number }>;
  by_model: Array<{ model: string; credits: number; cost_usd: number; calls: number }>;
  by_status: Array<{ status: string; count: number }>;
  last_24h_credits: number;
  last_1h_credits: number;
  owner_credits_period: number;
  recent: CreditLedgerRow[];
};

export const getCreditLedger = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => adminOnly.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; stats: CreditLedgerStats } | { ok: false; error: string }> => {
    const gate = checkAdmin(data.adminCode);
    if (!gate.ok) return gate;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sinceIso = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [aiRes, credRes, ownerRes] = await Promise.all([
      supabaseAdmin
        .from("ai_usage")
        .select("id, created_at, user_id, actor_type, operation, provider, model, status, environment, credits_charged, credits_reserved, input_tokens, output_tokens, actual_cost_usd, estimated_cost_usd, cost_basis, request_id, error_code")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("credit_usage")
        .select("id, created_at, user_id, operation, environment, status, credits, request_id")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("owner_usage")
        .select("id, created_at, operation, credits, request_id")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (aiRes.error) return { ok: false, error: aiRes.error.message };
    if (credRes.error) return { ok: false, error: credRes.error.message };
    if (ownerRes.error) return { ok: false, error: ownerRes.error.message };

    const rows: CreditLedgerRow[] = [];
    for (const r of (aiRes.data ?? []) as Array<Record<string, unknown>>) {
      const credits =
        r.status === "committed" ? Number(r.credits_charged ?? 0) :
        r.status === "pending" ? Number(r.credits_reserved ?? 0) :
        0;
      const cost = (r.actual_cost_usd ?? r.estimated_cost_usd) as number | null | undefined;
      rows.push({
        id: String(r.id),
        created_at: String(r.created_at),
        source: "ai_usage",
        actor: (r.actor_type === "owner" ? "owner" : "user"),
        user_id: (r.user_id as string | null) ?? null,
        operation: String(r.operation ?? ""),
        provider: (r.provider as string | null) ?? null,
        model: (r.model as string | null) ?? null,
        status: String(r.status ?? ""),
        environment: (r.environment as string | null) ?? null,
        credits,
        input_tokens: Number(r.input_tokens ?? 0),
        output_tokens: Number(r.output_tokens ?? 0),
        cost_usd: cost != null ? Number(cost) : null,
        cost_basis: (r.cost_basis as string | null) ?? null,
        request_id: (r.request_id as string | null) ?? null,
        error_code: (r.error_code as string | null) ?? null,
      });
    }
    for (const r of (credRes.data ?? []) as Array<Record<string, unknown>>) {
      rows.push({
        id: String(r.id),
        created_at: String(r.created_at),
        source: "credit_usage",
        actor: "user",
        user_id: (r.user_id as string | null) ?? null,
        operation: String(r.operation ?? ""),
        provider: null,
        model: null,
        status: String(r.status ?? ""),
        environment: (r.environment as string | null) ?? null,
        credits: Number(r.credits ?? 0),
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: null,
        cost_basis: null,
        request_id: (r.request_id as string | null) ?? null,
        error_code: null,
      });
    }
    for (const r of (ownerRes.data ?? []) as Array<Record<string, unknown>>) {
      rows.push({
        id: String(r.id),
        created_at: String(r.created_at),
        source: "owner_usage",
        actor: "owner",
        user_id: null,
        operation: String(r.operation ?? ""),
        provider: null,
        model: null,
        status: "committed",
        environment: null,
        credits: Number(r.credits ?? 0),
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: null,
        cost_basis: null,
        request_id: (r.request_id as string | null) ?? null,
        error_code: null,
      });
    }
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    const now = Date.now();
    const hourMs = 3_600_000;
    const dayMs = 24 * hourMs;

    let credits_committed = 0, credits_pending = 0, credits_refunded = 0;
    let cost_usd = 0, calls = 0, input_tokens = 0, output_tokens = 0;
    let last_24h_credits = 0, last_1h_credits = 0, owner_credits_period = 0;
    const opMap = new Map<string, { credits: number; cost_usd: number; calls: number }>();
    const modelMap = new Map<string, { credits: number; cost_usd: number; calls: number }>();
    const statusMap = new Map<string, number>();

    for (const r of rows) {
      calls++;
      input_tokens += r.input_tokens;
      output_tokens += r.output_tokens;
      if (r.cost_usd != null) cost_usd += r.cost_usd;
      if (r.status === "committed") credits_committed += r.credits;
      else if (r.status === "pending") credits_pending += r.credits;
      else if (r.status === "refunded") credits_refunded += r.credits;

      const ageMs = now - new Date(r.created_at).getTime();
      if (ageMs < dayMs && r.status !== "refunded") last_24h_credits += r.credits;
      if (ageMs < hourMs && r.status !== "refunded") last_1h_credits += r.credits;
      if (r.actor === "owner") owner_credits_period += r.credits;

      const op = r.operation || "(none)";
      const opEntry = opMap.get(op) ?? { credits: 0, cost_usd: 0, calls: 0 };
      opEntry.credits += r.credits;
      opEntry.cost_usd += r.cost_usd ?? 0;
      opEntry.calls++;
      opMap.set(op, opEntry);

      const model = r.model || "(none)";
      const mEntry = modelMap.get(model) ?? { credits: 0, cost_usd: 0, calls: 0 };
      mEntry.credits += r.credits;
      mEntry.cost_usd += r.cost_usd ?? 0;
      mEntry.calls++;
      modelMap.set(model, mEntry);

      statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + 1);
    }

    const by_operation = Array.from(opMap.entries())
      .map(([operation, v]) => ({ operation, ...v }))
      .sort((a, b) => b.credits - a.credits)
      .slice(0, 15);
    const by_model = Array.from(modelMap.entries())
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.credits - a.credits)
      .slice(0, 15);
    const by_status = Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    return {
      ok: true,
      stats: {
        now_iso: new Date().toISOString(),
        window_hours: 24 * 7,
        totals: {
          credits_committed, credits_pending, credits_refunded,
          cost_usd, calls, input_tokens, output_tokens,
        },
        by_operation, by_model, by_status,
        last_24h_credits, last_1h_credits, owner_credits_period,
        recent: rows.slice(0, 50),
      },
    };
  });
