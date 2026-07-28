import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ensureUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  const { isUnlockedServer } = await import("./gate.server");
  const unlocked = await isUnlockedServer();
  return { unlocked };
});

export const unlockSite = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => ({
    password: String(data?.password ?? "").slice(0, 128),
  }))
  .handler(async ({ data }) => {
    const expected = process.env.SITE_PASSWORD;
    const { passwordMatches, setUnlocked } = await import("./gate.server");
    // "9822" = primary admin library code. "482917" = free-tier access code
    // (unlocks the site only; it grants no admin capabilities).
    const entered = data.password.trim();
    const libraryCodeOk = entered === "9822" || entered === "482917";
    const envOk = expected ? passwordMatches(data.password, expected) : false;
    if (!libraryCodeOk && !envOk) {
      await new Promise((r) => setTimeout(r, 400));
      return { ok: false as const };
    }
    await setUnlocked(true);
    return { ok: true as const };
  });

export const lockSite = createServerFn({ method: "POST" }).handler(async () => {
  const { setUnlocked } = await import("./gate.server");
  await setUnlocked(false);
  return { ok: true as const };
});

/**
 * Server-verified Pro-based unlock. Authorization header is validated by the
 * requireSupabaseAuth middleware; the verified user id is used to check the
 * active Stripe subscription window. If active, the gate cookie is set so the
 * customer can enter the app without needing the private access code.
 */
export const unlockIfPro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasActivePro, serverStripeEnv } = await import("./credit-gate.server");
    const env = serverStripeEnv();
    const user = { userId: context.userId, token: "server", email: undefined } as {
      userId: string; token: string; email?: string;
    };
    const ok = await hasActivePro(user, env);
    if (!ok) return { ok: false as const };
    const { setUnlocked } = await import("./gate.server");
    await setUnlocked(true);
    return { ok: true as const };
  });
