import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

export type GateSession = { unlocked?: boolean };

export function sessionConfig() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET is not configured (need 32+ chars).");
  }
  return {
    password,
    name: "obsidian-gate",
    maxAge: 60 * 60 * 24 * 30,
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
