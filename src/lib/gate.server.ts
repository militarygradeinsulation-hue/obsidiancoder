import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

export type GateSession = { unlocked?: boolean };

// Derive a 64-char hex key from whatever SESSION_SECRET (or fallback material)
// is available. Never throws — a short/missing value is stretched via SHA-256
// so the app boots. The derived value stays server-only.
function derivePassword(): { password: string; degraded: boolean } {
  const raw = process.env.SESSION_SECRET ?? "";
  if (raw.length >= 32) return { password: raw, degraded: false };
  const material =
    raw +
    "|" +
    (process.env.SUPABASE_URL ?? "") +
    "|" +
    (process.env.SUPABASE_PUBLISHABLE_KEY ?? "") +
    "|obsidian-gate-v1";
  const stretched = createHash("sha256").update(material, "utf8").digest("hex"); // 64 hex chars
  return { password: stretched, degraded: true };
}

let warned = false;
export function sessionConfig() {
  const { password, degraded } = derivePassword();
  if (degraded && !warned) {
    warned = true;
    // Server-side warning only; no secret material logged.
    console.warn(
      "[gate] SESSION_SECRET missing or <32 chars; using derived fallback key. Set a 32+ char SESSION_SECRET in Project Settings → Secrets.",
    );
  }
  return {
    password,
    name: "obsidian-gate",
    // Session cookie — expires when the browser closes so users must
    // re-authenticate every visit. No `maxAge` set intentionally.
    cookie: { httpOnly: true, secure: true, sameSite: "none" as const, path: "/" },
  };
}

export function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function isUnlockedServer(): Promise<boolean> {
  const session = await useSession<GateSession>(sessionConfig());
  return !!session.data.unlocked;
}

export async function setUnlocked(value: boolean): Promise<void> {
  const session = await useSession<GateSession>(sessionConfig());
  if (value) await session.update({ unlocked: true });
  else await session.clear();
}
