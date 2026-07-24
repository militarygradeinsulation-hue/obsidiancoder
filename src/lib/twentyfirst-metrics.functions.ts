// Admin-gated telemetry surface for the 21st.dev component pipeline.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";
import { getTwentyfirstHealth, type TwentyfirstHealth } from "./twentyfirst-metrics.server";

const input = z.object({ adminCode: z.string().min(1).max(200) });

function matches(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

export const getTwentyfirstHealthStats = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; health: TwentyfirstHealth } | { ok: false; error: string }> => {
    const expected = process.env.SITE_PASSWORD;
    if (!expected) return { ok: false, error: "admin not configured" };
    if (!matches(data.adminCode, expected)) return { ok: false, error: "not admin" };
    return { ok: true, health: getTwentyfirstHealth() };
  });
