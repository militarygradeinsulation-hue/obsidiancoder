// Production adapter for finalize-candidate: calls the metered /api/qa
// route via authFetch (attaches the Supabase bearer, surfaces 401/402 as
// obs:paywall events).
//
// Every failure path — transport, non-JSON, schema-non-conforming JSON,
// paywall, other HTTP status — is normalised into a STRICT QaRouteError
// so the finalizer receives exactly one shape and can cache the decision
// without ever spinning a second physical call. Never returns null.

import { authFetch } from "./auth-fetch";
import type { QaProductionCall } from "./finalize-candidate";
import { qaResponseSchema, type QaRouteResponse } from "./qa-contract";

function err(code: "paywall" | "qa_bad_response" | "qa_route_error", message: string): QaRouteResponse {
  return {
    ok: false,
    code,
    message: message.slice(0, 400),
    actualModel: null,
    providerInvoked: false,
    requestId: "",
  };
}

export const productionQaCall: QaProductionCall = async (req) => {
  let res: Response;
  try {
    res = await authFetch("/api/qa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch (e) {
    return err("qa_route_error", `transport: ${(e as Error)?.message ?? "unknown"}`);
  }

  if (res.status === 401 || res.status === 402) {
    return err("paywall", `HTTP ${res.status}`);
  }
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    return err("qa_bad_response", `non-JSON response (${res.status})`);
  }
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return err("qa_bad_response", `JSON parse failed (${res.status})`);
  }
  const parsed = qaResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      "qa_bad_response",
      `schema: ${parsed.error.issues[0]?.message ?? "invalid QA envelope"}`,
    );
  }
  return parsed.data;
};
