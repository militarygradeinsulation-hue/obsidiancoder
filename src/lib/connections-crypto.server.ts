// AES-256-GCM token envelope using Web Crypto (works on workerd and Node).
// Format: "v1." + base64(iv[12] | ciphertext+tag). Key = SHA-256(secret).

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) throw new Error("token_key_missing");
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(
  plaintext: string,
  secret: string,
  aad: string,
): Promise<string> {
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
      key,
      enc.encode(plaintext),
    ),
  );
  const buf = new Uint8Array(iv.length + ct.length);
  buf.set(iv);
  buf.set(ct, iv.length);
  return "v1." + b64(buf);
}

export async function decryptToken(stored: string, secret: string, aad: string): Promise<string> {
  if (!stored.startsWith("v1.")) throw new Error("token_format");
  const buf = unb64(stored.slice(3));
  const key = await importKey(secret);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buf.slice(0, 12), additionalData: enc.encode(aad) },
    key,
    buf.slice(12),
  );
  return dec.decode(pt);
}

export function randomState(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function hashState(state: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(state)));
  return Array.from(h, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** AAD binds a ciphertext to its owner+provider so rows can't be swapped. */
export function tokenAad(userId: string, provider: string): string {
  return `${provider}:${userId}`;
}
