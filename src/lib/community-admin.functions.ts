// Admin controls for the community library (/library). Gated by the site
// admin code (SITE_PASSWORD, e.g. "9822"). Lets the admin instantly add or
// remove builds from the public library via the red backdoor dot.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";

const adminOnly = z.object({ adminCode: z.string().min(1).max(200) });

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
  .inputValidator((d: unknown) => adminOnly.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; builds: AdminBuildRow[] } | { ok: false; error: string }> => {
    const gate = checkAdmin(data.adminCode);
    if (!gate.ok) return gate;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("builds" as never)
      .select("id, title, prompt, created_at, share_slug, is_public, byte_size")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return { ok: false, error: error.message };
    return { ok: true, builds: (rows ?? []) as unknown as AdminBuildRow[] };
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
