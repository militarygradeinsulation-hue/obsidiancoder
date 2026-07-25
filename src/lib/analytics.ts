// Lightweight client-side analytics. Fires custom DOM events + posts to
// a same-origin endpoint if available. Silent-fail — never blocks UX.

export type AnalyticsEvent =
  | "home_visit"
  | "build_free_click"
  | "build_start"
  | "first_preview"
  | "successful_build"
  | "upgrade_view"
  | "checkout_start"
  | "checkout_started"
  | "checkout_completed"
  | "checkout_cancelled"
  | "purchase"
  | "return_visit"
  | "onboarding_start"
  | "onboarding_complete"
  | "pricing_configurator_viewed"
  | "pricing_amount_changed"
  | "pricing_anchor_selected"
  | "try_pro_5_clicked"
  | "trial_started"
  | "trial_upgraded_to_creator"
  | "standard_plan_card_selected";


const SEEN_KEY = "obs:analytics:visited";

export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const payload = { event, props: props ?? {}, t: Date.now(), path: window.location.pathname };
    window.dispatchEvent(new CustomEvent("obs:analytics", { detail: payload }));
    // Best-effort beacon; ignore result.
    if ("sendBeacon" in navigator) {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon("/api/public/analytics", blob);
    }
    // Console visibility for debugging in dev.
    // eslint-disable-next-line no-console
    console.debug("[analytics]", event, props ?? {});
  } catch { /* noop */ }
}

/** Fires home_visit or return_visit on first call per session. */
export function trackHomeVisit(): void {
  if (typeof window === "undefined") return;
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    if (seen) track("return_visit");
    else {
      localStorage.setItem(SEEN_KEY, String(Date.now()));
      track("home_visit");
    }
  } catch {
    track("home_visit");
  }
}
