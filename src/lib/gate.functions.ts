import { createServerFn } from "@tanstack/react-start";

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
    if (!expected) throw new Error("SITE_PASSWORD is not set.");
    const { passwordMatches, setUnlocked } = await import("./gate.server");
    if (!passwordMatches(data.password, expected)) {
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
