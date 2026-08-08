// Attaches the current Supabase user bearer to same-origin API calls so
// server routes can meter credits per user. Never sends the bearer to any
// other origin.
//
// Additionally, when the server returns 401 (auth_required) or 402
// (credits_required / not_pro), we dispatch a global `obs:paywall` window
// event carrying the parsed envelope. The app listens once and opens the
// PricingModal without losing the user's in-flight work.

import { supabase } from "@/integrations/supabase/client";
import { isCreditsRequiredEnvelope, type CreditsRequiredEnvelope } from "./credit-gate";
import { getAccountCode, isFullAccessCode } from "./account-code";

/**
 * Must stay in sync with OWNER_CODE_HEADER in credit-gate.server.ts.
 * Declared locally rather than imported: that module is server-only and
 * pulls in the Supabase service-role client, which must never reach the
 * browser bundle.
 */
const OWNER_CODE_HEADER = "x-obsidian-owner-code";

export async function currentAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Fired by authFetch on any 401/402 from same-origin routes. */
export interface ObsPaywallDetail {
  envelope: CreditsRequiredEnvelope;
  status: number;
  url: string;
}

function isSameOrigin(input: RequestInfo | URL): boolean {
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (url.startsWith("/")) return true;
    return new URL(url).origin === window.location.origin;
  } catch { return false; }
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = await currentAccessToken();
  const headers = new Headers(init.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  // Owner/admin fallback: the server recognizes owner status from an
  // httpOnly session cookie, but that cookie can lapse (eviction, cleared
  // site data, in-app webviews) while the app's own UI still shows admin
  // — it reads a separate localStorage code. When they disagree, the
  // owner gets HTTP 402 on routes they should never be charged for.
  // Sending the same full-access code the cookie was set from, verified
  // server-side the same way, closes that gap. Same-origin only — this
  // never leaves our own domain.
  if (isSameOrigin(input) && !headers.has(OWNER_CODE_HEADER)) {
    try {
      const code = getAccountCode();
      if (isFullAccessCode(code)) headers.set(OWNER_CODE_HEADER, code);
    } catch { /* storage unavailable — fall back to the cookie alone */ }
  }
  const response = await fetch(input, {
    ...init,
    headers,
    // Explicit rather than relying on the default, so the gate cookie is
    // always sent on these calls.
    credentials: init.credentials ?? "same-origin",
  });

  if ((response.status === 401 || response.status === 402) && isSameOrigin(input) && typeof window !== "undefined") {
    // Best-effort read of the envelope. We clone so the caller can still
    // read the body normally.
    try {
      const clone = response.clone();
      const ct = (clone.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("application/json")) {
        const body = (await clone.json()) as unknown;
        if (isCreditsRequiredEnvelope(body)) {
          window.dispatchEvent(new CustomEvent<ObsPaywallDetail>("obs:paywall", {
            detail: {
              envelope: body,
              status: response.status,
              url: typeof input === "string" ? input : (input as { url?: string }).url ?? String(input),
            },
          }));
        }
      }
    } catch { /* swallow — best-effort surfacing */ }
  }

  return response;
}
