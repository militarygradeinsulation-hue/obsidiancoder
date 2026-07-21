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
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const gate = checkAdmin(data.adminCode);
    if (!gate.ok) return gate;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const url = data.url ?? `https://obsidianvibe.live/api/public/share/${data.slug}`;
    const { error } = await supabaseAdmin
      .from("featured_demos")
      .upsert(
        { slug: data.slug, title: data.title, category: data.category, url, sort_order: Math.floor(Date.now() / 1000) },
        { onConflict: "slug" },
      );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
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
    const patch: Record<string, unknown> = {};
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
