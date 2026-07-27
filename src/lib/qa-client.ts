// Production adapter for finalize-candidate: calls the metered /api/qa
// route via authFetch (attaches the Supabase bearer, surfaces 401/402 as
// obs:paywall events). Returns null on transport failure — finalize-
// candidate treats that as a block without a second call.

import { authFetch } from "./auth-fetch";
import type { QaProductionCall, QaRouteResponse } from "./finalize-candidate";

export const productionQaCall: QaProductionCall = async (req) => {
  try {
    const res = await authFetch("/api/qa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (res.status === 401 || res.status === 402) {
      // authFetch already dispatched obs:paywall. Return a structured
      // block so the finalizer never spins.
      return { ok: false, code: "paywall", message: `HTTP ${res.status}`, actualModel: null, requestId: "" };
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) return null;
    const j = (await res.json()) as QaRouteResponse;
    return j;
  } catch {
    return null;
  }
};
