import { PROVIDERS, getProvider, callbackMessage, GITHUB_SCOPES, OAUTH_STATE_TTL_MS } from "../connections-catalog";
import { encryptToken, decryptToken, randomState, hashState, tokenAad } from "../connections-crypto.server";

let pass = 0, fail = 0;
const check = (n: string, c: boolean) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}`); } };
const throws = async (f: () => Promise<unknown>) => { try { await f(); return false; } catch { return true; } };

console.log("\nconnections: catalog");
check("six providers listed", PROVIDERS.length === 6);
check("only GitHub is implemented", PROVIDERS.filter((p) => p.implemented).map((p) => p.id).join() === "github");
check("GitHub requires client id, secret and token key", getProvider("github")!.requiredEnv.length === 3);
check("GitHub asks for read:user only", GITHUB_SCOPES.join() === "read:user");
check("state lives 10 minutes", OAUTH_STATE_TTL_MS === 600000);
check("unknown callback code is not echoed", callbackMessage("<script>") === "Something went wrong connecting GitHub.");

console.log("\nconnections: token envelope");
const key = "k".repeat(64);
const ct = await encryptToken("gho_secret", key, tokenAad("u1", "github"));
check("ciphertext does not contain token", !ct.includes("gho_secret"));
check("round-trips for the owner", (await decryptToken(ct, key, tokenAad("u1", "github"))) === "gho_secret");
check("another user cannot decrypt (owner-bound)", await throws(() => decryptToken(ct, key, tokenAad("u2", "github"))));
check("wrong key fails", await throws(() => decryptToken(ct, "x".repeat(64), tokenAad("u1", "github"))));
check("tampered ciphertext fails", await throws(() => decryptToken(ct.slice(0, -4) + "AAAA", key, tokenAad("u1", "github"))));
check("short key rejected", await throws(() => encryptToken("t", "short", "a")));
check("same token encrypts differently each time", ct !== (await encryptToken("gho_secret", key, tokenAad("u1", "github"))));

console.log("\nconnections: state");
const s1 = randomState(), s2 = randomState();
check("state is 64 hex chars", /^[0-9a-f]{64}$/.test(s1));
check("states are unique", s1 !== s2);
check("stored hash differs from raw state", (await hashState(s1)) !== s1);
check("hash is deterministic", (await hashState(s1)) === (await hashState(s1)));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
