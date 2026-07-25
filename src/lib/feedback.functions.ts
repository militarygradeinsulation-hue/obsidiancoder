// Public feedback submissions + admin-only listing/mutation.
// Public: submitFeedback (rate-guarded by message length + basic shape).
// Admin (SITE_PASSWORD): listFeedback, markFeedbackHandled, deleteFeedback.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";

const submitInput = z.object({
  message: z.string().min(3).max(2000),
  contact: z.string().max(200).optional().nullable(),
  path: z.string().max(500).optional().nullable(),
});

const adminOnly = z.object({ adminCode: z.string().min(1).max(200) });
const adminIdInput = z.object({ adminCode: z.string().min(1).max(200), id: z.string().uuid() });
const adminMarkInput = z.object({
  adminCode: z.string().min(1).max(200),
  id: z.string().uuid(),
  handled: z.boolean(),
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

export type FeedbackRow = {
  id: string;
  message: string;
  contact: string | null;
  path: string | null;
  user_agent: string | null;
  handled: boolean;
  created_at: string;
};

export const submitFeedback = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => submitInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    let ua: string | null = null;
    try { ua = getRequest().headers.get("user-agent"); } catch { ua = null; }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("feedback").insert({
      message: data.message.trim(),
      contact: data.contact?.trim() || null,
      path: data.path?.trim() || null,
      user_agent: ua ? ua.slice(0, 500) : null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const listFeedback = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => adminOnly.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; rows: FeedbackRow[] } | { ok: false; error: string }> => {
    const gate = checkAdmin(data.adminCode);
    if (!gate.ok) return gate;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("feedback")
      .select("id, message, contact, path, user_agent, handled, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return { ok: false, error: error.message };
    return { ok: true, rows: (rows ?? []) as FeedbackRow[] };
  });

export const markFeedbackHandled = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => adminMarkInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const gate = checkAdmin(data.adminCode);
    if (!gate.ok) return gate;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("feedback").update({ handled: data.handled }).eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

export const deleteFeedback = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => adminIdInput.parse(d))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const gate = checkAdmin(data.adminCode);
    if (!gate.ok) return gate;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("feedback").delete().eq("id", data.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
