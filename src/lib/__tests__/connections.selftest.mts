import { PROVIDERS, getProvider, callbackMessage, GITHUB_SCOPES, OAUTH_STATE_TTL_MS } from "../connections-catalog";
import { encryptToken, decryptToken, randomState, hashState, tokenAad, bindingHash } from "../connections-crypto.server";
import { precheckCallback, readCookie, clearLinkCookieHeader, LINK_COOKIE, LINK_COOKIE_MAX_AGE_S } from "../connections-cookie";
import { readFileSync } from "node:fs";

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

console.log("\nconnections: browser binding");
const st = randomState(), nonce = randomState();
const good = `foo=1; ${LINK_COOKIE}=${nonce}; bar=2`;
check("cookie uses __Host- prefix", LINK_COOKIE.startsWith("__Host-"));
check("cookie lifetime matches state TTL", LINK_COOKIE_MAX_AGE_S * 1000 === OAUTH_STATE_TTL_MS);
check("valid state + cookie passes precheck", precheckCallback(st, good).ok === true);
const miss = precheckCallback(st, "foo=1");
check("missing cookie fails closed", !miss.ok && miss.code === "missing_binding");
check("no cookie header fails closed", !precheckCallback(st, null).ok);
check("malformed cookie fails closed", !precheckCallback(st, `${LINK_COOKIE}=abc`).ok);
check("duplicated cookie fails closed", readCookie(`${LINK_COOKIE}=${nonce}; ${LINK_COOKIE}=${randomState()}`, LINK_COOKIE) === null);
const badState = precheckCallback("nothex", good);
check("malformed state rejected before cookie", !badState.ok && badState.code === "invalid_state");
const b1 = await bindingHash(nonce, st, "github");
check("binding is 64-hex", /^[0-9a-f]{64}$/.test(b1));
check("binding deterministic for same browser", b1 === (await bindingHash(nonce, st, "github")));
check("other browser's nonce mismatches", b1 !== (await bindingHash(randomState(), st, "github")));
check("binding is per-state", b1 !== (await bindingHash(nonce, randomState(), "github")));
check("binding is per-provider", b1 !== (await bindingHash(nonce, st, "google")));
check("binding differs from state hash", b1 !== (await hashState(st)));
const clr = clearLinkCookieHeader();
check("clear header expires cookie securely", clr.includes("Max-Age=0") && clr.includes("HttpOnly") && clr.includes("Secure") && clr.includes("SameSite=Lax"));
check("missing_binding has its own message", callbackMessage("missing_binding") !== callbackMessage("error"));

console.log("\nconnections: source guards");
const cb = readFileSync(new URL("../../routes/api/public/connections.github.callback.ts", import.meta.url), "utf8");
const fn = readFileSync(new URL("../connections.functions.ts", import.meta.url), "utf8");
check("callback uses bound consumer only", cb.includes("consume_connection_oauth_state_v2") && !/consume_connection_oauth_state"/.test(cb));
check("callback prechecks cookie before consuming", cb.indexOf("precheckCallback(") < cb.indexOf(".rpc("));
check("callback never redirects to a query-supplied URL", !/searchParams\.get\("(redirect|return|next)/.test(cb));
check("callback never reads owner id from query", !/searchParams\.get\("(user|uid|owner)/.test(cb));
check("start sets HttpOnly Secure Lax cookie", /httpOnly: true/.test(fn) && /secure: true/.test(fn) && /sameSite: "lax"/.test(fn));
check("disconnect invalidates pending states first", fn.indexOf('from("connection_oauth_states")\n      .delete()') > 0 && fn.indexOf('from("connection_oauth_states")\n      .delete()') < fn.indexOf('from("connection_token_vault")\n      .delete()'));
check("rate-limit count error fails closed", /countErr \|\| count === null/.test(fn));
check("no module-scope admin import in functions", !/^import .*client\.server/m.test(fn) && !/^import .*client\.server/m.test(cb));
check("token never returned from functions", !/access_token|ciphertext:\s*v|return \{[^}]*token/.test(fn));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
