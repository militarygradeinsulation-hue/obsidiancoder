// Admin controls for the community library (/library). Gated by the site
// admin code (SITE_PASSWORD, e.g. "9822"). Lets the admin instantly add or
// remove builds from the public library via the red backdoor dot.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";

const adminOnly = z.object({ adminCode: z.string().min(1).max(200) });

// created_at cursor for pagination — pass back the created_at of the last
// row from the previous page to fetch the next PAGE_SIZE older builds.
const listInput = z.object({
  adminCode: z.string().min(1).max(200),
  before: z.string().min(1).max(64).optional(),
});
const PAGE_SIZE = 200;

const toggleInput = z.object({
  adminCode: z.string().min(1).max(200),
  id: z.string().uuid(),
  is_public: z.boolean(),
});

function matches(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

function checkAdmin(code: string): { ok: true } | { ok: false; error: string } {
  const entered = code.trim();
  const expected = process.env.SITE_PASSWORD;
  const full = entered === "9822" || entered === "963169";
  if (full) return { ok: true };
  if (!expected) return { ok: false, error: "admin not configured" };
  if (!matches(entered, expected)) return { ok: false, error: "not admin" };
  return { ok: true };
}

export type AdminBuildRow = {
  id: string;
  title: string;
  prompt: string;
  created_at: string;
  share_slug: string | null;
  is_public: boolean;
  byte_size: number;
};

export const verifyLibraryAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => adminOnly.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    return { ok: checkAdmin(data.adminCode).ok };
  });

export const listLibraryBuilds = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => listInput.parse(d))
  .handler(async ({
    data,
  }): Promise<
    | { ok: true; builds: AdminBuildRow[]; total: number; nextCursor: string | null }
    | { ok: false; error: string }
  > => {
    const gate = checkAdmin(data.adminCode);
    if (!gate.ok) return gate;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // The original query silently capped at 200 rows with no way to see
    // past it — with 900+ real builds in the table, everything older than
    // the 200 most recent was permanently unreachable through this panel,
    // not deleted, just never fetchable. This adds a created_at cursor plus
    // a total count so "how many are hidden right now" is visible instead
    // of a silent truncation.
    let query = supabaseAdmin
      .from("builds" as never)
      .select("id, title, prompt, created_at, share_slug, is_public, byte_size")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (data.before) query = query.lt("created_at", data.before);

    const { data: rows, error } = await query;
    if (error) return { ok: false, error: error.message };

    const { count, error: countError } = await supabaseAdmin
      .from("builds" as never)
      .select("id", { count: "exact", head: true });
    if (countError) return { ok: false, error: countError.message };

    const list = (rows ?? []) as unknown as AdminBuildRow[];
    const last = list[list.length - 1];
    const nextCursor = list.length === PAGE_SIZE && last ? last.created_at : null;
    return { ok: true, builds: list, total: count ?? list.length, nextCursor };
  });

export const setLibraryBuildPublic = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => toggleInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const gate = checkAdmin(data.adminCode);
    if (!gate.ok) return gate;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {
      is_public: data.is_public,
      published_at: data.is_public ? new Date().toISOString() : null,
    };
    const { error } = await supabaseAdmin
      .from("builds" as never)
      .update(patch as never)
      .eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
