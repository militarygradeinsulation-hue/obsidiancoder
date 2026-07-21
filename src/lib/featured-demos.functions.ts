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

function matches(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

export const pushFeaturedDemo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pushInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const expected = process.env.SITE_PASSWORD;
    if (!expected) return { ok: false, error: "admin not configured" };
    if (!matches(data.adminCode, expected)) return { ok: false, error: "not admin" };

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
